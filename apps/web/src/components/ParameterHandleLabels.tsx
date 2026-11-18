"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { closestScreenHandleHit } from "@/lib/parameterHandlePicking";
import { displayUnitLabel, formatDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { AdvancedNumberInput } from "@/components/AdvancedNumberFields";
import { formatViewportDimension } from "@/lib/viewportGeometry";
import "./parameterHandleLabels.css";

export type ParameterHandleLabel = {
  key: string;
  anchor: THREE.Object3D | HTMLElement;
  targets?: THREE.Object3D[];
  name: string;
  value: number;
  color: "x" | "y" | "z" | "other";
  unit: "length" | "angle" | "count" | "scalar" | "pixels";
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
};
export type ParameterHandleLabelsApi = { update: () => void };
type Props = {
  host: RefObject<HTMLDivElement | null>;
  camera: RefObject<THREE.Camera | null>;
  getHandles: () => ParameterHandleLabel[];
  invalidate: () => void;
  displayUnit: ParametricDisplayUnit;
  snap: number;
};

function ValueEditor({ label, displayUnit, snap, onEditing, onRefresh }: { label: ParameterHandleLabel; displayUnit: ParametricDisplayUnit; snap: number; onEditing: (active: boolean) => void; onRefresh: () => void }) {
  const formatted = label.unit === "length" ? formatDisplayLength(label.value, displayUnit) : formatViewportDimension(label.value);
  const unit = label.unit === "length" ? displayUnitLabel(displayUnit) : label.unit === "angle" ? "°" : label.unit === "scalar" ? "×" : label.unit === "pixels" ? "px" : "";
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!editing) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) input.current?.blur(); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [editing]);
  return <div ref={root} className="kercad-handle-label-content" onClick={() => { if (!editing) { setEditing(true); onEditing(true); } }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <span className="kercad-handle-label-name">{label.name}</span>
    {editing ? <div className="kercad-handle-label-value"><AdvancedNumberInput ariaLabel={label.name} value={label.value} min={label.min} max={label.max} unit={label.unit === "length" ? "mm" : unit} displayUnit={displayUnit} step={label.unit === "length" ? Math.max(.001, snap / 2) : label.unit === "angle" || label.unit === "count" ? 1 : .1} round={label.unit === "count"} autoFocus inputRef={(node) => { input.current = node; }} onEditing={(active) => { if (!active) { setEditing(false); onEditing(false); onRefresh(); } }} onCommit={label.onCommit} /></div>
      : <button type="button" className="kercad-handle-label-value" aria-label={[label.name, formatted, unit].filter(Boolean).join(" ")}><span>{formatted}</span><span className="kercad-handle-label-unit">{unit}</span></button>}
  </div>;
}

