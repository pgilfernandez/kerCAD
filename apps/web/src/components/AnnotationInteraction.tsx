"use client";

import { useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import type { ParametricAnnotation, ParametricDocument, ParametricVector3 } from "@/types/parametric";
import { annotationDimensionPreset, type AnnotationTool } from "@/lib/annotationPresets";
import { annotationLabelInfo, annotationPosition, type AnnotationPoint } from "@/lib/annotationGeometry";
import type { ParametricDisplayUnit } from "@/lib/parametricUnits";

type Props = {
  host: RefObject<HTMLDivElement | null>;
  camera: RefObject<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>;
  model: RefObject<THREE.Group | null>;
  snapPoint: RefObject<(event: PointerEvent) => THREE.Vector3 | null>;
  positionHandleAtPointer: (event: PointerEvent) => boolean;
  workplane: ParametricDocument["workplane"];
  tool: AnnotationTool | null;
  selected?: ParametricAnnotation;
  editing: boolean;
  parameterHandlesVisible: boolean;
  displayUnit: ParametricDisplayUnit;
  positionManipulatorVisible: boolean;
  selectedEndpoint: AnnotationPoint | null;
  onSelectEndpoint: (endpoint: AnnotationPoint) => void;
  onMoveEndpoint: (id: string, endpoint: AnnotationPoint, position: ParametricVector3) => void;
  onMoveText: (id: string, position: ParametricVector3) => void;
  locale: "en" | "es";
  onPlace: (kind: AnnotationTool, start: ParametricVector3, end?: ParametricVector3, center?: ParametricVector3) => void;
  onFinish: (id: string, text: string, size: number) => void;
  onEdit: (id: string | null) => void;
  onCancelTool: () => void;
  onPreview: (annotation: ParametricAnnotation | null) => void;
};

export function AnnotationInteraction(props: Props) {
  const { host, camera, model, snapPoint, selected, editing, tool, locale, onPreview } = props;
  const current = useRef(props); current.current = props;
  const [text, setText] = useState("");
  const [size, setSize] = useState(6);
  const [snapped, setSnapped] = useState<THREE.Vector3 | null>(null);
  const start = useRef<THREE.Vector3 | null>(null);
  const center = useRef<THREE.Vector3 | null>(null);
  const [angleStage, setAngleStage] = useState(0);
  const editor = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const startMarker = useRef<HTMLButtonElement>(null);
  const endMarker = useRef<HTMLButtonElement>(null);
  const centerMarker = useRef<HTMLButtonElement>(null);
  const textMarker = useRef<HTMLButtonElement>(null);
  const [endpointDragging, setEndpointDragging] = useState(false);
  const endpointDrag = useRef<{
    annotation: ParametricAnnotation;
    endpoint: AnnotationPoint | "position"; pointerId: number; element: HTMLButtonElement;
    x: number; y: number; plane: THREE.Plane; offset: THREE.Vector3;
    latest: THREE.Vector3 | null;
  } | null>(null);
  const dragging = useRef<{ x: number; size: number; pointerId: number } | null>(null);
  const draft = useRef({ text, size }); draft.current = { text, size };
  const labelInfo = selected ? annotationLabelInfo(selected, props.displayUnit) : null;
  const currentLabel = useRef(labelInfo); currentLabel.current = labelInfo;
  const finish = () => {
    const active = current.current.selected;
    if (active) current.current.onFinish(active.id, draft.current.text, draft.current.size);
    current.current.onPreview(null);
  };
  const cancelEdit = () => {
    const active = current.current.selected;
    if (active?.kind === "text") { setText(active.text); setSize(active.size); draft.current = { text: active.text, size: active.size }; }
    current.current.onEdit(null); current.current.onPreview(null);
  };
  const cancelEndpointDrag = () => {
    const drag = endpointDrag.current;
    endpointDrag.current = null;
    if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
    setEndpointDragging(false); setSnapped(null); current.current.onPreview(null);
  };
  const rayAtPointer = (event: { clientX: number; clientY: number }) => {
    const cam = camera.current;
    const canvas = host.current?.querySelector("canvas");
    if (!cam || !canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    cam.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), cam);
    return ray.ray;
  };
  const beginEndpointDrag = (event: ReactPointerEvent<HTMLButtonElement>, endpoint: AnnotationPoint | "position") => {
    event.stopPropagation();
    if (event.button !== 0 || !selected || (endpoint === "position" ? selected.kind !== "text" : selected.kind === "text")) return;
    event.preventDefault();
    if (endpoint !== "position") props.onSelectEndpoint(endpoint);
    const root = model.current, cam = camera.current, ray = rayAtPointer(event);
    if (!root || !cam || !ray) return;
    const point = annotationPosition(selected, endpoint === "position" ? null : endpoint);
    if (!point) return;
    const world = root.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
    let normal = new THREE.Vector3(props.workplane.normal.x, props.workplane.normal.y, props.workplane.normal.z).transformDirection(root.matrixWorld);
    if (Math.abs(normal.dot(ray.direction)) < 0.05) normal = cam.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, world);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    endpointDrag.current = { annotation: structuredClone(selected), endpoint, element: event.currentTarget, pointerId: event.pointerId, x: event.clientX, y: event.clientY, plane, offset: world.clone().sub(hit), latest: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveEndpointDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = endpointDrag.current, root = model.current;
    if (!drag || drag.pointerId !== event.pointerId || !root) return;
    event.preventDefault(); event.stopPropagation();
    if (!drag.latest && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
    const target = snapPoint.current?.(event.nativeEvent) ?? null;
    setSnapped((previous) => previous && target && previous.distanceToSquared(target) < 1e-12 ? previous : target?.clone() ?? null);
    let point = target?.clone() ?? null;
    if (!point) {
      const ray = rayAtPointer(event);
      const hit = ray?.intersectPlane(drag.plane, new THREE.Vector3());
      if (!hit) return;
      point = root.worldToLocal(hit.add(drag.offset));
      const plane = props.workplane;
      if (plane.snapToGrid) {
        const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
        const delta = point.clone().sub(origin);
        const axes = [plane.xAxis, plane.yAxis, plane.normal].map((axis) => new THREE.Vector3(axis.x, axis.y, axis.z));
        point.copy(origin);
        axes.forEach((axis, index) => point!.addScaledVector(axis, index < 2 ? Math.round(delta.dot(axis) / plane.snapSpacing) * plane.snapSpacing : delta.dot(axis)));
      }
    }
    drag.latest = point;
    setEndpointDragging(true);
    onPreview({ ...drag.annotation, [drag.endpoint]: { x: point.x, y: point.y, z: point.z } });
  };
  const finishEndpointDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = endpointDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    endpointDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.latest) {
      const point = { x: drag.latest.x, y: drag.latest.y, z: drag.latest.z };
      if (drag.endpoint === "position") props.onMoveText(drag.annotation.id, point);
      else props.onMoveEndpoint(drag.annotation.id, drag.endpoint, point);
    }
    setEndpointDragging(false); setSnapped(null); onPreview(null);
  };
  useEffect(() => {
    if (selected?.kind === "text") { setText(selected.text); setSize(selected.size); }
    else if (selected) setSize(selected.size ?? 3);
  }, [selected?.id, selected?.kind === "text" ? selected.text : null, selected?.size]);
  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [editing, selected?.id]);
  useEffect(() => { start.current = null; center.current = null; setAngleStage(0); setSnapped(null); onPreview(null); }, [tool, onPreview]);
  useEffect(() => {
    if (editing && selected?.kind === "text") onPreview({ ...selected, text: "" });
    return () => onPreview(null);
  }, [editing, selected?.id, onPreview]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const raycaster = new THREE.Raycaster();
    const pointAt = (event: PointerEvent) => {
      const p = current.current;
      const cam = camera.current, root = model.current;
      const canvas = element.querySelector("canvas");
      if (!cam || !root || !canvas) return null;
      if (p.tool === "dimension" || p.tool === "arrow" || p.tool === "dashedLine" || p.tool === "angle") {
        const target = snapPoint.current?.(event) ?? null;
        setSnapped((previous) => previous && target && previous.distanceToSquared(target) < 1e-12 ? previous : target?.clone() ?? null);
        if (target) return target;
      } else setSnapped(null);
      const bounds = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), cam);
      const origin = root.localToWorld(new THREE.Vector3(p.workplane.origin.x, p.workplane.origin.y, p.workplane.origin.z));
      const normal = new THREE.Vector3(p.workplane.normal.x, p.workplane.normal.y, p.workplane.normal.z).transformDirection(root.matrixWorld);
      const hit = raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin), new THREE.Vector3());
      if (!hit) return null;
      return root.worldToLocal(hit);
    };
    const move = (event: PointerEvent) => {
      const p = current.current;
      if (!p.tool || event.buttons !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
      const point = pointAt(event);
      if (point && start.current && p.tool !== "text") {
        const base = { id: "annotation-preview", name: "", visible: true, start: { ...start.current }, end: { ...point } };
        if (p.tool === "angle") {
          p.onPreview(center.current ? { ...base, kind: "angle", center: { ...center.current }, color: "#233c52" }
            : { ...base, kind: "dimension", color: "#233c52", startArrow: false, endArrow: false, showLength: false });
        } else p.onPreview({ ...base, kind: "dimension", ...annotationDimensionPreset(p.tool) });
      }
      event.stopPropagation();
    };
    const down = (event: PointerEvent) => {
      const p = current.current;
      if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement) || (!p.tool && !p.editing)) return;
      if (p.editing && p.positionHandleAtPointer(event)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (p.editing) { finish(); return; }
      const point = pointAt(event);
      if (!point) return;
      if (p.tool === "angle") {
        if (!start.current) { start.current = point; setAngleStage(1); }
        else if (!center.current && start.current.distanceTo(point) > 0.001) { center.current = point; setAngleStage(2); }
        else if (center.current && center.current.distanceTo(point) > 0.001) {
          p.onPlace("angle", { ...start.current }, { ...point }, { ...center.current });
          start.current = null; center.current = null; setAngleStage(0); p.onPreview(null); setSnapped(null);
        }
        return;
      }
      if (p.tool === "text") p.onPlace("text", { ...point });
      else if (!start.current) start.current = point;
      else if (start.current.distanceTo(point) > 0.001) { p.onPlace(p.tool === "arrow" ? "arrow" : p.tool === "dashedLine" ? "dashedLine" : "dimension", { ...start.current }, { ...point }); start.current = null; p.onPreview(null); setSnapped(null); }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dragging.current) {
        event.stopImmediatePropagation();
        const original = dragging.current.size;
        dragging.current = null; setSize(original); draft.current.size = original; current.current.onPreview(null);
        return;
      }
      if (endpointDrag.current) { event.stopImmediatePropagation(); cancelEndpointDrag(); return; }
      if (current.current.tool) { current.current.onCancelTool(); current.current.onPreview(null); start.current = null; setSnapped(null); }
      else if (current.current.editing) cancelEdit();
    };
    element.addEventListener("pointermove", move, true);
    element.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => { element.removeEventListener("pointermove", move, true); element.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); };
  }, [host, camera, model, snapPoint]);

  useEffect(() => {
    if (!selected?.visible && !snapped) return;
    let frame = 0;
    const project = (point: THREE.Vector3) => {
      const cam = camera.current, root = model.current, element = host.current;
      if (!cam || !root || !element) return null;
      const canvas = element.querySelector("canvas"); if (!canvas) return null;
      const bounds = canvas.getBoundingClientRect(), container = element.getBoundingClientRect();
      const world = root.localToWorld(point.clone());
      const ndc = world.clone().project(cam);
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(draft.current.size);
      const edge = world.add(right).project(cam);
      return { x: bounds.left - container.left + (ndc.x + 1) * bounds.width / 2, y: bounds.top - container.top + (1 - ndc.y) * bounds.height / 2, fontSize: Math.max(1, Math.abs(edge.x - ndc.x) * bounds.width / 2), visible: ndc.z >= -1 && ndc.z <= 1 };
    };
    const measure = document.createElement("canvas").getContext("2d");
    const update = () => {
      const active = current.current.selected;
      const info = currentLabel.current;
      if (editor.current && active && info) {
        const point = project(info.position);
        if (point) {
          editor.current.style.display = point.visible && active.visible ? "block" : "none";
          editor.current.style.left = `${point.x}px`; editor.current.style.top = `${point.y}px`;
          if (active.kind === "text" && textMarker.current) {
            textMarker.current.style.left = `${point.x}px`; textMarker.current.style.top = `${point.y}px`;
            textMarker.current.style.display = point.visible && active.visible ? "block" : "none";
          }
          editor.current.style.fontSize = `${point.fontSize}px`;
          editor.current.style.transform = `translate(${info.alignment === "left" ? "0" : info.alignment === "right" ? "-100%" : "-50%"}, -50%)`;
          if (measure) {
            measure.font = `${point.fontSize}px ${info.font}, sans-serif`;
            const lines = (active.kind === "text" ? draft.current.text : info.text).split("\n");
            editor.current.style.width = `${Math.max(28, ...lines.map((line) => measure.measureText(line).width + point.fontSize * 4 / 3))}px`;
            editor.current.style.height = `${(Math.max(1, lines.length) * 4 / 3 + 1 / 3) * point.fontSize}px`;
          }
        }
      }
      if (marker.current && snapped) {
        const point = project(snapped);
        if (point) { marker.current.style.left = `${point.x}px`; marker.current.style.top = `${point.y}px`; marker.current.style.display = point.visible ? "block" : "none"; }
      }
      if (active && active.kind !== "text") {
        const points: Array<[AnnotationPoint, typeof startMarker]> = [["start", startMarker], ["end", endMarker]];
        if (active.kind === "angle") points.push(["center", centerMarker]);
        for (const [key, target] of points) {
          const endpoint = annotationPosition(active, key);
          if (!endpoint) continue;
          const point = project(new THREE.Vector3(endpoint.x, endpoint.y, endpoint.z));
          if (point && target.current) {
            target.current.style.left = `${point.x}px`; target.current.style.top = `${point.y}px`;
            target.current.style.display = point.visible && active.visible ? "block" : "none";
          }
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [selected?.id, selected?.visible, tool, snapped, camera, host, model]);

  const textAnnotation = selected?.kind === "text" ? selected : null;
  return <>
    {tool && tool !== "angle" && <div className="educad-annotation-instruction">{locale === "es" ? tool === "text" ? "Pulsa en el plano para colocar la etiqueta · Esc cancela" : "Elige dos puntos · vértices y puntos medios disponibles · Esc cancela" : tool === "text" ? "Click the plane to place a label · Esc cancels" : "Pick two points · vertices and edge midpoints available · Esc cancels"}</div>}
    {tool === "angle" && <div className="educad-annotation-instruction">{locale === "es" ? ["Elige el primer extremo", "Elige el vértice central", "Elige el segundo extremo"][angleStage] : ["Pick the first endpoint", "Pick the central vertex", "Pick the second endpoint"][angleStage]} · Esc {locale === "es" ? "cancela" : "cancels"}</div>}
    {snapped && (tool === "dimension" || tool === "arrow" || tool === "dashedLine" || tool === "angle" || endpointDragging) && <div ref={marker} className="educad-annotation-snap-marker" />}
    {selected && selected.kind !== "text" && selected.visible && (selected.kind === "angle" ? ["start", "center", "end"] as const : ["start", "end"] as const).map((endpoint) => <button key={endpoint} ref={endpoint === "start" ? startMarker : endpoint === "center" ? centerMarker : endMarker} type="button" style={{ visibility: props.selectedEndpoint === endpoint && props.positionManipulatorVisible ? "hidden" : "visible" }} className={`educad-dimension-endpoint ${props.selectedEndpoint === endpoint ? "active" : ""}`} aria-pressed={props.selectedEndpoint === endpoint} aria-label={locale === "es" ? endpoint === "start" ? "Seleccionar punto inicial" : endpoint === "center" ? "Seleccionar vértice central" : "Seleccionar punto final" : endpoint === "start" ? "Select start point" : endpoint === "center" ? "Select central vertex" : "Select end point"} title={locale === "es" ? endpoint === "start" ? "Punto inicial" : endpoint === "center" ? "Vértice central" : "Punto final" : endpoint === "start" ? "Start point" : endpoint === "center" ? "Central vertex" : "End point"} onPointerDown={(event) => beginEndpointDrag(event, endpoint)} onPointerMove={moveEndpointDrag} onPointerUp={finishEndpointDrag} onPointerCancel={cancelEndpointDrag} onLostPointerCapture={() => { if (endpointDrag.current) cancelEndpointDrag(); }} onClick={(event) => { event.stopPropagation(); props.onSelectEndpoint(endpoint); }} />)}
    {textAnnotation?.visible && <button ref={textMarker} style={{ display: "none" }} type="button" className={`educad-dimension-endpoint educad-annotation-position-handle ${endpointDragging ? "active" : ""}`} title={locale === "es" ? "Arrastrar posición · ajustar a geometría" : "Drag position · snap to geometry"} aria-label={locale === "es" ? "Mover etiqueta" : "Move label"} onPointerDown={(event) => beginEndpointDrag(event, "position")} onPointerMove={moveEndpointDrag} onPointerUp={finishEndpointDrag} onPointerCancel={cancelEndpointDrag} onLostPointerCapture={() => { if (endpointDrag.current) cancelEndpointDrag(); }} />}
    {labelInfo && selected?.visible && <div ref={editor} className="educad-annotation-editor" style={{ fontFamily: `${labelInfo.font}, sans-serif`, textAlign: labelInfo.alignment }}>
      {textAnnotation ? editing ? <textarea ref={input} value={text} maxLength={2000} aria-label={locale === "es" ? "Texto de la etiqueta" : "Label text"} onChange={(event) => { setText(event.target.value); draft.current.text = event.target.value; }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finish(); } if (event.key === "Escape") { if (endpointDrag.current) cancelEndpointDrag(); else cancelEdit(); } }} /> : <button className="educad-annotation-edit-target" aria-label={locale === "es" ? "Editar etiqueta" : "Edit label"} title={locale === "es" ? "Doble clic para editar" : "Double-click to edit"} onDoubleClick={() => props.onEdit(textAnnotation.id)} /> : null}
      {props.parameterHandlesVisible && <div className="educad-annotation-size-slider" style={{ width: Math.max(140, size * 8 + 28) }}>
        <svg width="100%" height="24" aria-hidden="true"><line x1="0" y1="12" x2="100%" y2="12" /><line x1="0" y1="6" x2="0" y2="18" /></svg>
        <button type="button" className="educad-annotation-size-handle" style={{ left: size * 8 }} title={locale === "es" ? "Tamaño del texto" : "Text size"} aria-label={locale === "es" ? "Tamaño del texto" : "Text size"} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); dragging.current = { x: event.clientX, size: draft.current.size, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => {
          if (!dragging.current || !selected) return;
          const step = props.workplane.snapToGrid ? props.workplane.snapSpacing : 0.01;
          const next = Math.max(0.1, Math.min(1000, Math.round((dragging.current.size + (event.clientX - dragging.current.x) / 8) / step) * step));
          setSize(next); draft.current.size = next;
          onPreview({ ...selected, ...(selected.kind === "text" ? { text: editing ? "" : draft.current.text } : {}), size: next });
        }} onPointerUp={(event) => { if (!dragging.current) return; dragging.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (!editing) finish(); }} onPointerCancel={() => { dragging.current = null; const original = selected?.size ?? 3; setSize(original); draft.current.size = original; onPreview(editing && textAnnotation ? { ...textAnnotation, text: "" } : null); }} />
      </div>}
    </div>}
  </>;
}
