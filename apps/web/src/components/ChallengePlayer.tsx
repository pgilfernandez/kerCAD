"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, GripHorizontal, PanelLeft, PanelRight, PanelsTopLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KercadChallenge } from "@/lib/challengeLibrary";
import { uiText } from "@/lib/kercadI18n";
import { groupChallengeParameters } from "@/lib/challengeParameters";

type Dock = "floating" | "left" | "right";

export function ChallengePlayer({ challenge, dock, onDockChange, onClose }: { challenge: KercadChallenge; dock: Dock; onDockChange: (dock: Dock) => void; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState({ x: 28, y: 96 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => { setStepIndex(0); }, [challenge.id]);

  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dock !== "floating" || (event.target as HTMLElement).closest("button")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: React.PointerEvent<HTMLElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - 360, active.left + event.clientX - active.x)),
      y: Math.max(38, Math.min(window.innerHeight - 180, active.top + event.clientY - active.y)),
    });
  };
  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return <aside
    className={`kercad-challenge-player ${dock}`}
    style={dock === "floating" ? { left: position.x, top: position.y } : undefined}
    aria-label={uiText("ui.challengeplayer.challenge.84ad06", { value0: challenge.title })}
  >
    <header onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <nav aria-label={uiText("ui.challengeplayer.challenge.panel.position.fe5ac6")}>
        <button type="button" className={dock === "floating" ? "active" : ""} title={uiText("ui.challengeeditor.float.panel.d20f37")} aria-label={uiText("ui.challengeeditor.float.panel.d20f37")} onClick={() => onDockChange("floating")}><PanelsTopLeft size={17} /></button>
        <button type="button" className={dock === "left" ? "active" : ""} title={uiText("ui.challengeeditor.dock.left.a6cfae")} aria-label={uiText("ui.challengeeditor.dock.left.a6cfae")} onClick={() => onDockChange("left")}><PanelLeft size={17} /></button>
        <button type="button" className={dock === "right" ? "active" : ""} title={uiText("ui.challengeeditor.dock.right.90a15b")} aria-label={uiText("ui.challengeeditor.dock.right.90a15b")} onClick={() => onDockChange("right")}><PanelRight size={17} /></button>
        <button type="button" title={uiText("model.collapse")} aria-label={uiText("model.collapse")} onClick={onClose}><ChevronsLeft size={18} /></button>
      </nav>
      <div><small>{uiText("ui.challengeplayer.challenge.e9166b")}</small><strong>{challenge.title}</strong></div>
      <span className="kercad-challenge-progress">{stepIndex + 1} / {challenge.steps.length}</span>
      {dock === "floating" ? <GripHorizontal className="kercad-challenge-drag-hint" size={22} aria-hidden="true" /> : null}
    </header>
    <ChallengeStepPreview challenge={challenge} stepIndex={stepIndex} onStepChange={setStepIndex} onFinish={onClose} />
  </aside>;
}

export function ChallengeStepPreview({ challenge, stepIndex, onStepChange, onFinish }: { challenge: KercadChallenge; stepIndex: number; onStepChange: (index: number) => void; onFinish: () => void }) {
  const step = challenge.steps[stepIndex];
  const parameterGroups = groupChallengeParameters(step.values);
  return <>
    <div key={step.id} className="kercad-challenge-step">
      <small>{step.label || uiText("ui.challengeeditor.step.0a0a95", { value0: stepIndex + 1 })}</small>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
      {parameterGroups.length ? <div className="kercad-challenge-parameter-groups">{parameterGroups.map((group, groupIndex) => <dl key={`${step.id}:group:${groupIndex}`}>{group.map((value, index) => <div key={`${groupIndex}:${index}`}><dt>{value.label}</dt><dd>{value.value}</dd></div>)}</dl>)}</div> : null}
      {step.image ? <img src={step.image} alt="" /> : null}
    </div>
    <footer>
      <button type="button" disabled={stepIndex === 0} onClick={() => onStepChange(stepIndex - 1)}><ChevronLeft size={20} /> {uiText("ui.challengeeditor.previous.50f942")}</button>
      {stepIndex < challenge.steps.length - 1
        ? <button className="primary" type="button" onClick={() => onStepChange(stepIndex + 1)}>{uiText("ui.challengeeditor.next.bc9819")}{" "}<ChevronRight size={20} /></button>
        : <button className="primary" type="button" onClick={onFinish}>{uiText("ui.challengeeditor.finish.b74bde")}</button>}
    </footer>
  </>;
}
