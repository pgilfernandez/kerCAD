"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CaptureCrop } from "@/lib/viewportCapture";
import { uiText, type KercadLocale } from "@/lib/kercadI18n";

const ASPECT = 1200 / 750;
type Rect = { x: number; y: number; width: number; height: number };
type Corner = "nw" | "ne" | "sw" | "se";

export function ChallengeCaptureFrame({ locale, onCapture, onCancel }: { locale: KercadLocale; onCapture: (crop: CaptureCrop) => void; onCancel: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; rect: Rect; corner?: Corner } | null>(null);
  useEffect(() => {
    const element = host.current; if (!element) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      setBounds({ width, height });
      setRect((current) => {
        const w = Math.min(current?.width ?? width * .65, width, height * ASPECT);
        const h = w / ASPECT;
        return { x: Math.max(0, Math.min(current?.x ?? (width - w) / 2, width - w)), y: Math.max(0, Math.min(current?.y ?? (height - h) / 2, height - h)), width: w, height: h };
      });
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onCancel(); } };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [onCancel]);
  const begin = (event: PointerEvent<HTMLElement>, corner?: Corner) => {
    if (!rect || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect: { ...rect }, corner };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const action = drag.current; if (!action || action.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - action.x, dy = event.clientY - action.y;
    const r = action.rect;
    if (!action.corner) {
      setRect({ ...r, x: Math.max(0, Math.min(bounds.width - r.width, r.x + dx)), y: Math.max(0, Math.min(bounds.height - r.height, r.y + dy)) });
      return;
    }
    const west = action.corner.includes("w"), north = action.corner.includes("n");
    const anchorX = west ? r.x + r.width : r.x, anchorY = north ? r.y + r.height : r.y;
    const sx = west ? -1 : 1, sy = north ? -1 : 1;
    const desired = r.width + (sx * dx + sy * dy / ASPECT) / (1 + 1 / ASPECT ** 2);
    const maximum = Math.min(west ? anchorX : bounds.width - anchorX, (north ? anchorY : bounds.height - anchorY) * ASPECT);
    const width = Math.max(Math.min(120, maximum), Math.min(maximum, desired)), height = width / ASPECT;
    setRect({ x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height });
  };
  const finish = (event: PointerEvent<HTMLElement>, cancel = false) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    if (cancel) setRect(drag.current.rect);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={host} className="kercad-capture-overlay">
    {rect && bounds.width > 0 && <div className="kercad-capture-frame" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} onPointerDown={(event) => begin(event)} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}>
      {(["nw", "ne", "sw", "se"] as const).map((corner) => <button key={corner} type="button" className={`kercad-capture-corner ${corner}`} aria-label={uiText("ui.challengecaptureframe.resize.capture.frame.47abc1", {}, locale)} onPointerDown={(event) => begin(event, corner)} />)}
      <button type="button" className="kercad-capture-shutter" title={uiText("ui.challengecaptureframe.capture.image.1200.750.px.1c378c", {}, locale)} aria-label={uiText("project.captureCover", {}, locale)} onPointerDown={(event) => event.stopPropagation()} onClick={() => onCapture({ x: rect.x / bounds.width, y: rect.y / bounds.height, width: rect.width / bounds.width, height: rect.height / bounds.height })}><Camera size={38} /></button>
      <button type="button" className="kercad-capture-cancel" title={uiText("ui.challengecaptureframe.cancel.capture.657d36", {}, locale)} aria-label={uiText("ui.challengecaptureframe.cancel.capture.657d36", {}, locale)} onPointerDown={(event) => event.stopPropagation()} onClick={onCancel}><X size={20} /></button>
    </div>}
  </div>;
}
