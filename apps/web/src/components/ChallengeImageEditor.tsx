"use client";

import { ArrowUpRight, Brush, createLucideIcon, Hand, Maximize, Minus, Redo2, Square, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ACCENT_COLOR_PRESETS } from "@/components/AccentColorOptions";
import { AdvancedNumberInput } from "@/components/AdvancedNumberFields";
import { uiText } from "@/lib/kercadI18n";
import { useAppAccent } from "@/lib/useAppAccent";
import styles from "./ChallengeImageEditor.module.css";

const Ellipse = createLucideIcon("Ellipse", [["ellipse", { cx: "12", cy: "12", rx: "10", ry: "7", key: "ellipse" }]]);
const tools = { brush: Brush, line: Minus, arrow: ArrowUpRight, rectangle: Square, ellipse: Ellipse };
type Tool = keyof typeof tools;
type Point = { x: number; y: number };
type Mark = { tool: Tool; points: Point[]; color: string; alpha: number; width: number };
type DrawDrag = { id: number; mark: Mark; bounds: DOMRect; paintedPoints: number };
type Drag = { id: number; start: Point; pan: Point } | DrawDrag;
const origin = { x: 0, y: 0 };
const MAX_PREVIEW_SIDE = 2048;

function paintBrushPreview(ctx: CanvasRenderingContext2D, active: DrawDrag) {
  const { mark, paintedPoints } = active;
  const { points, color, width } = mark;
  if (paintedPoints >= points.length) return;
  ctx.beginPath();
  if (points.length === 1) {
    ctx.fillStyle = color;
    ctx.arc(points[0].x, points[0].y, width / 2, 0, 2 * Math.PI);
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = ctx.lineCap = "round";
    const start = Math.max(0, paintedPoints - 1);
    ctx.moveTo(points[start].x, points[start].y);
    for (let i = start + 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  active.paintedPoints = points.length;
}

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
  } else if (tool === "ellipse") {
    if (dx && dy) ctx.ellipse(first.x + dx / 2, first.y + dy / 2, Math.abs(dx) / 2, Math.abs(dy) / 2, 0, 0, 2 * Math.PI);
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
  const preview = useRef<HTMLCanvasElement>(null);
  const paintedMarks = useRef<Mark[] | null>(null);
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
  const previewScale = size.x ? Math.min(1, MAX_PREVIEW_SIDE / Math.max(size.x, size.y)) : 1;
  const t = (name: string) => uiText("challenge.imageEditor." + name);
  const renderCommitted = () => {
    const ctx = canvas.current?.getContext("2d"), original = source.current;
    if (!ctx || !original) return;
    const previous = paintedMarks.current;
    let first = 0;
    if (previous && previous.length <= marks.length && previous.every((mark, index) => mark === marks[index])) {
      first = previous.length;
    } else {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(original, 0, 0);
    }
    for (let index = first; index < marks.length; index++) paint(ctx, marks[index]);
    paintedMarks.current = marks;
  };
  const clearPreview = (ctx = preview.current?.getContext("2d")) => {
    if (!ctx) return;
    ctx.resetTransform();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  };
  const renderPreview = () => {
    const ctx = preview.current?.getContext("2d"), active = drag.current;
    if (!ctx || !active || !("mark" in active)) return;
    const { mark } = active;
    if (mark.tool !== "brush") clearPreview(ctx);
    ctx.setTransform(ctx.canvas.width / size.x, 0, 0, ctx.canvas.height / size.y, 0, 0);
    // Apply opacity once to the whole preview, not to each brush segment.
    if (mark.tool === "brush") paintBrushPreview(ctx, active);
    else paint(ctx, { ...mark, alpha: 1 });
  };
  const scheduleRender = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; renderPreview(); });
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
      paintedMarks.current = null;
      source.current = original;
      setSize({ x: original.naturalWidth, y: original.naturalHeight });
    };
    original.onerror = () => setError(true);
    original.src = image;
    return () => { original.onload = null; original.onerror = null; source.current = null; };
  }, [image]);
  useLayoutEffect(() => { renderCommitted(); }, [size, marks]);

  const commit = (next: Mark[]) => setHistory((current) => ({ frames: [...current.frames.slice(0, current.index + 1), next], index: current.index + 1 }));
  const moveHistory = (offset: number) => {
    if (drag.current) return;
    setHistory((current) => ({ ...current, index: Math.max(0, Math.min(current.frames.length - 1, current.index + offset)) }));
  };
  const point = (event: { clientX: number; clientY: number }, bounds: DOMRect) => {
    return { x: (event.clientX - bounds.left) * size.x / bounds.width, y: (event.clientY - bounds.top) * size.y / bounds.height };
  };
  const appendBrushPoint = (active: DrawDrag, sample: { clientX: number; clientY: number }) => {
    const points = active.mark.points, next = point(sample, active.bounds);
    const last = points[points.length - 1];
    if (next.x === last.x && next.y === last.y) return;
    points.push(next);
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!size.x || drag.current || event.button !== 0 || (tool !== "pan" && event.target !== canvas.current)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan") drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, pan };
    else if (canvas.current && preview.current) {
      const bounds = canvas.current.getBoundingClientRect();
      preview.current.style.opacity = String(alpha / 100);
      drag.current = { id: event.pointerId, bounds, paintedPoints: 0, mark: { tool, points: [point(event, bounds)], color, alpha: alpha / 100, width } };
      scheduleRender();
    }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.id) return;
    if ("mark" in active) {
      if (active.mark.tool === "brush") {
        const samples = event.nativeEvent.getCoalescedEvents?.();
        if (samples?.length) for (const sample of samples) appendBrushPoint(active, sample);
        else appendBrushPoint(active, event);
      } else active.mark.points[1] = point(event, active.bounds);
      scheduleRender();
    } else setPan({ x: active.pan.x + event.clientX - active.start.x, y: active.pan.y + event.clientY - active.start.y });
  };
  const end = (event: PointerEvent<HTMLDivElement>, save: boolean) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.id) return;
    if (save && "mark" in active) {
      const { mark } = active;
      if (mark.tool === "brush") appendBrushPoint(active, event);
      else mark.points[1] = point(event, active.bounds);
      const start = mark.points[0], end = mark.points[1];
      if (mark.tool === "brush" || (mark.tool === "ellipse"
        ? start.x !== end.x && start.y !== end.y
        : start.x !== end.x || start.y !== end.y)) commit([...marks, mark]);
    }
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if ("mark" in active) clearPreview();
  };
  const saveImage = () => {
    if (!canvas.current || drag.current) return;
    if (!marks.length) { onSave(image); return; }
    renderCommitted();
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
      <div className={styles.image} hidden={!size.x} style={{ width: size.x * scale, height: size.y * scale, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }}>
        <canvas ref={canvas} width={size.x} height={size.y} />
        <canvas className={styles.preview} ref={preview} aria-hidden="true" width={Math.ceil(size.x * previewScale)} height={Math.ceil(size.y * previewScale)} />
      </div>
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
