"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ViewportFloatingNumberInput } from "@/components/ViewportFloatingNumberInput";
import { AnnotationIcon } from "@/components/AnnotationIcon";
import { OperationTreeIcon } from "@/components/OperationTreeIcon";
import { OBJECT_COLOR_PALETTE } from "@/lib/parametricObjects";
import { enableToolbarMouseScroll } from "@/lib/toolbarScroll";
import { educadTranslate, type EducadLocale } from "@/lib/educadI18n";
import type { ParametricAnnotation } from "@/types/parametric";
import type { ParametricDisplayUnit } from "@/lib/parametricUnits";

export function AnnotationToolbar({ embedded = false, annotation, displayUnit, snap, locale, onUpdate }: { embedded?: boolean; annotation: ParametricAnnotation; displayUnit: ParametricDisplayUnit; snap: number; locale: EducadLocale; onUpdate: (update: (annotation: ParametricAnnotation) => void) => void }) {
  const t = (key: Parameters<typeof educadTranslate>[1]) => educadTranslate(locale, key);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!embedded && toolbar.current) return enableToolbarMouseScroll(toolbar.current); }, [annotation.id, embedded]);
  const palette = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [palettePosition, setPalettePosition] = useState({ top: 0, left: 0 });
  const color = annotation.color ?? (annotation.kind === "text" ? "#000000" : "#233c52");
  useEffect(() => {
    if (!paletteOpen) return;
    const close = (event: globalThis.PointerEvent) => { if (event.target instanceof Node && !palette.current?.contains(event.target) && !popup.current?.contains(event.target)) setPaletteOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [paletteOpen]);
  const number = (value: number, label: string, unit: "length" | "scalar", change: (annotation: ParametricAnnotation, value: number) => void, min = .1, max = 1000) => <ViewportFloatingNumberInput value={value} unit={unit} displayUnit={displayUnit} snap={snap} label={label} min={min} max={max} onCommit={(value) => onUpdate((draft) => change(draft, value))} />;
  return <div ref={toolbar} className={`sketch-annotation-context-toolbar ${embedded ? "embedded" : ""}`} role="toolbar" aria-label={t("annotation.group")} onPointerDown={(event) => event.stopPropagation()}>
    {(annotation.kind !== "circle" || !embedded) && number(annotation.size ?? 3, t("annotation.size"), "length", (draft, value) => { draft.size = value; })}
    {annotation.kind === "circle" && <>{number(annotation.radius, t("property.radius"), "length", (draft, value) => { if (draft.kind === "circle") draft.radius = value; }, .1, 10000)}{number(annotation.lineWidth, t("annotation.lineWidth"), "scalar", (draft, value) => { if (draft.kind === "circle") draft.lineWidth = value; }, .5, 20)}</>}
    {embedded && annotation.kind === "circle" && <select className="educad-context-object-select" aria-label={t("annotation.mode")} title={t("annotation.mode")} value={annotation.mode} onChange={(event) => onUpdate((draft) => { if (draft.kind === "circle") draft.mode = event.target.value as "billboard" | "planar"; })}><option value="billboard">{t("annotation.billboard")}</option><option value="planar">{t("annotation.planar")}</option></select>}
    {annotation.kind === "text" && (["left", "center", "right"] as const).map((alignment) => <button key={alignment} type="button" className={annotation.alignment === alignment ? "active" : ""} aria-pressed={annotation.alignment === alignment} title={`${t("annotation.alignment")}: ${t(`annotation.${alignment}`)}`} aria-label={`${t("annotation.alignment")}: ${t(`annotation.${alignment}`)}`} onClick={() => onUpdate((draft) => { if (draft.kind === "text") draft.alignment = alignment; })}><AnnotationIcon size={34} kind={`align-${alignment}`} /></button>)}
    {annotation.kind === "dimension" && <>
      <button type="button" className={annotation.startArrow !== false ? "active" : ""} aria-pressed={annotation.startArrow !== false} title={t("annotation.startArrow")} aria-label={t("annotation.startArrow")} onClick={() => onUpdate((draft) => { if (draft.kind === "dimension") draft.startArrow = draft.startArrow === false; })}><span style={{ transform: "rotate(180deg)", display: "flex" }}><AnnotationIcon size={34} kind="arrow" /></span></button>
      <button type="button" className={annotation.endArrow !== false ? "active" : ""} aria-pressed={annotation.endArrow !== false} title={t("annotation.endArrow")} aria-label={t("annotation.endArrow")} onClick={() => onUpdate((draft) => { if (draft.kind === "dimension") draft.endArrow = draft.endArrow === false; })}><AnnotationIcon size={34} kind="arrow" /></button>
      <button type="button" className={annotation.lineStyle === "dashed" ? "active" : ""} aria-pressed={annotation.lineStyle === "dashed"} title={t("annotation.dashed")} aria-label={t("annotation.dashed")} onClick={() => onUpdate((draft) => { if (draft.kind === "dimension") draft.lineStyle = draft.lineStyle === "dashed" ? "solid" : "dashed"; })}><AnnotationIcon size={34} kind="dashedLine" /></button>
      <button type="button" className={annotation.showLength !== false ? "active" : ""} aria-pressed={annotation.showLength !== false} title={t("annotation.showLength")} aria-label={t("annotation.showLength")} onClick={() => onUpdate((draft) => { if (draft.kind === "dimension") draft.showLength = draft.showLength === false; })}><OperationTreeIcon size={34} file={annotation.showLength !== false ? "visible" : "hidden"} /></button>
    </>}

    <div className="sketch-annotation-color-control" ref={palette}>
      <button type="button" title={t("property.color")} aria-label={t("property.color")} aria-expanded={paletteOpen} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setPalettePosition({ top: Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - 190)), left: Math.max(8, Math.min(bounds.left, window.innerWidth - 248)) }); setPaletteOpen(!paletteOpen); }}><span className="educad-color-preview" style={{ "--object-color": color } as CSSProperties} /></button>
      {paletteOpen && createPortal(<div ref={popup} className="educad-color-palette sketch-annotation-color-popup" style={palettePosition}>
        {OBJECT_COLOR_PALETTE.map((entry) => <button key={entry} type="button" title={entry} aria-label={`${t("property.color")} ${entry}`} style={{ "--object-color": entry } as CSSProperties} onClick={() => { onUpdate((draft) => { draft.color = entry; }); setPaletteOpen(false); }} />)}
        <label className="educad-custom-color" title={t("property.customColor")}><input type="color" aria-label={t("property.customColor")} value={color} onChange={(event) => onUpdate((draft) => { draft.color = event.target.value; })} /><span>+</span></label>
      </div>, document.body)}
    </div>
  </div>;
}

export { AnnotationToolbar as SketchAnnotationToolbar };
