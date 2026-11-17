"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/** A separate overlay keeps the pointer outside scrollable popup clipping. */
export function PopupPointer({ panel, trigger, open }: { panel: string; trigger: string; open: boolean }) {
  const [shape, setShape] = useState<{ left: number; top: number; width: number; height: number; path: string; fill: string; stroke: string; z: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setShape(null); return; }
    const popup = document.querySelector<HTMLElement>(panel), button = document.querySelector<HTMLElement>(trigger);
    if (!popup || !button) return;
    const update = () => {
      const p = popup.getBoundingClientRect(), b = button.getBoundingClientRect();
      if (!p.width || !b.width) { setShape(null); return; }
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const style = getComputedStyle(popup);
      const header = popup.querySelector<HTMLElement>(":scope > header, #kercad-header-theme-heading");
      const headerStyle = header ? getComputedStyle(header) : style;
      const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
      const common = { fill: headerStyle.backgroundColor, stroke: style.borderTopColor, z: Math.max(101, Number(style.zIndex) || 0) + 1 };
      if (x < p.left || x > p.right) {
        const left = x < p.left;
        setShape({ ...common, left: left ? p.left - 8 : p.right - 1, top: clamp(y - 8, p.top + 10, p.bottom - 26), width: 9, height: 16, path: left ? "M9 0 L0 8 L9 16" : "M0 0 L9 8 L0 16" });
      } else {
        const above = y < p.top;
        setShape({ ...common, left: clamp(x - 8, p.left + 10, p.right - 26), top: above ? p.top - 8 : p.bottom - 1, width: 16, height: 9, path: above ? "M0 9 L8 0 L16 9" : "M0 0 L8 9 L16 0" });
      }
    };
    update();
    const resize = new ResizeObserver(update); resize.observe(popup); resize.observe(button);
    const theme = new MutationObserver(update); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { resize.disconnect(); theme.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, panel, trigger]);
  if (!open || !shape || typeof document === "undefined") return null;
  return createPortal(<svg aria-hidden="true" width={shape.width} height={shape.height} style={{ position: "fixed", left: shape.left, top: shape.top, zIndex: shape.z, pointerEvents: "none", overflow: "visible" }}><path d={shape.path} fill={shape.fill} stroke={shape.stroke} strokeWidth={1} /></svg>, document.body);
}
