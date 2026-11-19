"use client";

import { ArrowUpRight, Brush, Circle, Hand, Maximize, Minus, Redo2, Square, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ACCENT_COLOR_PRESETS } from "@/components/AccentColorOptions";
import { AdvancedNumberInput } from "@/components/AdvancedNumberFields";
import { uiText } from "@/lib/kercadI18n";
import { useAppAccent } from "@/lib/useAppAccent";
import styles from "./ChallengeImageEditor.module.css";

const tools = { brush: Brush, line: Minus, arrow: ArrowUpRight, rectangle: Square, circle: Circle };
type Tool = keyof typeof tools;
type Point = { x: number; y: number };
type Mark = { tool: Tool; points: Point[]; color: string; alpha: number; width: number };
type Drag = { id: number; start: Point; pan: Point } | { id: number; mark: Mark };
const origin = { x: 0, y: 0 };

function paint(ctx: CanvasRenderingContext2D, { tool, points, color, alpha, width }: Mark) {
  const first = points[0], last = points[points.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  if (tool === "rectangle") {
    ctx.rect(first.x, first.y, dx, dy);
  } else if (tool === "circle") {
    const radius = Math.hypot(dx, dy);
    if (radius) ctx.arc(first.x, first.y, radius, 0, 2 * Math.PI);
  } else if (tool === "brush" && points.length === 1) {
    ctx.arc(first.x, first.y, width / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
    return;
  } else {
    ctx.moveTo(first.x, first.y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    if (tool === "arrow" && (dx || dy)) {
      const angle = Math.atan2(dy, dx), size = Math.min(Math.hypot(dx, dy) * .5, width * 4);
      ctx.moveTo(last.x - size * Math.cos(angle - .5), last.y - size * Math.sin(angle - .5));
      ctx.lineTo(last.x, last.y);
      ctx.lineTo(last.x - size * Math.cos(angle + .5), last.y - size * Math.sin(angle + .5));
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function ChallengeImageEditor({ image, onCancel, onSave }: { image: string; onCancel: () => void; onSave: (image: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef(0);
  const { accent } = useAppAccent();
  const [tool, setTool] = useState<Tool | "pan">("brush");
  const [width, setWidth] = useState(6);
  const [color, setColor] = useState(accent);
  const [alpha, setAlpha] = useState(100);
  const [size, setSize] = useState<Point>(origin);
  const [available, setAvailable] = useState<Point>(origin);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>(origin);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<{ frames: Mark[][]; index: number }>({ frames: [[]], index: 0 });
  const marks = history.frames[history.index];
  const fit = Math.min(1, (available.x - 16) / size.x, (available.y - 16) / size.y);
  const scale = size.x && available.x ? Math.max(.01, fit) * zoom : 1;
  const t = (name: string) => uiText("challenge.imageEditor." + name);
  const render = () => {
    const ctx = canvas.current?.getContext("2d"), original = source.current;
    if (!ctx || !original) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(original, 0, 0);
    for (const mark of marks) paint(ctx, mark);
    if (drag.current && "mark" in drag.current) paint(ctx, drag.current.mark);
  };
  const scheduleRender = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; render(); });
  };
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const observer = new ResizeObserver(([entry]) => setAvailable({ x: entry.contentRect.width, y: entry.contentRect.height }));
    if (viewport.current) observer.observe(viewport.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); element?.close(); };
  }, []);
  useEffect(() => {
    const original = new Image();
    original.onload = () => {
      if (!original.naturalWidth || !original.naturalHeight || original.naturalWidth * original.naturalHeight > 25_000_000) {
        setError(true);
        return;
      }
      source.current = original;
      setSize({ x: original.naturalWidth, y: original.naturalHeight });
    };
    original.onerror = () => setError(true);
    original.src = image;
    return () => { original.onload = null; original.onerror = null; source.current = null; };
  }, [image]);
  useEffect(() => { render(); }, [size, marks]);

  const commit = (next: Mark[]) => setHistory((current) => ({ frames: [...current.frames.slice(0, current.index + 1), next], index: current.index + 1 }));
  const moveHistory = (offset: number) => {
    if (drag.current) return;
    setHistory((current) => ({ ...current, index: Math.max(0, Math.min(current.frames.length - 1, current.index + offset)) }));
  };
  const point = (event: PointerEvent) => {
    const bounds = canvas.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * size.x / bounds.width, y: (event.clientY - bounds.top) * size.y / bounds.height };
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!size.x || drag.current || event.button !== 0 || (tool !== "pan" && event.target !== canvas.current)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan") drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, pan };
    else {
      drag.current = { id: event.pointerId, mark: { tool, points: [point(event)], color, alpha: alpha / 100, width } };
      scheduleRender();
    }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.id) return;
    if ("mark" in active) {
      const current = point(event);
      if (active.mark.tool === "brush") {
        if (active.mark.points.length < 20000) active.mark.points.push(current);
        else active.mark.points[active.mark.points.length - 1] = current;
      } else active.mark.points[1] = current;
      scheduleRender();
    } else setPan({ x: active.pan.x + event.clientX - active.start.x, y: active.pan.y + event.clientY - active.start.y });
  };
  const end = (event: PointerEvent<HTMLDivElement>, save: boolean) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.id) return;
    if (save && "mark" in active) {
      const { mark } = active;
      if (mark.tool !== "brush") mark.points[1] = point(event);
      if (mark.tool === "brush" || mark.points[0].x !== mark.points[1].x || mark.points[0].y !== mark.points[1].y) commit([...marks, mark]);
    }
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    render();
  };
  const saveImage = () => {
    if (!canvas.current || drag.current) return;
    if (!marks.length) { onSave(image); return; }
    render();
    try {
      const output = canvas.current.toDataURL("image/png");
      if (output === "data:,") throw new Error();
      onSave(output);
    } catch { setError(true); }
  };
  const button = (key: string, Icon: typeof Brush, action: () => void, active?: boolean, disabled = false) => <button key={key} type="button" aria-pressed={active} disabled={disabled} title={t(key)} aria-label={t(key)} onClick={action}><Icon size={18} /></button>;
  return <dialog ref={dialog} className={styles.dialog} aria-label={t("title")} onCancel={(event) => { event.preventDefault(); onCancel(); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && !(event.target instanceof HTMLInputElement) && ["z", "y"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        moveHistory(event.shiftKey || event.key.toLowerCase() === "y" ? 1 : -1);
      }
    }}>
    <header className={styles.bar}><strong>{t("title")}</strong>{button("cancel", X, onCancel)}</header>
    <div className={styles.bar}>
      <div className={styles.group}>{(Object.keys(tools) as Tool[]).map((key) => button(key, tools[key], () => setTool(key), key === tool))}</div>
      <div className={styles.width}><AdvancedNumberInput ariaLabel={t("width")} value={width} min={1} max={100} unit="px" displayUnit="mm" step={1} onCommit={setWidth} /></div>
      <div className={styles.group}>{[...new Set([accent, ...ACCENT_COLOR_PRESETS])].map((swatch) => <button className={styles.swatch} key={swatch} type="button" style={{ backgroundColor: swatch }} title={swatch} aria-label={swatch} aria-pressed={color === swatch && alpha === 100} onClick={() => { setColor(swatch); setAlpha(100); }} />)}</div>
      <div className={styles.group}><label className={styles.custom} title={t("custom")}><input type="color" aria-label={t("custom")} value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <div className={styles.width}><AdvancedNumberInput ariaLabel={t("opacity")} value={alpha} min={0} max={100} unit="%" displayUnit="mm" step={1} onCommit={setAlpha} /></div></div>
      <div className={styles.group}>{button("undo", Undo2, () => moveHistory(-1), undefined, history.index === 0)}{button("redo", Redo2, () => moveHistory(1), undefined, history.index === history.frames.length - 1)}{button("clear", Trash2, () => commit([]), undefined, !marks.length)}</div>
    </div>
    <div ref={viewport} className={styles.viewport} data-pan={tool === "pan"} onPointerDown={begin} onPointerMove={move} onPointerUp={(event) => end(event, true)} onPointerCancel={(event) => end(event, false)} onLostPointerCapture={(event) => end(event, false)}>
      {error && <p className={styles.error} role="alert">{t("error")}</p>}
      <canvas ref={canvas} hidden={!size.x} width={size.x} height={size.y} style={{ width: size.x * scale, height: size.y * scale, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }} />
    </div>
    <footer className={styles.bar}><div className={styles.group}>
      {button("zoomOut", ZoomOut, () => setZoom((value) => Math.max(.25, value / 1.25)), undefined, zoom <= .25)}
      {button("zoomIn", ZoomIn, () => setZoom((value) => Math.min(8, value * 1.25)), undefined, zoom >= 8)}
      {button("fit", Maximize, () => { setZoom(1); setPan(origin); })}
      {button("pan", Hand, () => setTool(tool === "pan" ? "brush" : "pan"), tool === "pan")}
    </div><div className={styles.group}>
      <button type="button" onClick={onCancel}>{t("cancel")}</button>
      <button className={styles.primary} type="button" onClick={saveImage} disabled={!size.x}>{t("save")}</button>
    </div></footer>
  </dialog>;
}
