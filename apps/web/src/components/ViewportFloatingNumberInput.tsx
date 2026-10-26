"use client";
import { useEffect, useRef, useState } from "react";
import { displayLengthToMillimeters, displayUnitLabel, formatDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
import { formatViewportDimension } from "@/lib/viewportGeometry";

export function ViewportFloatingNumberInput({ value, unit, displayUnit, snap, label, min, max, onCommit }: { value: number; unit: "length" | "angle" | "count" | "scalar" | "percent"; displayUnit: ParametricDisplayUnit; snap: number; label: string; min: number; max: number; onCommit: (value: number) => void }) {
  const format = (number: number) => unit === "length" ? formatDisplayLength(number, displayUnit) : formatViewportDimension(number);
  const shown = format(value);
  const [draft, setDraft] = useState(shown);
  const draftRef = useRef(draft);
  const editingRef = useRef(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const updateDraft = (text: string) => { draftRef.current = text; setDraft(text); };
  useEffect(() => { if (!editingRef.current) { draftRef.current = shown; setDraft(shown); } }, [shown]);
  const parsedValue = () => {
    const parsed = parseNumericExpression(draftRef.current, unit === "length" ? displayUnit : unit === "angle" ? "deg" : unit === "percent" ? "%" : "");
    return unit === "length" ? displayLengthToMillimeters(parsed, displayUnit) : parsed;
  };
  const apply = (raw: number) => {
    const next = Math.min(max, Math.max(min, unit === "count" ? Math.round(raw) : raw));
    updateDraft(format(next));
    if (Math.abs(next - value) > 1e-6) onCommit(next);
  };
  const commit = () => {
    const raw = parsedValue();
    const input = fieldRef.current?.querySelector("input");
    if (input && !validateNumericExpression(input, raw)) return;
    if (!Number.isFinite(raw)) return;
    editingRef.current = false;
    apply(raw);
  };
  const increment = (direction: number) => {
    const raw = parsedValue();
    const step = unit === "length" ? Math.max(0.01, snap / 2) : 1;
    apply((Number.isFinite(raw) ? raw : value) + direction * step);
  };
  const incrementRef = useRef(increment);
  incrementRef.current = increment;
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY) incrementRef.current(event.deltaY < 0 ? 1 : -1);
    };
    field.addEventListener("wheel", wheel, { passive: false });
    return () => field.removeEventListener("wheel", wheel);
  }, []);
  return <div className="kercad-viewport-edge-treatment-radius"><div ref={fieldRef}>
    <input type="text" inputMode="text" aria-label={label} value={draft}
      onFocus={(event) => { editingRef.current = true; event.currentTarget.select(); }}
      onChange={(event) => updateDraft(event.currentTarget.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { updateDraft(shown); editingRef.current = false; event.currentTarget.blur(); }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); increment(event.key === "ArrowUp" ? 1 : -1); }
      }} />
    <span>{unit === "length" ? displayUnitLabel(displayUnit) : unit === "angle" ? "°" : unit === "percent" ? "%" : unit === "scalar" ? "px" : "×"}</span>
    <div className="kercad-viewport-number-steppers">
      <button type="button" aria-label={`${label} +`} onPointerDown={(event) => event.preventDefault()} onClick={() => increment(1)}>▴</button>
      <button type="button" aria-label={`${label} −`} onPointerDown={(event) => event.preventDefault()} onClick={() => increment(-1)}>▾</button>
    </div>
  </div></div>;
}