export const ParameterHandleLabels = forwardRef<ParameterHandleLabelsApi, Props>(function ParameterHandleLabels(props, ref) {
  const current = useRef(props); current.current = props;
  const [rows, setRows] = useState<ParameterHandleLabel[]>([]);
  const rowsRef = useRef(rows);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const pinned = useRef(new Set<string>());
  const hovered = useRef<string | null>(null);
  const labelHover = useRef<string | null>(null);
  const edited = useRef(new Set<string>());
  const dragging = useRef<{ key: string; pointerId: number; x: number; y: number; active: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateRef = useRef<() => void>(() => {});
  const cancelHide = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const update = () => {
    if (!pinned.current.size && !hovered.current && !labelHover.current && !edited.current.size) {
      if (rowsRef.current.length) { rowsRef.current = []; setRows([]); }
      return;
    }
    const { host, camera, getHandles } = current.current;
    if (!host.current || !camera.current) return;
    const canvas = host.current.querySelector("canvas");
    if (!canvas) return;
    const hostBounds = host.current.getBoundingClientRect(), bounds = canvas.getBoundingClientRect();
    const handles = getHandles();
    const present = new Set(handles.map((handle) => handle.key));
    for (const key of pinned.current) if (!present.has(key)) pinned.current.delete(key);
    for (const key of edited.current) if (!present.has(key)) edited.current.delete(key);
    if (hovered.current && !present.has(hovered.current)) hovered.current = null;
    if (labelHover.current && !present.has(labelHover.current)) labelHover.current = null;
    const visible = handles.filter((handle) => pinned.current.has(handle.key) || hovered.current === handle.key || labelHover.current === handle.key || edited.current.has(handle.key)).filter((handle) => {
      let x: number, y: number, diameter: number;
      if (handle.anchor instanceof HTMLElement) {
        const rect = handle.anchor.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        x = rect.left + rect.width / 2 - hostBounds.left; y = rect.top + rect.height / 2 - hostBounds.top;
        diameter = Math.min(rect.width, rect.height);
      } else {
        const point = handle.anchor.getWorldPosition(new THREE.Vector3()).project(camera.current!);
        if (point.z < -1 || point.z > 1) return false;
        x = bounds.left - hostBounds.left + (point.x + 1) * bounds.width / 2;
        y = bounds.top - hostBounds.top + (1 - point.y) * bounds.height / 2;
        diameter = Number(handle.anchor.userData.yellowManipulatorDiameterPixels) || 28;
        // The nominal pixel size describes the yellow fill. The darker outline
        // is a larger child sphere, and its outside edge is the visible diameter.
        if (handle.anchor instanceof THREE.Mesh && handle.anchor.geometry instanceof THREE.SphereGeometry) {
          const radius = handle.anchor.geometry.parameters.radius;
          let outerScale = 1;
          for (const child of handle.anchor.children) {
            if (child.userData.yellowManipulatorOutline && child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry && radius > 0) {
              outerScale = Math.max(outerScale, child.geometry.parameters.radius * Math.max(Math.abs(child.scale.x), Math.abs(child.scale.y), Math.abs(child.scale.z)) / radius);
            }
          }
          diameter *= outerScale;
        }
      }
      const element = elements.current.get(handle.key);
      if (element) {
        element.dataset.dragging = String(dragging.current?.key === handle.key && dragging.current.active);
        const height = element.offsetHeight;
        if (element.dataset.diameter !== String(diameter) || element.dataset.height !== String(height)) {
          element.dataset.height = String(height);
          element.dataset.diameter = String(diameter);
          element.style.setProperty("--handle-label-size", `${diameter}px`);
          // Extend under the right half of the real circle. Cut out its footprint
          // so the WebGL handle stays visually on top AND receives pointer hits.
          const radius = diameter / 2;
          const limit = Math.asin(diameter / 2 / radius);
          const edge = Math.sqrt(radius * radius - diameter * diameter / 4);
          const outline = [`${edge}px 0px`, "100% 0px", "100% 100%", `${edge}px 100%`, `${edge}px ${diameter}px`];
          for (let index = 1; index < 24; index += 1) {
            const angle = limit - index / 24 * limit * 2;
            outline.push(`${Math.cos(angle) * radius}px ${diameter / 2 + Math.sin(angle) * radius}px`);
          }
          element.style.clipPath = `polygon(${outline.join(",")})`;
        }
        element.style.left = `${x}px`;
        element.style.top = `${y - diameter / 2}px`;
        element.style.visibility = "visible";
      }
      return true;
    });
    const previous = rowsRef.current;
    if (visible.length !== previous.length || visible.some((row, index) => row.key !== previous[index].key || row.value !== previous[index].value || row.name !== previous[index].name || row.color !== previous[index].color || row.unit !== previous[index].unit || row.anchor !== previous[index].anchor)) {
      rowsRef.current = visible; setRows(visible);
    }
  };
  updateRef.current = update;
  useImperativeHandle(ref, () => ({ update: () => updateRef.current() }), []);
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const hit = (event: PointerEvent) => {
      const { host, camera, getHandles } = current.current;
      const canvas = host.current?.querySelector("canvas");
      if (!canvas || !camera.current) return null;
      const handles = getHandles();
      const dom = handles.find((handle) => handle.anchor instanceof HTMLElement && handle.anchor.contains(event.target as Node));
      if (dom) return dom.key;
      if (event.target !== canvas) return null;
      const bounds = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera.current);
      const candidates: THREE.Intersection[] = [];
      const keys = new Map<THREE.Object3D, string>();
      for (const handle of handles) {
        if (handle.anchor instanceof HTMLElement) continue;
        const targets = handle.targets ?? [handle.anchor];
        for (const target of targets) {
          target.updateWorldMatrix(true, true);
          keys.set(target, handle.key);
        }
        candidates.push(...raycaster.intersectObjects(targets, false));
      }
      const closest = closestScreenHandleHit(candidates, camera.current, event, bounds);
      return closest ? keys.get(closest.object) ?? null : null;
    };
    const refresh = () => { updateRef.current(); current.current.invalidate(); };
    const move = (event: PointerEvent) => {
      const drag = dragging.current;
      if (drag?.pointerId === event.pointerId && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 0) drag.active = true;
      if (!current.current.host.current?.contains(event.target as Node) && !hovered.current) return;
      if ((event.target as Element).closest?.("[data-parameter-handle-label]")) return;
      if (event.buttons) { refresh(); return; }
      const key = hit(event);
      if (key) { cancelHide(); hovered.current = key; refresh(); }
      else if (hovered.current && timer.current === null) timer.current = setTimeout(() => { timer.current = null; hovered.current = null; refresh(); }, 180);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target as Element).closest?.("[data-parameter-handle-label]")) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement && focused.closest("[data-parameter-handle-label]")) focused.blur();
      cancelHide(); const key = hit(event);
      dragging.current = key ? { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false } : null;
      pinned.current.clear(); hovered.current = key;
      if (key) pinned.current.add(key);
      refresh();
    };
    const finishDrag = (event: PointerEvent) => {
      if (dragging.current?.pointerId !== event.pointerId) return;
      dragging.current = null;
      refresh();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    document.addEventListener("lostpointercapture", finishDrag, true);
    return () => { cancelHide(); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointerup", finishDrag, true); document.removeEventListener("pointercancel", finishDrag, true); document.removeEventListener("lostpointercapture", finishDrag, true); };
  }, []);
  useLayoutEffect(() => { updateRef.current(); current.current.invalidate(); }, [rows, props.displayUnit]);
  return <div className="kercad-parameter-handle-labels">{rows.map((label) => <div key={label.key} style={{ visibility: "hidden" }} data-parameter-handle-label={label.key} className={`kercad-parameter-handle-label axis-${label.color}`} ref={(element) => { if (element) elements.current.set(label.key, element); else elements.current.delete(label.key); }} onPointerEnter={() => { cancelHide(); labelHover.current = label.key; }} onPointerLeave={() => { labelHover.current = null; updateRef.current(); }}>
    <ValueEditor label={label} displayUnit={props.displayUnit} snap={props.snap} onEditing={(active) => { if (active) edited.current.add(label.key); else edited.current.delete(label.key); }} onRefresh={() => { updateRef.current(); current.current.invalidate(); }} />
  </div>)}</div>;
});
