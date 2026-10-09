"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ParametricAnnotation } from "@/types/parametric";
import type { ParametricDisplayUnit } from "@/lib/parametricUnits";
import { displayUnitLabel, formatDisplayLength } from "@/lib/parametricUnits";
import { annotationAngleGeometry, annotationLabelInfo, annotationPosition, type AnnotationPoint } from "@/lib/annotationGeometry";
import { annotationDimensionPreset, type AnnotationTool } from "@/lib/annotationPresets";
import { educadTranslate, type EducadLocale } from "@/lib/educadI18n";

export function sketchAnnotationFromPicks(tool: AnnotationTool, picks: Array<{ x: number; y: number }>, locale: EducadLocale): ParametricAnnotation {
  const point = (index: number) => ({ ...picks[Math.min(index, picks.length - 1)], z: 0 });
  const common = { id: crypto.randomUUID(), name: educadTranslate(locale, `annotation.${tool}`), visible: true };
  if (tool === "text") return { ...common, kind: "text", position: point(0), text: "eduCAD", size: 6, font: "Arial", alignment: "center", color: "#000000" };
  if (tool === "circle") return { ...common, kind: "circle", position: point(0), radius: Math.max(0.1, Math.hypot(point(1).x - point(0).x, point(1).y - point(0).y)), rotation: { x: 0, y: 0, z: 0 }, mode: "planar", color: "#233c52", lineWidth: 2 };
  if (tool === "angle") return { ...common, kind: "angle", start: point(0), center: point(1), end: point(2), size: 3, color: "#233c52" };
  return { ...common, kind: "dimension", start: point(0), end: point(1), size: 3, ...annotationDimensionPreset(tool) };
}

type Props = {
  annotations: ParametricAnnotation[];
  preview?: ParametricAnnotation | null;
  selectedId: string | null;
  screenUnit: number;
  zoom: number;
  snapSpacing: number;
  displayUnit: ParametricDisplayUnit;
  locale?: EducadLocale;
  pointFromEvent: (event: { clientX: number; clientY: number }) => { x: number; z: number } | null;
  onSelect: (id: string | null) => void;
  onCommit: (annotation: ParametricAnnotation) => void;
};

