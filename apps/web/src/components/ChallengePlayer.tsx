"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GripHorizontal, PanelLeft, PanelRight, PanelsTopLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EducadChallenge } from "@/lib/challengeLibrary";

type Dock = "floating" | "left" | "right" | "compact-floating" | "compact-left" | "compact-right";

export function ChallengePlayer({ challenge, dock, onDockChange, onClose }: { challenge: EducadChallenge; dock: Dock; onDockChange: (dock: Dock) => void; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState({ x: 28, y: 96 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const step = challenge.steps[stepIndex];
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

  if (dock.startsWith("compact-")) {
    const compactFrom = dock.replace("compact-", "") as "floating" | "left" | "right";
    return <aside className={`educad-challenge-compact ${compactFrom}`} style={compactFrom === "floating" ? { left: position.x, top: position.y } : undefined} aria-label={`Collapsed challenge: ${challenge.title}`}><button type="button" title="Expand challenge" aria-label="Expand challenge" onClick={() => onDockChange(compactFrom)}><ChevronsRight size={19} /></button></aside>;
  }

  return <aside
    className={`educad-challenge-player ${dock}`}
    style={dock === "floating" ? { left: position.x, top: position.y } : undefined}
    aria-label={`Challenge: ${challenge.title}`}
  >
    <header onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <nav aria-label="Challenge panel position">
        <button type="button" className={dock === "floating" ? "active" : ""} title="Float panel" aria-label="Float panel" onClick={() => onDockChange("floating")}><PanelsTopLeft size={17} /></button>
        <button type="button" className={dock === "left" ? "active" : ""} title="Dock left" aria-label="Dock left" onClick={() => onDockChange("left")}><PanelLeft size={17} /></button>
        <button type="button" className={dock === "right" ? "active" : ""} title="Dock right" aria-label="Dock right" onClick={() => onDockChange("right")}><PanelRight size={17} /></button>
        <button type="button" title="Collapse panel" aria-label="Collapse panel" onClick={() => onDockChange(`compact-${dock}` as Dock)}><ChevronsLeft size={17} /></button>
        <button type="button" title="Close challenge" aria-label="Close challenge" onClick={onClose}><X size={18} /></button>
      </nav>
      <div><small>CHALLENGE</small><strong>{challenge.title}</strong></div>
      <span className="educad-challenge-progress">{stepIndex + 1} / {challenge.steps.length}</span>
      {dock === "floating" ? <GripHorizontal className="educad-challenge-drag-hint" size={22} aria-hidden="true" /> : null}
    </header>
    <div className="educad-challenge-step">
      <small>{step.label || (stepIndex === 0 ? "BEFORE YOU START" : `STEP ${stepIndex}`)}</small>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
      {step.values?.length ? <dl>{step.values.map((value) => <div key={`${value.label}:${value.value}`}><dt>{value.label}</dt><dd>{value.value}</dd></div>)}</dl> : null}
      {step.image ? <img src={step.image} alt="" /> : null}
    </div>
    <footer>
      <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}><ChevronLeft size={20} /> Previous</button>
      {stepIndex < challenge.steps.length - 1
        ? <button className="primary" type="button" onClick={() => setStepIndex((current) => Math.min(challenge.steps.length - 1, current + 1))}>Next <ChevronRight size={20} /></button>
        : <button className="primary" type="button" onClick={onClose}>Finish</button>}
    </footer>
  </aside>;
}
