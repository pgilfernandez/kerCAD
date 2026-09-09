"use client";

import { Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, GripHorizontal, ImageUp, PanelLeft, PanelRight, PanelsTopLeft, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EducadChallenge } from "@/lib/challengeLibrary";

export type ChallengeDock = "floating" | "left" | "right" | "compact-floating" | "compact-left" | "compact-right";

type Props = {
  challenge: EducadChallenge;
  dock: ChallengeDock;
  capture?: { stepId: string; dataUrl: string; token: number } | null;
  onDockChange: (dock: ChallengeDock) => void;
  onCapture: (stepId: string) => void;
  onCancel: () => void;
  onSave: (challenge: EducadChallenge) => void;
};

function nextStepId() {
  return typeof crypto.randomUUID === "function" ? `step-${crypto.randomUUID()}` : `step-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChallengeEditor({ challenge, dock, capture, onDockChange, onCapture, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState(() => structuredClone(challenge));
  const [stepIndex, setStepIndex] = useState(0);
  const [editingMetadata, setEditingMetadata] = useState(true);
  const [position, setPosition] = useState({ x: 28, y: 96 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const step = draft.steps[stepIndex];

  useEffect(() => {
    if (!capture) return;
    setDraft((current) => ({
      ...current,
      cover: capture.stepId === "__cover__" ? capture.dataUrl : current.cover,
      steps: current.steps.map((candidate) => candidate.id === capture.stepId ? { ...candidate, image: capture.dataUrl } : candidate),
    }));
  }, [capture]);

  const updateStep = (update: Partial<typeof step>) => setDraft((current) => ({ ...current, steps: current.steps.map((candidate, index) => index === stepIndex ? { ...candidate, ...update } : candidate) }));
  const updateValue = (index: number, update: Partial<{ label: string; value: string }>) => updateStep({ values: (step.values ?? []).map((value, valueIndex) => valueIndex === index ? { ...value, ...update } : value) });
  const moveValue = (index: number, direction: -1 | 1) => {
    const values = [...(step.values ?? [])];
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    [values[index], values[target]] = [values[target], values[index]];
    updateStep({ values });
  };
  const insertStep = () => {
    const next = { id: nextStepId(), label: `STEP ${stepIndex + 1}`, title: "New step", body: "Describe what the learner should do.", values: [] };
    setDraft((current) => ({ ...current, steps: [...current.steps.slice(0, stepIndex + 1), next, ...current.steps.slice(stepIndex + 1)] }));
    setStepIndex((current) => current + 1);
  };
  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dock !== "floating" || (event.target as HTMLElement).closest("button, input, textarea")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: React.PointerEvent<HTMLElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setPosition({ x: Math.max(8, Math.min(window.innerWidth - 380, active.left + event.clientX - active.x)), y: Math.max(38, Math.min(window.innerHeight - 180, active.top + event.clientY - active.y)) });
  };
  const endDrag = (event: React.PointerEvent<HTMLElement>) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; };
  const valid = Boolean(draft.title.trim() && draft.steps.every((candidate) => candidate.title.trim() && candidate.body.trim()));
  const loadImage = (file: File | undefined, target: "cover" | "step") => {
    if (!file || !file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      if (target === "cover") setDraft((current) => ({ ...current, cover: reader.result as string }));
      else updateStep({ image: reader.result });
    };
    reader.readAsDataURL(file);
  };

  if (dock.startsWith("compact-")) {
    const compactFrom = dock.replace("compact-", "") as "floating" | "left" | "right";
    return <aside className={`educad-challenge-compact ${compactFrom}`} style={compactFrom === "floating" ? { left: position.x, top: position.y } : undefined} aria-label="Collapsed challenge editor"><button type="button" title="Expand challenge editor" aria-label="Expand challenge editor" onClick={() => onDockChange(compactFrom)}><ChevronsRight size={19} /></button></aside>;
  }

  return <aside className={`educad-challenge-player educad-challenge-author ${dock}`} style={dock === "floating" ? { left: position.x, top: position.y } : undefined} aria-label="Challenge editor">
    <header onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <nav aria-label="Challenge editor panel position">
        <button type="button" className={dock === "floating" ? "active" : ""} title="Float panel" aria-label="Float panel" onClick={() => onDockChange("floating")}><PanelsTopLeft size={17} /></button>
        <button type="button" className={dock === "left" ? "active" : ""} title="Dock left" aria-label="Dock left" onClick={() => onDockChange("left")}><PanelLeft size={17} /></button>
        <button type="button" className={dock === "right" ? "active" : ""} title="Dock right" aria-label="Dock right" onClick={() => onDockChange("right")}><PanelRight size={17} /></button>
        <button type="button" title="Collapse panel" aria-label="Collapse panel" onClick={() => onDockChange(`compact-${dock}` as ChallengeDock)}><ChevronsLeft size={17} /></button>
        <button type="button" title="Cancel editing" aria-label="Cancel editing" onClick={onCancel}><X size={18} /></button>
      </nav>
      <div><small>CHALLENGE EDITOR</small><strong>{draft.title || "Untitled challenge"}</strong></div>
      <span className="educad-challenge-progress">{editingMetadata ? "Details" : `${stepIndex + 1} / ${draft.steps.length}`}</span>
      {dock === "floating" ? <GripHorizontal className="educad-challenge-drag-hint" size={22} aria-hidden="true" /> : null}
    </header>
    {editingMetadata ? <div className="educad-challenge-step educad-challenge-form educad-challenge-metadata">
      <label><span>Challenge title</span><input value={draft.title} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label><span>Author</span><input value={draft.author ?? ""} maxLength={100} placeholder="Teacher or organisation" onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))} /></label>
      <label><span>Challenge description</span><textarea rows={5} value={draft.description ?? ""} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
      <section className="educad-challenge-capture">
        {draft.cover ? <img src={draft.cover} alt="Challenge thumbnail" /> : <div className="educad-challenge-capture-placeholder"><ImageUp size={35} /><span>Challenge thumbnail</span></div>}
        <div className="educad-challenge-capture-actions"><button type="button" title="Capture 3D view" aria-label="Capture 3D view for thumbnail" onClick={() => onCapture("__cover__")}><Camera size={19} /></button><button type="button" title="Upload thumbnail" aria-label="Upload thumbnail" onClick={() => coverInputRef.current?.click()}><ImageUp size={19} /></button></div>
        <small>Recommended image size: 1200 × 750 px</small>
        <input ref={coverInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { loadImage(event.target.files?.[0], "cover"); event.target.value = ""; }} />
      </section>
    </div> : <div className="educad-challenge-step educad-challenge-form">
      <label><span>Step subtitle</span><input value={step.label ?? ""} maxLength={80} placeholder={stepIndex === 0 ? "BEFORE YOU START" : `STEP ${stepIndex}`} onChange={(event) => updateStep({ label: event.target.value })} /></label>
      <label><span>Step title</span><input value={step.title} maxLength={120} onChange={(event) => updateStep({ title: event.target.value })} /></label>
      <label><span>Description</span><textarea rows={4} value={step.body} onChange={(event) => updateStep({ body: event.target.value })} /></label>
      <section className="educad-challenge-parameter-editor">
        <header><strong>Parameters</strong><button type="button" onClick={() => updateStep({ values: [...(step.values ?? []), { label: "Parameter", value: "1 mm" }] })}><Plus size={16} /> Add</button></header>
        {(step.values ?? []).map((value, index) => <div className="educad-challenge-parameter-row" key={`${step.id}:value:${index}`}>
          <input aria-label={`Parameter ${index + 1} name`} value={value.label} placeholder="Name" onChange={(event) => updateValue(index, { label: event.target.value })} />
          <input aria-label={`Parameter ${index + 1} value`} value={value.value} placeholder="Value" onChange={(event) => updateValue(index, { value: event.target.value })} />
          <span><button type="button" disabled={index === 0} title="Move up" aria-label="Move parameter up" onClick={() => moveValue(index, -1)}><ChevronUp size={15} /></button><button type="button" disabled={index === (step.values?.length ?? 0) - 1} title="Move down" aria-label="Move parameter down" onClick={() => moveValue(index, 1)}><ChevronDown size={15} /></button><button type="button" title="Delete parameter" aria-label="Delete parameter" onClick={() => updateStep({ values: (step.values ?? []).filter((_, valueIndex) => valueIndex !== index) })}><Trash2 size={15} /></button></span>
        </div>)}
      </section>
      <section className="educad-challenge-capture">
        {step.image ? <img src={step.image} alt="Current step capture" /> : <div className="educad-challenge-capture-placeholder"><Camera size={35} /><span>3D view capture</span></div>}
        <div className="educad-challenge-capture-actions"><button type="button" title="Capture 3D view" aria-label="Capture 3D view" onClick={() => onCapture(step.id)}><Camera size={19} /></button><button type="button" title="Upload image" aria-label="Upload image" onClick={() => imageInputRef.current?.click()}><ImageUp size={19} /></button><button type="button" title="Use this image as the challenge cover" aria-label="Use this image as the challenge cover" disabled={!step.image} onClick={() => setDraft((current) => ({ ...current, cover: step.image }))}><Star size={19} /></button></div>
        <small>Recommended image size: 1200 × 750 px</small>
        <input ref={imageInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { loadImage(event.target.files?.[0], "step"); event.target.value = ""; }} />
      </section>
    </div>}
    {editingMetadata ? <footer className="educad-challenge-metadata-footer"><button className="primary" type="button" disabled={!draft.title.trim()} onClick={() => setEditingMetadata(false)}>Next <ChevronRight size={20} /></button></footer> : <footer className="educad-challenge-author-footer">
      <button type="button" onClick={() => { if (stepIndex === 0) setEditingMetadata(true); else setStepIndex((current) => current - 1); }}><ChevronLeft size={20} /> Previous</button>
      <button className="insert" type="button" title="Insert step after this one" aria-label="Insert step after this one" onClick={insertStep}><Plus size={22} /></button>
      {stepIndex < draft.steps.length - 1
        ? <button className="primary" type="button" onClick={() => setStepIndex((current) => Math.min(draft.steps.length - 1, current + 1))}>Next <ChevronRight size={20} /></button>
        : <button className="primary" type="button" disabled={!valid} onClick={() => onSave({ ...draft, installedAt: Date.now() })}>Finish</button>}
    </footer>}
  </aside>;
}
