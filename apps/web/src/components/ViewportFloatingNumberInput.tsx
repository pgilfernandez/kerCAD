"use client";
import { AdvancedNumberInput } from "@/components/AdvancedNumberFields";
import { formatDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { formatViewportDimension } from "@/lib/viewportGeometry";

export function ViewportFloatingNumberInput({ value, unit, displayUnit, snap, label, min, max, onCommit }: { value: number; unit: "length" | "angle" | "count" | "scalar" | "percent"; displayUnit: ParametricDisplayUnit; snap: number; label: string; min: number; max: number; onCommit: (value: number) => void }) {
  return <div className="kercad-viewport-advanced-number"><AdvancedNumberInput ariaLabel={label} value={value} min={min} max={max} unit={unit === "length" ? "mm" : unit === "angle" ? "°" : unit === "percent" ? "%" : unit === "scalar" ? "px" : "×"} displayUnit={displayUnit} step={unit === "length" ? Math.max(0.01, snap / 2) : 1} round={unit === "count"} format={(number) => unit === "length" ? formatDisplayLength(number, displayUnit) : formatViewportDimension(number)} onCommit={onCommit} /></div>;
}
