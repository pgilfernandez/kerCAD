"use client";

import { useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import type { ParametricAnnotation, ParametricDocument, ParametricVector3 } from "@/types/parametric";
import { annotationDimensionPreset, type AnnotationTool } from "@/lib/annotationPresets";
import { annotationLabelInfo, annotationPosition, type AnnotationPoint } from "@/lib/annotationGeometry";
import type { ParametricDisplayUnit } from "@/lib/parametricUnits";
type PointPointerEvent = PointerEvent | ReactPointerEvent<HTMLButtonElement>;

type Props = {
  host: RefObject<HTMLDivElement | null>;
  camera: RefObject<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>;
  model: RefObject<THREE.Group | null>;
  snapPoint: RefObject<(event: PointerEvent) => THREE.Vector3 | null>;
  positionHandleAtPointer: (event: PointerEvent) => boolean;
  pointHandleAtPointer: (event: PointerEvent) => AnnotationPoint | "position" | null;
  radiusHandleAtPointer: (event: PointerEvent) => THREE.Object3D | null;
  onCircleRadius: (id: string, radius: number) => void;
  workplane: ParametricDocument["workplane"];
  tool: AnnotationTool | null;
  selected?: ParametricAnnotation;
  editing: boolean;
  parameterHandlesVisible: boolean;
  displayUnit: ParametricDisplayUnit;
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
  const textMarker = useRef<HTMLButtonElement>(null);
  const [endpointDragging, setEndpointDragging] = useState(false);
  const endpointDrag = useRef<{
    annotation: ParametricAnnotation;
    endpoint: AnnotationPoint | "position"; pointerId: number; element: HTMLElement;
    x: number; y: number; plane: THREE.Plane; offset: THREE.Vector3;
    latest: THREE.Vector3 | null;
  } | null>(null);
  const radiusDrag = useRef<{ annotation: Extract<ParametricAnnotation, { kind: "circle" }>; pointerId: number; element: HTMLCanvasElement; plane: THREE.Plane; inverse: THREE.Matrix4; offset: number; latest: number | null } | null>(null);
  const dragging = useRef<{ x: number; size: number; pointerId: number } | null>(null);
  const draft = useRef({ text, size }); draft.current = { text, size };
  const labelSize = selected && selected.kind !== "circle" ? selected.size : undefined;
  const labelInfo = selected ? annotationLabelInfo(selected, props.displayUnit) : null;
  const currentLabel = useRef(labelInfo); currentLabel.current = labelInfo;
  const finish = () => {
    const active = current.current.selected;
    if (active && active.kind !== "circle") current.current.onFinish(active.id, draft.current.text, draft.current.size);
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
  const beginEndpointDrag = (event: PointPointerEvent, endpoint: AnnotationPoint | "position") => {
    const p = current.current, selected = p.selected;
    event.stopPropagation();
    if (event.button !== 0 || !selected || (endpoint === "position" ? selected.kind !== "text" && selected.kind !== "circle" : selected.kind === "text" || selected.kind === "circle")) return;
    event.preventDefault();
    if (endpoint !== "position") p.onSelectEndpoint(endpoint);
    const root = model.current, cam = camera.current, ray = rayAtPointer(event);
    if (!root || !cam || !ray) return;
    const point = annotationPosition(selected, endpoint === "position" ? null : endpoint);
    if (!point) return;
    const world = root.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
    let normal = new THREE.Vector3(p.workplane.normal.x, p.workplane.normal.y, p.workplane.normal.z).transformDirection(root.matrixWorld);
    if (Math.abs(normal.dot(ray.direction)) < 0.05) normal = cam.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, world);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    const element = event instanceof PointerEvent ? host.current?.querySelector("canvas") : event.currentTarget;
    if (!element) return;
    endpointDrag.current = { annotation: structuredClone(selected), endpoint, element, pointerId: event.pointerId, x: event.clientX, y: event.clientY, plane, offset: world.clone().sub(hit), latest: null };
    element.setPointerCapture(event.pointerId);
  };
  const moveEndpointDrag = (event: PointPointerEvent) => {
    const drag = endpointDrag.current, root = model.current;
    if (!drag || drag.pointerId !== event.pointerId || !root) return;
    event.preventDefault(); event.stopPropagation();
    if (!drag.latest && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
    const target = snapPoint.current?.(event instanceof PointerEvent ? event : event.nativeEvent) ?? null;
    setSnapped((previous) => previous && target && previous.distanceToSquared(target) < 1e-12 ? previous : target?.clone() ?? null);
    let point = target?.clone() ?? null;
    if (!point) {
      const ray = rayAtPointer(event);
      const hit = ray?.intersectPlane(drag.plane, new THREE.Vector3());
      if (!hit) return;
      point = root.worldToLocal(hit.add(drag.offset));
      const plane = current.current.workplane;
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
    current.current.onPreview({ ...drag.annotation, [drag.endpoint]: { x: point.x, y: point.y, z: point.z } });
  };
  const finishEndpointDrag = (event: PointPointerEvent) => {
    const drag = endpointDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    endpointDrag.current = null;
    if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
    if (drag.latest) {
      const point = { x: drag.latest.x, y: drag.latest.y, z: drag.latest.z };
      if (drag.endpoint === "position") current.current.onMoveText(drag.annotation.id, point);
      else current.current.onMoveEndpoint(drag.annotation.id, drag.endpoint, point);
    }
    setEndpointDragging(false); setSnapped(null); current.current.onPreview(null);
  };
  const cancelRadiusDrag = () => {
    const drag = radiusDrag.current; radiusDrag.current = null;
    if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
    current.current.onPreview(null);
  };
  useEffect(() => {
    if (selected?.kind === "text") { setText(selected.text); setSize(selected.size); }
    else if (selected && selected.kind !== "circle") setSize(selected.size ?? 3);
  }, [selected?.id, selected?.kind === "text" ? selected.text : null, labelSize]);
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
      if (p.tool === "dimension" || p.tool === "arrow" || p.tool === "dashedLine" || p.tool === "angle" || p.tool === "circle") {
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
      const radius = radiusDrag.current;
      if (radius && radius.pointerId === event.pointerId) {
        event.preventDefault(); event.stopImmediatePropagation();
        const hit = rayAtPointer(event)?.intersectPlane(radius.plane, new THREE.Vector3());
        if (!hit) return;
        const step = current.current.workplane.snapToGrid ? current.current.workplane.snapSpacing : 0.01;
        radius.latest = Math.max(0.1, Math.min(10000, Math.round((hit.applyMatrix4(radius.inverse).x - radius.offset) / step) * step));
        current.current.onPreview({ ...radius.annotation, radius: radius.latest });
        return;
      }
      if (endpointDrag.current?.element instanceof HTMLCanvasElement && endpointDrag.current.pointerId === event.pointerId) {
        moveEndpointDrag(event); event.stopImmediatePropagation(); return;
      }
      const p = current.current;
      if (!p.tool || event.buttons !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
      const point = pointAt(event);
      if (point && start.current && p.tool !== "text") {
        const base = { id: "annotation-preview", name: "", visible: true, start: { ...start.current }, end: { ...point } };
        if (p.tool === "circle") {
          p.onPreview({ id: "annotation-preview", name: "", kind: "circle", visible: true, position: { ...start.current }, rotation: { x: 0, y: 0, z: 0 }, radius: Math.max(0.1, start.current.distanceTo(point)), mode: "billboard", color: "#233c52", lineWidth: 2 });
        } else if (p.tool === "angle") {
          p.onPreview(center.current ? { ...base, kind: "angle", center: { ...center.current }, color: "#233c52" }
            : { ...base, kind: "dimension", color: "#233c52", startArrow: false, endArrow: false, showLength: false });
        } else p.onPreview({ ...base, kind: "dimension", ...annotationDimensionPreset(p.tool) });
      }
      event.stopPropagation();
    };
    const down = (event: PointerEvent) => {
      const p = current.current;
      if (event.button === 0 && event.target instanceof HTMLCanvasElement && !p.tool) {
        const root = p.radiusHandleAtPointer(event);
        if (root && p.selected?.kind === "circle") {
          event.preventDefault(); event.stopImmediatePropagation();
          root.updateWorldMatrix(true, false);
          const inverse = root.matrixWorld.clone().invert();
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld), root.getWorldPosition(new THREE.Vector3()));
          const hit = rayAtPointer(event)?.intersectPlane(plane, new THREE.Vector3());
          if (!hit) return;
          radiusDrag.current = { annotation: structuredClone(p.selected), pointerId: event.pointerId, element: event.target, inverse, plane, offset: hit.applyMatrix4(inverse).x - p.selected.radius, latest: null };
          event.target.setPointerCapture(event.pointerId);
          return;
        }
        const point = p.pointHandleAtPointer(event);
        if (point) { beginEndpointDrag(event, point); event.stopImmediatePropagation(); return; }
      }
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
      else if (start.current.distanceTo(point) > 0.001) { p.onPlace(p.tool === "circle" ? "circle" : p.tool === "arrow" ? "arrow" : p.tool === "dashedLine" ? "dashedLine" : "dimension", { ...start.current }, { ...point }); start.current = null; p.onPreview(null); setSnapped(null); }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (radiusDrag.current) { event.stopImmediatePropagation(); cancelRadiusDrag(); return; }
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
    const up = (event: PointerEvent) => {
      const radius = radiusDrag.current;
      if (radius && radius.pointerId === event.pointerId) {
        event.stopImmediatePropagation(); radiusDrag.current = null;
        if (radius.element.hasPointerCapture(event.pointerId)) radius.element.releasePointerCapture(event.pointerId);
        if (radius.latest !== null) current.current.onCircleRadius(radius.annotation.id, radius.latest);
        current.current.onPreview(null); return;
      }
      if (endpointDrag.current?.element instanceof HTMLCanvasElement && endpointDrag.current.pointerId === event.pointerId) {
        finishEndpointDrag(event); event.stopImmediatePropagation();
      }
    };
    const cancel = (event: PointerEvent) => {
      if (radiusDrag.current?.pointerId === event.pointerId) cancelRadiusDrag();
      if (endpointDrag.current?.element instanceof HTMLCanvasElement && endpointDrag.current.pointerId === event.pointerId) cancelEndpointDrag();
    };
    element.addEventListener("pointermove", move, true);
    element.addEventListener("pointerdown", down, true);
    element.addEventListener("pointerup", up, true);
    element.addEventListener("pointercancel", cancel, true);
    element.addEventListener("lostpointercapture", cancel, true);
    window.addEventListener("keydown", key);
    return () => { element.removeEventListener("pointermove", move, true); element.removeEventListener("pointerdown", down, true); element.removeEventListener("pointerup", up, true); element.removeEventListener("pointercancel", cancel, true); element.removeEventListener("lostpointercapture", cancel, true); window.removeEventListener("keydown", key); };
  }, [host, camera, model, snapPoint]);

  useEffect(() => {
    if (!selected?.visible && !snapped) return;
    if (!labelInfo && !snapped) return;
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
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [selected?.id, selected?.visible, Boolean(labelInfo), tool, snapped, camera, host, model]);

  const textAnnotation = selected?.kind === "text" ? selected : null;
  return <>
    {tool && tool !== "angle" && <div className="educad-annotation-instruction">{locale === "es" ? tool === "circle" ? "Elige el centro y otro punto para definir el radio · Esc cancela" : tool === "text" ? "Pulsa en el plano para colocar la etiqueta · Esc cancela" : "Elige dos puntos · vértices y puntos medios disponibles · Esc cancela" : tool === "circle" ? "Pick the center and a point to define the radius · Esc cancels" : tool === "text" ? "Click the plane to place a label · Esc cancels" : "Pick two points · vertices and edge midpoints available · Esc cancels"}</div>}
    {tool === "angle" && <div className="educad-annotation-instruction">{locale === "es" ? ["Elige el primer extremo", "Elige el vértice central", "Elige el segundo extremo"][angleStage] : ["Pick the first endpoint", "Pick the central vertex", "Pick the second endpoint"][angleStage]} · Esc {locale === "es" ? "cancela" : "cancels"}</div>}
    {snapped && (tool === "dimension" || tool === "arrow" || tool === "dashedLine" || tool === "angle" || tool === "circle" || endpointDragging) && <div ref={marker} className="educad-annotation-snap-marker" />}
    {textAnnotation?.visible && <button ref={textMarker} style={{ display: "none" }} type="button" className={`educad-dimension-endpoint educad-annotation-position-handle ${endpointDragging ? "active" : ""}`} title={locale === "es" ? "Arrastrar posición · ajustar a geometría" : "Drag position · snap to geometry"} aria-label={locale === "es" ? "Mover etiqueta" : "Move label"} onPointerDown={(event) => beginEndpointDrag(event, "position")} onPointerMove={moveEndpointDrag} onPointerUp={finishEndpointDrag} onPointerCancel={cancelEndpointDrag} onLostPointerCapture={() => { if (endpointDrag.current) cancelEndpointDrag(); }} />}
    {labelInfo && selected?.visible && <div ref={editor} className="educad-annotation-editor" style={{ fontFamily: `${labelInfo.font}, sans-serif`, textAlign: labelInfo.alignment }}>
      {textAnnotation ? editing ? <textarea ref={input} value={text} maxLength={2000} aria-label={locale === "es" ? "Texto de la etiqueta" : "Label text"} onChange={(event) => { setText(event.target.value); draft.current.text = event.target.value; }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finish(); } if (event.key === "Escape") { if (endpointDrag.current) cancelEndpointDrag(); else cancelEdit(); } }} /> : <button className="educad-annotation-edit-target" aria-label={locale === "es" ? "Editar etiqueta" : "Edit label"} title={locale === "es" ? "Doble clic para editar" : "Double-click to edit"} onDoubleClick={() => props.onEdit(textAnnotation.id)} /> : null}
      {props.parameterHandlesVisible && <div className="educad-annotation-size-slider" style={{ width: Math.max(140, size * 8 + 28) }}>
        <svg width="100%" height="24" aria-hidden="true"><line x1="0" y1="12" x2="100%" y2="12" /><line x1="0" y1="6" x2="0" y2="18" /></svg>
        <button type="button" className="educad-annotation-size-handle" style={{ left: size * 8 }} title={locale === "es" ? "Tamaño del texto" : "Text size"} aria-label={locale === "es" ? "Tamaño del texto" : "Text size"} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); dragging.current = { x: event.clientX, size: draft.current.size, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => {
          if (!dragging.current || !selected || selected.kind === "circle") return;
          const step = props.workplane.snapToGrid ? props.workplane.snapSpacing : 0.01;
          const next = Math.max(0.1, Math.min(1000, Math.round((dragging.current.size + (event.clientX - dragging.current.x) / 8) / step) * step));
          setSize(next); draft.current.size = next;
          onPreview({ ...selected, ...(selected.kind === "text" ? { text: editing ? "" : draft.current.text } : {}), size: next });
        }} onPointerUp={(event) => { if (!dragging.current) return; dragging.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (!editing) finish(); }} onPointerCancel={() => { dragging.current = null; const original = labelSize ?? 3; setSize(original); draft.current.size = original; onPreview(editing && textAnnotation ? { ...textAnnotation, text: "" } : null); }} />
      </div>}
    </div>}
  </>;
}
