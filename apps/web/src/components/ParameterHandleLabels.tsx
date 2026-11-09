"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { displayLengthToMillimeters, displayUnitLabel, formatDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
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
  const [draft, setDraft] = useState(formatted);
  const draftRef = useRef(draft);
  const editingRef = useRef(false);
  const changedRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ label, displayUnit, formatted }); latest.current = { label, displayUnit, formatted };
  const updateDraft = (value: string, changed = true) => { changedRef.current = changed; draftRef.current = value; setDraft(value); input.current?.setCustomValidity(""); input.current?.setAttribute("aria-invalid", "false"); onRefresh(); };
  const finish = (cancel = false) => {
    if (!editingRef.current) return;
    const current = latest.current;
    if (!cancel && changedRef.current) {
      const parsed = parseNumericExpression(draftRef.current, current.label.unit === "length" ? current.displayUnit : current.label.unit === "angle" ? "deg" : "");
      const value = current.label.unit === "length" ? displayLengthToMillimeters(parsed, current.displayUnit) : parsed;
      if (input.current && !validateNumericExpression(input.current, value)) return;
      if (!Number.isFinite(value)) return;
      const bounded = Math.max(current.label.min ?? -Infinity, Math.min(current.label.max ?? Infinity, value));
      editingRef.current = false;
      onEditing(false); setEditing(false);
      const next = current.label.unit === "count" ? Math.round(bounded) : bounded;
      if (Math.abs(next - current.label.value) > 1e-8) current.label.onCommit(next);
    } else { editingRef.current = false; onEditing(false); setEditing(false); }
    onRefresh();
  };
  const finishRef = useRef(finish); finishRef.current = finish;
  const increment = (direction: number) => {
    const parsed = parseNumericExpression(draftRef.current, label.unit === "length" ? displayUnit : label.unit === "angle" ? "deg" : "");
    const raw = label.unit === "length" ? displayLengthToMillimeters(parsed, displayUnit) : parsed;
    const step = label.unit === "length" ? Math.max(0.001, snap / 2) : label.unit === "count" || label.unit === "angle" ? 1 : 0.1;
    const next = Math.max(label.min ?? -Infinity, Math.min(label.max ?? Infinity, (Number.isFinite(raw) ? raw : label.value) + direction * step));
    updateDraft(label.unit === "length" ? formatDisplayLength(next, displayUnit) : formatViewportDimension(next));
  };
  const incrementRef = useRef(increment); incrementRef.current = increment;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.stopPropagation(); event.preventDefault();
      if (editingRef.current && event.deltaY) incrementRef.current(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.setSelectionRange(draftRef.current.length, draftRef.current.length);
  }, [editing]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (editingRef.current && !root.current?.contains(event.target as Node)) finishRef.current();
    };
    // Commit before canvas selection changes can unmount the edited label.
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  return <div ref={root} className="kercad-handle-label-content" onClick={() => { if (!editing) { updateDraft(formatted, false); editingRef.current = true; setEditing(true); onEditing(true); } }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <span className="kercad-handle-label-name">{label.name}</span>
    {editing ? <div className="kercad-handle-label-value"><input ref={input} type="text" inputMode="text" aria-label={label.name} value={draft} size={Math.max(3, draft.length + 1)} onChange={(event) => updateDraft(event.target.value)} onBlur={() => finish()} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); input.current?.blur(); }
      if (event.key === "Escape") { event.preventDefault(); finish(true); }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        increment(event.key === "ArrowUp" ? 1 : -1);
      }
    }} /><span className="kercad-handle-label-unit">{unit}</span></div>
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
      let x: number, y: number;
      if (handle.anchor instanceof HTMLElement) {
        const rect = handle.anchor.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        x = rect.right - hostBounds.left; y = rect.top + rect.height / 2 - hostBounds.top;
      } else {
        const point = handle.anchor.getWorldPosition(new THREE.Vector3()).project(camera.current!);
        if (point.z < -1 || point.z > 1) return false;
        x = bounds.left - hostBounds.left + (point.x + 1) * bounds.width / 2 + 14;
        y = bounds.top - hostBounds.top + (1 - point.y) * bounds.height / 2;
      }
      const element = elements.current.get(handle.key);
      if (element) {
        element.style.left = `${Math.max(4, Math.min(x, hostBounds.width - element.offsetWidth - 4))}px`;
        element.style.top = `${Math.max(4, Math.min(y - element.offsetHeight / 2, hostBounds.height - element.offsetHeight - 4))}px`;
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
      let closest: { key: string; distance: number } | null = null;
      for (const handle of handles) {
        if (handle.anchor instanceof HTMLElement) continue;
        const targets = handle.targets ?? [handle.anchor];
        for (const target of targets) target.updateWorldMatrix(true, true);
        const intersection = raycaster.intersectObjects(targets, false)[0];
        if (intersection && (!closest || intersection.distance < closest.distance)) closest = { key: handle.key, distance: intersection.distance };
      }
      return closest?.key ?? null;
    };
    const refresh = () => { updateRef.current(); current.current.invalidate(); };
    const move = (event: PointerEvent) => {
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
      pinned.current.clear(); hovered.current = key;
      if (key) pinned.current.add(key);
      refresh();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", down, true);
    return () => { cancelHide(); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerdown", down, true); };
  }, []);
  useLayoutEffect(() => { updateRef.current(); current.current.invalidate(); }, [rows, props.displayUnit]);
  return <div className="kercad-parameter-handle-labels">{rows.map((label) => <div key={label.key} style={{ visibility: "hidden" }} data-parameter-handle-label={label.key} className={`kercad-parameter-handle-label axis-${label.color}`} ref={(element) => { if (element) elements.current.set(label.key, element); else elements.current.delete(label.key); }} onPointerEnter={() => { cancelHide(); labelHover.current = label.key; }} onPointerLeave={() => { labelHover.current = null; updateRef.current(); }}>
    <ValueEditor label={label} displayUnit={props.displayUnit} snap={props.snap} onEditing={(active) => { if (active) edited.current.add(label.key); else edited.current.delete(label.key); }} onRefresh={() => { updateRef.current(); current.current.invalidate(); }} />
  </div>)}</div>;
});
