"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
import { displayLengthToMillimeters, millimetersToDisplayLength, displayUnitLabel, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { uiText, type KercadLocale } from "@/lib/kercadI18n";
import "./advancedNumberFields.css";

export type AdvancedNumberField = { key: string; value: number; caption?: string; label: string; min?: number; max?: number };
type Props = { fields: AdvancedNumberField[]; label?: string; unit: string; displayUnit: ParametricDisplayUnit; step: number; locale: KercadLocale; onCommit: (values: Record<string, number>) => void };
const clean = (value: number) => Number(value.toFixed(10));

function MirroredSelection({ input, text, start, end, visible }: { input: () => HTMLInputElement | undefined; text: string; start: number; end: number; visible: boolean }) {
  const [bounds, setBounds] = useState({ left: 0, width: 1 });
  useLayoutEffect(() => {
    const element = input(); if (!element) return;
    const style = getComputedStyle(element), context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    context.font = style.font;
    const width = context.measureText(text).width;
    const padding = parseFloat(style.paddingLeft) || 0;
    const origin = width <= element.clientWidth - padding * 2 ? (element.clientWidth - width) / 2 : padding - element.scrollLeft;
    const before = context.measureText(text.slice(0, start)).width;
    const selection = context.measureText(text.slice(start, end)).width;
    setBounds({ left: element.offsetLeft + origin + before, width: Math.max(1, selection) });
  }, [text, start, end, input]);
  return <span aria-hidden="true" className={`kercad-advanced-mirror ${start === end ? "caret" : "selection"}`} style={{ left: bounds.left, width: bounds.width, visibility: start !== end || visible ? "visible" : "hidden" }} />;
}

/** A single field or a contiguous, keyboard-editable group of numeric fields. */
export function AdvancedNumberFields({ fields, label, unit, displayUnit, step, locale, onCommit }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [caret, setCaret] = useState<{ start: number; end: number } | null>(null);
  const [caretVisible, setCaretVisible] = useState(true);
  const syncCaret = (input: HTMLInputElement) => { setCaret({ start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 }); setCaretVisible(true); };
  useEffect(() => {
    if (!caret || selected.length < 2) return;
    const timer = window.setInterval(() => setCaretVisible((value) => !value), 500);
    return () => window.clearInterval(timer);
  }, [caret, selected.length]);
  const draftRef = useRef(drafts); draftRef.current = drafts;
  const cancelBlur = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; key: string; mode: "pending" | "select" | "value"; keys: string[]; start: Record<string, number> } | null>(null);
  const isLength = unit === "mm";
  const toDisplay = (value: number) => isLength ? millimetersToDisplayLength(value, displayUnit) : value;
  const toInternal = (value: number) => isLength ? displayLengthToMillimeters(value, displayUnit) : value;
  const visibleUnit = isLength ? displayUnitLabel(displayUnit) : unit;
  const expressionUnit = isLength ? displayUnit : unit;
  const keysFor = (key: string) => selected.includes(key) ? selected : [key];
  const clamp = (field: AdvancedNumberField, value: number) => Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, value));
  const inputFor = (key: string) => Array.from(root.current?.querySelectorAll<HTMLInputElement>("input[data-number-key]") ?? []).find((input) => input.dataset.numberKey === key);
  const commit = (keys: string[]) => {
    const values: Record<string, number> = {};
    for (const field of fields.filter((entry) => keys.includes(entry.key))) {
      const draft = draftRef.current[field.key];
      if (draft === undefined) continue;
      const parsed = parseNumericExpression(draft, expressionUnit);
      const input = inputFor(field.key);
      if (!Number.isFinite(parsed)) { if (input) validateNumericExpression(input, parsed); return false; }
      input?.setCustomValidity("");
      values[field.key] = clamp(field, toInternal(parsed));
    }
    draftRef.current = Object.fromEntries(Object.entries(draftRef.current).filter(([key]) => !keys.includes(key)));
    setDrafts(draftRef.current);
    if (Object.keys(values).length) onCommit(values);
    return true;
  };
  const nudge = (key: string, direction: number) => {
    const keys = keysFor(key), values: Record<string, number> = {};
    for (const field of fields.filter((entry) => keys.includes(entry.key))) {
      const draft = draftRef.current[field.key];
      const parsed = draft === undefined ? field.value : toInternal(parseNumericExpression(draft, expressionUnit));
      if (!Number.isFinite(parsed)) return;
      values[field.key] = clamp(field, clean(parsed + direction * step));
    }
    draftRef.current = Object.fromEntries(Object.entries(draftRef.current).filter(([id]) => !keys.includes(id)));
    setDrafts(draftRef.current);
    onCommit(values);
  };
  const wheelApi = useRef(nudge); wheelApi.current = nudge;
  useEffect(() => {
    const element = root.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      const key = (event.target as Element).closest<HTMLElement>("[data-field-key]")?.dataset.fieldKey;
      if (!key || !event.deltaY) return;
      event.preventDefault(); event.stopPropagation(); wheelApi.current(key, event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  return <div className="kercad-advanced-number-row">
    {label && <span className="kercad-advanced-external-label">{label}</span>}
    <div ref={root} className="kercad-advanced-number-group" data-multi-edit={selected.length > 1 && caret !== null || undefined} role="group" aria-label={label ?? fields[0]?.label}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setSelected([]); setCaret(null); } }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("button")) return;
        const key = (event.target as Element).closest<HTMLElement>("[data-field-key]")?.dataset.fieldKey;
        if (!key) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, key, mode: "pending", keys: keysFor(key), start: Object.fromEntries(fields.map((field) => [field.key, field.value])) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = drag.current; if (!active || active.id !== event.pointerId) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (active.mode === "pending" && Math.hypot(dx, dy) > 5) active.mode = fields.length > 1 && Math.abs(dy) > Math.abs(dx) ? "select" : "value";
        if (active.mode === "pending") return;
        event.preventDefault(); window.getSelection()?.removeAllRanges();
        if (active.mode === "select") {
          const keys = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-field-key]") ?? []).filter((row) => { const bounds = row.getBoundingClientRect(); return bounds.bottom >= Math.min(active.y, event.clientY) && bounds.top <= Math.max(active.y, event.clientY); }).map((row) => row.dataset.fieldKey!);
          active.keys = keys; setSelected(keys);
        } else {
          setSelected(active.keys);
          const values = Object.fromEntries(fields.filter((field) => active.keys.includes(field.key)).map((field) => [field.key, String(clean(toDisplay(clamp(field, active.start[field.key] + Math.round(dx / 6) * step))))]));
          draftRef.current = { ...draftRef.current, ...values }; setDrafts(draftRef.current);
        }
      }}
      onPointerUp={(event) => {
        const active = drag.current; if (!active || active.id !== event.pointerId) return;
        drag.current = null;
        if (active.mode === "value") commit(active.keys);
        else {
          const keys = active.mode === "select" ? active.keys : keysFor(active.key);
          setSelected(keys);
          if (active.mode === "select") window.requestAnimationFrame(() => { const input = inputFor(active.key); input?.focus(); input?.select(); });
          else inputFor(active.key)?.focus();
        }
      }}
      onPointerCancel={() => { drag.current = null; draftRef.current = {}; setDrafts({}); }}>
      {fields.map((field) => <div key={field.key} className={`kercad-advanced-number-field ${selected.includes(field.key) ? "selected" : ""}`} data-field-key={field.key}>
        <button type="button" tabIndex={-1} aria-label={uiText("input.decrement", {}, locale)} title={uiText("input.decrement", {}, locale)} onPointerDown={(event) => event.preventDefault()} onClick={() => nudge(field.key, -1)}><span className="kercad-advanced-direction left" aria-hidden="true" /></button>
        <span className="kercad-advanced-caption" aria-hidden="true">{field.caption}</span>
        <input className="kercad-advanced-number-input" data-number-key={field.key} type="text" inputMode="text" aria-label={field.label} value={drafts[field.key] ?? String(clean(toDisplay(field.value)))}
          onFocus={(event) => { if (!selected.includes(field.key)) setSelected([field.key]); syncCaret(event.currentTarget); }}
          onSelect={(event) => syncCaret(event.currentTarget)}
          onChange={(event) => { const next = { ...draftRef.current }; for (const key of keysFor(field.key)) next[key] = event.target.value; draftRef.current = next; setDrafts(next); event.target.setCustomValidity(""); }}
          onBlur={() => { if (cancelBlur.current) { cancelBlur.current = false; return; } commit(keysFor(field.key)); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); if (commit(keysFor(field.key))) event.currentTarget.blur(); }
            else if (event.key === "Escape") { setDrafts({}); draftRef.current = {}; event.currentTarget.setCustomValidity(""); cancelBlur.current = true; event.currentTarget.blur(); }
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); nudge(field.key, event.key === "ArrowUp" ? 1 : -1); }
          }} />
        {selected.length > 1 && selected.includes(field.key) && caret && <MirroredSelection input={() => inputFor(field.key)} text={drafts[field.key] ?? String(clean(toDisplay(field.value)))} start={caret.start} end={caret.end} visible={caretVisible} />}
        <span className="kercad-advanced-unit" aria-hidden="true">{visibleUnit}</span>
        <button type="button" tabIndex={-1} aria-label={uiText("input.increment", {}, locale)} title={uiText("input.increment", {}, locale)} onPointerDown={(event) => event.preventDefault()} onClick={() => nudge(field.key, 1)}><span className="kercad-advanced-direction right" aria-hidden="true" /></button>
      </div>)}
    </div>
  </div>;
}
