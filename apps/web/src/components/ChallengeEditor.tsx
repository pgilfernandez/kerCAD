"use client";

import { Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronUp, Eye, GripHorizontal, ImageUp, PanelLeft, PanelRight, PanelsTopLeft, Pencil, Plus, ScanLine, SeparatorHorizontal, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KercadChallenge } from "@/lib/challengeLibrary";
import { uiText } from "@/lib/kercadI18n";
import type { CapturedChallengeParameter } from "@/lib/challengeParameterCapture";
import { joinChallengeParameterGroups } from "@/lib/challengeParameters";
import { ChallengeStepPreview } from "@/components/ChallengePlayer";
import { ChallengeImageEditor } from "@/components/ChallengeImageEditor";

export type ChallengeDock = "floating" | "left" | "right";

type Props = {
  challenge: KercadChallenge;
  dock: ChallengeDock;
  capture?: { stepId: string; dataUrl: string; token: number } | null;
  selectionParameters?: CapturedChallengeParameter[];
  onDockChange: (dock: ChallengeDock) => void;
  onCapture: (stepId: string) => void;
  onCancel: () => void;
  onCollapse: () => void;
  onSave: (challenge: KercadChallenge) => void;
};

function nextStepId() {
  return typeof crypto.randomUUID === "function" ? `step-${crypto.randomUUID()}` : `step-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChallengeEditor({ challenge, dock, capture, selectionParameters = [], onDockChange, onCapture, onCancel, onCollapse, onSave }: Props) {
  const [draft, setDraft] = useState(() => structuredClone(challenge));
  const [stepIndex, setStepIndex] = useState(0);
  const [imageEdit, setImageEdit] = useState<{ stepId: string; source: string } | null>(null);
  const [editingMetadata, setEditingMetadata] = useState(true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const previewLabel = uiText(previewIndex === null ? "challenge.previewDraft" : "challenge.resumeEditing");
  const [categoryDraft, setCategoryDraft] = useState("");
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
  const updateValue = (index: number, update: Partial<{ label: string; value: string }>) => updateStep({ values: (step.values ?? []).map((value, valueIndex) => valueIndex === index && value.type !== "separator" ? { ...value, ...update } : value) });
  const moveValue = (index: number, direction: -1 | 1) => {
    const values = [...(step.values ?? [])];
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    [values[index], values[target]] = [values[target], values[index]];
    updateStep({ values });
  };
  const parameterControls = (index: number) => <span className="kercad-challenge-parameter-controls"><button type="button" disabled={index === 0} title={uiText("model.moveUp")} aria-label={uiText("ui.challengeeditor.move.parameter.up.d439f7")} onClick={() => moveValue(index, -1)}><ChevronUp size={15} /></button><button type="button" disabled={index === (step.values?.length ?? 0) - 1} title={uiText("model.moveDown")} aria-label={uiText("ui.challengeeditor.move.parameter.down.0fa991")} onClick={() => moveValue(index, 1)}><ChevronDown size={15} /></button><button type="button" title={uiText("ui.challengeeditor.delete.parameter.999047")} aria-label={uiText("ui.challengeeditor.delete.parameter.999047")} onClick={() => updateStep({ values: (step.values ?? []).filter((_, valueIndex) => valueIndex !== index) })}><Trash2 size={15} /></button></span>;
  const insertStep = () => {
    const next = { id: nextStepId(), label: uiText("ui.challengeeditor.step.0a0a95", { value0: stepIndex + 2 }), title: uiText("ui.challengeeditor.new.step.fe37aa"), body: uiText("challenge.defaultStepDescription"), values: [] };
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
  const addCategory = () => {
    const category = categoryDraft.trim();
    if (!category || draft.categories?.some((candidate) => candidate.toLocaleLowerCase() === category.toLocaleLowerCase())) return;
    setDraft((current) => ({ ...current, categories: [...(current.categories ?? []), category] }));
    setCategoryDraft("");
  };
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

  return <><aside className={`kercad-challenge-player kercad-challenge-author ${dock}`} style={dock === "floating" ? { left: position.x, top: position.y } : undefined} aria-label={uiText("ui.challengeeditor.challenge.editor.723644")}>
    <header onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <nav aria-label={uiText("ui.challengeeditor.challenge.editor.panel.position.2f13fe")}>
        <button type="button" className={dock === "floating" ? "active" : ""} title={uiText("ui.challengeeditor.float.panel.d20f37")} aria-label={uiText("ui.challengeeditor.float.panel.d20f37")} onClick={() => onDockChange("floating")}><PanelsTopLeft size={17} /></button>
        <button type="button" className={dock === "left" ? "active" : ""} title={uiText("ui.challengeeditor.dock.left.a6cfae")} aria-label={uiText("ui.challengeeditor.dock.left.a6cfae")} onClick={() => onDockChange("left")}><PanelLeft size={17} /></button>
        <button type="button" className={dock === "right" ? "active" : ""} title={uiText("ui.challengeeditor.dock.right.90a15b")} aria-label={uiText("ui.challengeeditor.dock.right.90a15b")} onClick={() => onDockChange("right")}><PanelRight size={17} /></button>
        <button type="button" title={previewLabel} aria-label={previewLabel} onClick={() => setPreviewIndex(previewIndex === null ? (editingMetadata ? 0 : stepIndex) : null)}>{previewIndex === null ? <Eye size={17} /> : <Pencil size={17} />}</button>
        <button type="button" title={uiText("model.collapse")} aria-label={uiText("model.collapse")} onClick={onCollapse}><ChevronsLeft size={17} /></button>
        <button type="button" title={uiText("ui.challengeeditor.cancel.editing.26bbc0")} aria-label={uiText("ui.challengeeditor.cancel.editing.26bbc0")} onClick={onCancel}><X size={18} /></button>
      </nav>
      <div><small>{uiText("ui.challengeeditor.challenge.editor.d33237")}</small><strong>{draft.title || uiText("ui.challengeeditor.untitled.challenge.7def40")}</strong></div>
      <span className="kercad-challenge-progress">{previewIndex === null && editingMetadata ? uiText("ui.challengeeditor.details.dc3dec") : `${(previewIndex ?? stepIndex) + 1} / ${draft.steps.length}`}</span>
      {dock === "floating" ? <GripHorizontal className="kercad-challenge-drag-hint" size={22} aria-hidden="true" /> : null}
    </header>
    {previewIndex !== null ? <ChallengeStepPreview challenge={draft} stepIndex={previewIndex} onStepChange={setPreviewIndex} onFinish={() => setPreviewIndex(null)} /> : <>
    {editingMetadata ? <div className="kercad-challenge-step kercad-challenge-form kercad-challenge-metadata">
      <label><span>{uiText("ui.challengeeditor.challenge.title.bdac2d")}</span><input value={draft.title} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label><span>{uiText("dashboard.author.5fda23")}</span><input value={draft.author ?? ""} maxLength={100} placeholder={uiText("ui.challengeeditor.teacher.or.organisation.de80f7")} onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))} /></label>
      <section className="kercad-challenge-category-editor">
        <strong>{uiText("ui.challengeeditor.categories.6ccb60")}</strong>
        <div className="kercad-challenge-category-input"><input value={categoryDraft} maxLength={32} placeholder={uiText("ui.challengeeditor.add.a.category.545cfb")} onChange={(event) => setCategoryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addCategory(); } }} /><button type="button" disabled={!categoryDraft.trim()} onClick={addCategory}><Plus size={16} /> {uiText("model.add")}</button></div>
        {(draft.categories?.length ?? 0) > 0 ? <div className="kercad-challenge-categories">{draft.categories?.map((category) => <span key={category}>{category}<button type="button" title={uiText("ui.challengeeditor.remove.a2d40d", { value0: category })} aria-label={uiText("ui.challengeeditor.remove.a2d40d", { value0: category })} onClick={() => setDraft((current) => ({ ...current, categories: current.categories?.filter((candidate) => candidate !== category) }))}><X size={12} /></button></span>)}</div> : null}
      </section>
      <label><span>{uiText("ui.challengeeditor.challenge.description.7da134")}</span><textarea rows={5} value={draft.description ?? ""} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
      <section className="kercad-challenge-capture">
        {draft.cover ? <img src={draft.cover} alt={uiText("ui.challengeeditor.challenge.thumbnail.730801")} /> : <div className="kercad-challenge-capture-placeholder"><ImageUp size={35} /><span>{uiText("ui.challengeeditor.challenge.thumbnail.730801")}</span></div>}
        <div className="kercad-challenge-capture-actions"><button type="button" title={uiText("ui.challengeeditor.capture.3d.view.7e66f5")} aria-label={uiText("ui.challengeeditor.capture.3d.view.for.thumbnail.7f5ccf")} onClick={() => onCapture("__cover__")}><Camera size={19} /></button><button type="button" title={uiText("ui.challengeeditor.upload.thumbnail.d99bf5")} aria-label={uiText("ui.challengeeditor.upload.thumbnail.d99bf5")} onClick={() => coverInputRef.current?.click()}><ImageUp size={19} /></button></div>
        <small>{uiText("ui.challengeeditor.recommended.image.size.1200.750.px.3f3182")}</small>
        <input ref={coverInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { loadImage(event.target.files?.[0], "cover"); event.target.value = ""; }} />
      </section>
    </div> : <div className="kercad-challenge-step kercad-challenge-form">
      <label><span>{uiText("ui.challengeeditor.step.title.77d7bc")}</span><input value={step.title} maxLength={120} onChange={(event) => updateStep({ title: event.target.value })} /></label>
      <label><span>{uiText("ui.challengeeditor.description.55f8eb")}</span><textarea rows={4} value={step.body} onChange={(event) => updateStep({ body: event.target.value })} /></label>
      <label><span>{uiText("ui.challengeeditor.step.subtitle.2b531b")}</span><input value={step.label ?? ""} maxLength={80} placeholder={uiText("ui.challengeeditor.step.0a0a95", { value0: stepIndex + 1 })} onChange={(event) => updateStep({ label: event.target.value })} /></label>
      <section className="kercad-challenge-parameter-editor">
        <header><strong>{uiText("operation.parameters")}</strong><div className="kercad-challenge-parameter-actions">
          <button type="button" onClick={() => updateStep({ values: [...(step.values ?? []), { label: uiText("ui.challengeeditor.parameter.f699f2"), value: "1 mm" }] })}><Plus size={16} /> {uiText("model.add")}</button>
          <button type="button" disabled={!selectionParameters.length} title={uiText("challenge.captureParametersHint")} onClick={() => updateStep({ values: joinChallengeParameterGroups([step.values ?? [], selectionParameters]).map((parameter) => ({ ...parameter })) })}><ScanLine size={16} /> {uiText("challenge.captureParameters")}</button>
          <button type="button" disabled={!step.values?.length || step.values.at(-1)?.type === "separator"} onClick={() => updateStep({ values: [...(step.values ?? []), { type: "separator" }] })}><SeparatorHorizontal size={16} /> {uiText("challenge.parameterSeparator")}</button>
        </div></header>
        {(step.values ?? []).map((value, index) => value.type === "separator" ? <div className="kercad-challenge-parameter-separator" key={`${step.id}:value:${index}`}>
          <span><SeparatorHorizontal size={16} aria-hidden="true" />{uiText("challenge.parameterSeparator")}</span>
          {parameterControls(index)}
        </div> : <div className="kercad-challenge-parameter-row" key={`${step.id}:value:${index}`}>
          <input aria-label={uiText("ui.challengeeditor.parameter.name.978a9c", { value0: index + 1 })} value={value.label} placeholder={uiText("dashboard.name.709a23")} onChange={(event) => updateValue(index, { label: event.target.value })} />
          <input aria-label={uiText("ui.challengeeditor.parameter.value.1bc9f6", { value0: index + 1 })} value={value.value} placeholder={uiText("ui.challengeeditor.value.8dce17")} onChange={(event) => updateValue(index, { value: event.target.value })} />
          {parameterControls(index)}
        </div>)}
      </section>
      <section className="kercad-challenge-capture">
        {step.image ? <img src={step.image} alt={uiText("ui.challengeeditor.current.step.capture.c78cb1")} /> : <div className="kercad-challenge-capture-placeholder"><Camera size={35} /><span>{uiText("ui.challengeeditor.3d.view.capture.1d5d32")}</span></div>}
        <div className="kercad-challenge-capture-actions">{step.image && <button type="button" title={uiText("challenge.imageEditor.title")} aria-label={uiText("challenge.imageEditor.title")} onClick={() => setImageEdit({ stepId: step.id, source: step.image! })}><Pencil size={19} /></button>}<button type="button" title={uiText("ui.challengeeditor.capture.3d.view.7e66f5")} aria-label={uiText("ui.challengeeditor.capture.3d.view.7e66f5")} onClick={() => onCapture(step.id)}><Camera size={19} /></button><button type="button" title={uiText("ui.challengeeditor.upload.image.f35dec")} aria-label={uiText("ui.challengeeditor.upload.image.f35dec")} onClick={() => imageInputRef.current?.click()}><ImageUp size={19} /></button><button type="button" title={uiText("ui.challengeeditor.use.this.image.as.the.challenge.cover.50e2e7")} aria-label={uiText("ui.challengeeditor.use.this.image.as.the.challenge.cover.50e2e7")} disabled={!step.image} onClick={() => setDraft((current) => ({ ...current, cover: step.image }))}><Star size={19} /></button></div>
        <small>{uiText("ui.challengeeditor.recommended.image.size.1200.750.px.3f3182")}</small>
        <input ref={imageInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { loadImage(event.target.files?.[0], "step"); event.target.value = ""; }} />
      </section>
    </div>}
    {editingMetadata ? <footer className="kercad-challenge-metadata-footer"><button className="primary" type="button" disabled={!draft.title.trim()} onClick={() => setEditingMetadata(false)}>{uiText("ui.challengeeditor.next.bc9819")}{" "}<ChevronRight size={20} /></button></footer> : <footer className="kercad-challenge-author-footer">
      <button type="button" onClick={() => { if (stepIndex === 0) setEditingMetadata(true); else setStepIndex((current) => current - 1); }}><ChevronLeft size={20} /> {uiText("ui.challengeeditor.previous.50f942")}</button>
      <button className="insert" type="button" title={uiText("ui.challengeeditor.insert.step.after.this.one.07f41c")} aria-label={uiText("ui.challengeeditor.insert.step.after.this.one.07f41c")} onClick={insertStep}><Plus size={22} /></button>
      {stepIndex < draft.steps.length - 1
        ? <button className="primary" type="button" onClick={() => setStepIndex((current) => Math.min(draft.steps.length - 1, current + 1))}>{uiText("ui.challengeeditor.next.bc9819")}{" "}<ChevronRight size={20} /></button>
        : <button className="primary" type="button" disabled={!valid} onClick={() => onSave({ ...draft, installedAt: Date.now() })}>{uiText("ui.challengeeditor.finish.b74bde")}</button>}
    </footer>}
    </>}
  </aside>{imageEdit && <ChallengeImageEditor image={imageEdit.source} onCancel={() => setImageEdit(null)} onSave={(image) => {
    setDraft((current) => ({ ...current, steps: current.steps.map((candidate) => candidate.id === imageEdit.stepId ? { ...candidate, image } : candidate) }));
    setImageEdit(null);
  }} />}</>;
}