export function SketchAnnotationLayer({ annotations, preview, selectedId, screenUnit, zoom, snapSpacing, displayUnit, locale = "en", pointFromEvent, onSelect, onCommit }: Props) {
  const [moving, setMoving] = useState<ParametricAnnotation | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const editingRef = useRef(editing); editingRef.current = editing;
  const annotationsRef = useRef(annotations); annotationsRef.current = annotations;
  const textInput = useRef<HTMLTextAreaElement>(null);
  const finishText = (accept = true) => {
    const current = editingRef.current; if (!current) return;
    editingRef.current = null; setEditing(null);
    const annotation = annotationsRef.current.find((entry) => entry.id === current.id);
    if (accept && annotation?.kind === "text" && annotation.text !== current.text) onCommit({ ...annotation, text: current.text });
  };
  useEffect(() => {
    if (!editing?.id) return;
    const frame = requestAnimationFrame(() => { textInput.current?.focus(); textInput.current?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [editing?.id]);
  useEffect(() => { if (editingRef.current && editingRef.current.id !== selectedId) finishText(); }, [selectedId]);
  useEffect(() => {
    if (!editing?.id) return;
    const outside = (event: globalThis.PointerEvent) => {
      const entry = event.target instanceof Element ? event.target.closest("[data-sketch-annotation]") : null;
      if (entry?.getAttribute("data-sketch-annotation") !== editingRef.current?.id) finishText();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [editing?.id]);
  const drag = useRef<{ annotation: ParametricAnnotation; point: AnnotationPoint | "position" | "radius" | "lineWidth" | "size" | null; origin: { x: number; y: number }; pointerId: number; latest: ParametricAnnotation | null } | null>(null);
  const measure = useRef<CanvasRenderingContext2D | null>(null);
  if (!measure.current && typeof document !== "undefined") measure.current = document.createElement("canvas").getContext("2d");
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.stopImmediatePropagation(); drag.current = null; setMoving(null); } };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, []);
  const begin = (event: PointerEvent<SVGElement>, annotation: ParametricAnnotation, point: NonNullable<typeof drag.current>["point"]) => {
    if (editingRef.current?.id === annotation.id) { event.stopPropagation(); return; }
    if (event.button !== 0) return;
    const origin = pointFromEvent(event); if (!origin) return;
    event.preventDefault(); event.stopPropagation(); onSelect(annotation.id);
    drag.current = { annotation: structuredClone(annotation), point, origin: { x: origin.x, y: origin.z }, pointerId: event.pointerId, latest: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<SVGGElement>) => {
    const action = drag.current; if (!action || action.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointFromEvent(event); if (!point) return;
    const next = structuredClone(action.annotation);
    if (action.point === "radius" && next.kind === "circle") {
      const radius = Math.hypot(point.x - next.position.x, point.z - next.position.y);
      next.radius = Math.max(0.1, snapSpacing > 0 ? Math.round(radius / snapSpacing) * snapSpacing : radius);
    }
    else if (action.point === "lineWidth" && next.kind === "circle") {
      next.lineWidth = Math.max(0.5, Math.min(20, Math.round((action.annotation.kind === "circle" ? action.annotation.lineWidth + point.z - action.origin.y : 2) * 10) / 10));
    }
    else if (action.point === "size") {
      const size = (action.annotation.size ?? 3) + point.x - action.origin.x;
      next.size = Math.max(0.1, Math.min(1000, snapSpacing > 0 ? Math.round(size / snapSpacing) * snapSpacing : size));
    }
    else if (action.point && action.point !== "radius" && action.point !== "lineWidth") {
      const target = annotationPosition(next, action.point === "position" ? null : action.point);
      if (target) { target.x = point.x; target.y = point.z; target.z = 0; }
    } else {
      const points = next.kind === "text" || next.kind === "circle" ? [next.position] : next.kind === "angle" ? [next.start, next.center, next.end] : [next.start, next.end];
      const anchor = next.kind === "angle" ? next.center : points[0];
      let dx = point.x - action.origin.x, dy = point.z - action.origin.y;
      if (snapSpacing > 0) { dx = Math.round((anchor.x + dx) / snapSpacing) * snapSpacing - anchor.x; dy = Math.round((anchor.y + dy) / snapSpacing) * snapSpacing - anchor.y; }
      for (const target of points) { target.x += dx; target.y += dy; }
    }
    action.latest = next; setMoving(next);
  };
  const finish = (event: PointerEvent<SVGGElement>, cancel = false) => {
    const action = drag.current; if (!action || action.pointerId !== event.pointerId) return;
    event.stopPropagation(); drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && action.latest) onCommit(action.latest);
    setMoving(null);
  };
  const visible = annotations.map((annotation) => moving?.id === annotation.id ? moving : annotation).filter((annotation) => annotation.visible).reverse();
  if (preview) visible.push(preview);
  return <g className="sketch-annotations" onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}>
    {visible.map((annotation) => {
      const selected = annotation.id === selectedId;
      const color = annotation.color ?? (annotation.kind === "text" ? "#000000" : "#233c52");
      const label = annotation.kind === "circle" && selected
        ? { position: { x: annotation.position.x + annotation.radius / 2, y: annotation.position.y, z: 0 }, text: `R ${formatDisplayLength(annotation.radius, displayUnit)} ${displayUnitLabel(displayUnit)}`, font: "Arial", alignment: "center" as const }
        : annotationLabelInfo(annotation.kind === "text" && editing?.id === annotation.id ? { ...annotation, text: editing.text } : annotation, displayUnit);
      const stroke = annotation.kind === "circle" ? annotation.lineWidth : 2;
      const polyline = annotation.kind === "dimension" ? `${annotation.start.x},${annotation.start.y} ${annotation.end.x},${annotation.end.y}` : annotation.kind === "angle" ? `${annotation.start.x},${annotation.start.y} ${annotation.center.x},${annotation.center.y} ${annotation.end.x},${annotation.end.y}` : "";
      const angle = annotation.kind === "angle" ? annotationAngleGeometry(annotation) : null;
      const arrow = (start: { x: number; y: number }, end: { x: number; y: number }, key: string) => {
        const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy); if (length < 0.001) return null;
        const size = Math.min(4, length / 3), x = dx / length, y = dy / length;
        return <polygon key={key} points={`${end.x},${end.y} ${end.x - x * size - y * size * .3},${end.y - y * size + x * size * .3} ${end.x - x * size + y * size * .3},${end.y - y * size - x * size * .3}`} fill={color} stroke="none" />;
      };
      const configuredLabelSize = annotation.size ?? 3;
      // Keep value labels readable at distant zooms and compact at close zooms.
      // Text annotations retain their explicitly chosen drawing size.
      const labelSize = annotation.kind !== "text"
        ? Math.max(12 * screenUnit, Math.min(28 * screenUnit, configuredLabelSize))
        : configuredLabelSize;
      const lines = label?.text.split("\n") ?? [];
      const context = measure.current;
      if (context) context.font = `48px ${label?.font ?? "Arial"}`;
      const width = Math.max(labelSize * 4 / 3, ...lines.map((line) => (context?.measureText(line).width ?? line.length * 28) / 48 * labelSize + labelSize * 4 / 3));
      const height = (lines.length * 4 / 3 + 1 / 3) * labelSize;
      const labelX = label?.alignment === "left" ? 0 : label?.alignment === "right" ? -width : -width / 2;
      const points: Array<AnnotationPoint | "position"> = annotation.kind === "text" || annotation.kind === "circle" ? ["position"] : annotation.kind === "angle" ? ["start", "center", "end"] : ["start", "end"];
      return <g key={annotation.id} data-sketch-annotation={annotation.id} style={{ cursor: editing?.id === annotation.id ? "text" : "move" }} opacity={preview?.id === annotation.id ? .65 : 1} onPointerDown={(event) => begin(event, annotation, null)} onDoubleClick={(event) => {
        if (annotation.kind !== "text" || editingRef.current?.id === annotation.id) return;
        event.preventDefault(); event.stopPropagation(); drag.current = null; setMoving(null); onSelect(annotation.id);
        const next = { id: annotation.id, text: annotation.text }; editingRef.current = next; setEditing(next);
      }}>
        {polyline && <polyline points={polyline} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" />}
        {angle && angle.degrees > .0001 && <polyline points={angle.arc.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" />}
        {annotation.kind === "circle" && <circle cx={annotation.position.x} cy={annotation.position.y} r={annotation.radius} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" />}
        {polyline && <polyline points={polyline} fill="none" stroke={color} strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeDasharray={annotation.kind === "dimension" && annotation.lineStyle === "dashed" ? `${54 * screenUnit * zoom} ${36 * screenUnit * zoom}` : undefined} />}
        {angle && angle.degrees > .0001 && <polyline points={angle.arc.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {annotation.kind === "dimension" && <>{annotation.startArrow !== false && arrow(annotation.end, annotation.start, "start")}{annotation.endArrow !== false && arrow(annotation.start, annotation.end, "end")}</>}
        {annotation.kind === "dimension" && annotation.startArrow !== false && annotation.endArrow !== false && (() => {
          const dx = annotation.end.x - annotation.start.x, dy = annotation.end.y - annotation.start.y, distance = Math.hypot(dx, dy);
          if (distance < .001) return null;
          const x = -dy / distance * 2, y = dx / distance * 2;
          return <>{[annotation.start, annotation.end].map((point, index) => <line key={index} x1={point.x - x} y1={point.y - y} x2={point.x + x} y2={point.y + y} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}</>;
        })()}
        {annotation.kind === "circle" && <circle cx={annotation.position.x} cy={annotation.position.y} r={annotation.radius} fill="none" stroke={color} strokeWidth={annotation.lineWidth} vectorEffect="non-scaling-stroke" />}
        {label && <g transform={`translate(${label.position.x} ${label.position.y}) scale(1 -1)`}>
          <rect x={labelX} y={-height / 2} width={width} height={height} rx={labelSize / 6} fill="#fff" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {annotation.kind === "text" && editing?.id === annotation.id && <foreignObject x={labelX} y={-height / 2} width={width} height={height}>
            <textarea ref={textInput} className="sketch-annotation-inline-editor" aria-label={educadTranslate(locale, "annotation.text")} maxLength={2000} value={editing.text} style={{ fontSize: labelSize, fontFamily: label.font, color, textAlign: label.alignment, padding: `${labelSize / 6}px ${labelSize * 2 / 3}px` }} onChange={(event) => { const next = { id: annotation.id, text: event.target.value }; editingRef.current = next; setEditing(next); }} onBlur={() => finishText()} onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finishText(); }
              if (event.key === "Escape") { event.preventDefault(); finishText(false); }
            }} />
          </foreignObject>}
          {editing?.id !== annotation.id && lines.map((line, index) => <text key={index} x={label.alignment === "left" ? labelX + labelSize * 2 / 3 : label.alignment === "right" ? labelX + width - labelSize * 2 / 3 : labelX + width / 2} y={-height / 2 + labelSize / 6 + labelSize * (index * 4 / 3 + 2 / 3)} dominantBaseline="middle" textAnchor={label.alignment === "left" ? "start" : label.alignment === "right" ? "end" : "middle"} style={{ fontSize: labelSize, fontFamily: label.font, fill: color, opacity: 1, fontWeight: 400, stroke: "none" }}>{line}</text>)}
        </g>}
        {selected && label && editing?.id !== annotation.id && <g transform={`translate(${label.position.x} ${label.position.y - height / 2 - 14 * screenUnit})`}>
          <line x1={0} x2={configuredLabelSize + 12 * screenUnit} y1={0} y2={0} stroke="#e0b800" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <line x1={0} x2={0} y1={-4 * screenUnit} y2={4 * screenUnit} stroke="#e0b800" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={configuredLabelSize + 12 * screenUnit} cy={0} r={8 * screenUnit} fill="#fff157" stroke="#e0b800" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={(event) => begin(event, annotation, "size")} />
        </g>}
        {selected && points.map((key) => {
          const point = annotationPosition(annotation, key === "position" ? null : key); if (!point) return null;
          return <circle key={key} cx={point.x} cy={point.y} r={6 * screenUnit} fill="#add8ff" stroke="#526579" strokeWidth={1} vectorEffect="non-scaling-stroke" onPointerDown={(event) => begin(event, annotation, key)} />;
        })}
        {selected && annotation.kind === "circle" && <circle cx={annotation.position.x + annotation.radius} cy={annotation.position.y} r={8 * screenUnit} fill="#fff157" stroke="#e0b800" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={(event) => begin(event, annotation, "radius")} />}
        {selected && annotation.kind === "circle" && <>
          <line x1={annotation.position.x} x2={annotation.position.x} y1={annotation.position.y + annotation.radius + 4} y2={annotation.position.y + annotation.radius + 4 + annotation.lineWidth} stroke="#e0b800" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={annotation.position.x} cy={annotation.position.y + annotation.radius + 4 + annotation.lineWidth} r={8 * screenUnit} fill="#fff157" stroke="#e0b800" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={(event) => begin(event, annotation, "lineWidth")} />
        </>}
      </g>;
    })}
  </g>;
}
