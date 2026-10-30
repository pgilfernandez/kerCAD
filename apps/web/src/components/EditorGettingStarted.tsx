"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { KercadLocale } from "@/lib/kercadI18n";
import { DashboardWelcomeDialog } from "@/components/DashboardWelcomeDialog";
import { uiText, getLocaleContent } from "@/lib/kercadI18n";

const STORAGE_KEY = "kercad.getting-started.v1.dismissed";
const SKETCH_STORAGE_KEY = "kercad.sketch-getting-started.v1.dismissed";
const DASHBOARD_STORAGE_KEY = "kercad.dashboard-getting-started.v1.dismissed";
const DASHBOARD_WELCOME_KEY = "kercad.dashboard-welcome.v1.confirmed";

export function resetStartupTutorials() {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SKETCH_STORAGE_KEY); localStorage.removeItem(DASHBOARD_STORAGE_KEY); localStorage.removeItem(DASHBOARD_WELCOME_KEY); }
  catch { /* The mounted tutorials can still be relaunched without storage. */ }
}






export function EditorGettingStarted({ locale, active, mode = "3d", launchRequest = 0, onShowProperties, dashboardSection = "home", onLocaleChange }: { locale: KercadLocale; active: boolean; mode?: "3d" | "sketch" | "dashboard"; launchRequest?: number; onShowProperties?: () => void; dashboardSection?: "home" | "challenges" | "shared"; onLocaleChange?: (locale: KercadLocale) => void }) {
  const [visible, setVisible] = useState(false);
  const [welcomeRequired, setWelcomeRequired] = useState(false);
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; arrowSide: "top" | "right" | "bottom" | "left"; arrowOffset: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const updatePosition = useRef<() => void>(() => {});
  const content = getLocaleContent(locale, "tutorial");
  const text = { ...content, cards: mode === "dashboard" ? content.dashboardCards : mode === "sketch" ? content.sketchCards : content.cards };
  const storageKey = mode === "dashboard" ? DASHBOARD_STORAGE_KEY : mode === "sketch" ? SKETCH_STORAGE_KEY : STORAGE_KEY;
  const centeredDashboardCard = mode === "dashboard" && ((step === 1 && dashboardSection === "home") || (step === 2 && dashboardSection === "challenges"));
  useLayoutEffect(() => {
    if (mode === "dashboard") dragOffset.current = { x: 0, y: 0 };
  }, [mode, dashboardSection]);
  useEffect(() => {
    try { setVisible(localStorage.getItem(storageKey) !== "true"); }
    catch { setVisible(true); }
  }, [storageKey]);
  useEffect(() => {
    if (mode !== "dashboard") return;
    try { setWelcomeRequired(localStorage.getItem(DASHBOARD_WELCOME_KEY) !== "true"); }
    catch { setWelcomeRequired(true); }
  }, [mode]);
  useEffect(() => {
    if (!launchRequest) return;
    if (mode === "dashboard") setWelcomeRequired(true);
    dragOffset.current = { x: 0, y: 0 };
    setStep(0);
    setPosition(null);
    setVisible(true);
  }, [launchRequest]);
  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(storageKey, "true"); } catch { /* Storage may be unavailable. */ }
  };
  const navigate = (next: number) => {
    if (mode === "3d" && next === 2) onShowProperties?.();
    dragOffset.current = { x: 0, y: 0 };
    setPosition(null);
    setStep(next);
  };
  useLayoutEffect(() => {
    if (!visible || !active || welcomeRequired) return;
    const stage = document.querySelector(mode === "dashboard" ? ".kercad-dashboard-main" : ".kercad-workplane-stage");
    const sidebar = mode === "dashboard" ? null : document.querySelector(".kercad-model-sidebar");
    const sketchAnchors = [".sketch-draw-section", ".kercad-sketch-constraints-panel", ".sketch-edit-section", ".sketch-import-section", ".sketch-annotations-section", '[data-tutorial="sketch-visibility"]'];
    const sideAnchor = mode === "sketch" && (step === 1 || step === 5);
    const dashboardAnchors = ['.kercad-dashboard-topbar [data-tutorial="appearance-language"]', '[data-tutorial="dashboard-projects"]', '[data-tutorial="dashboard-challenges"]', '.kercad-dashboard-topbar [data-tutorial="documentation"]'];
    const dashboardAnchor = () => centeredDashboardCard ? null : Array.from(document.querySelectorAll(dashboardAnchors[step] ?? "[data-tutorial-missing]")).find((element) => element.getBoundingClientRect().width > 0) ?? null;
    const anchor = mode === "dashboard" ? dashboardAnchor() : mode === "sketch" ? document.querySelector(sketchAnchors[step]) : step === 1 ? document.querySelector(".toolbar-shapes-section")
      : step === 3 ? document.querySelector(".toolbar-modify-section")
      : step === 4 ? document.querySelector(".toolbar-actions-section")
      : step === 5 ? document.querySelector(".toolbar-annotations-section") : null;
    if (anchor && !sideAnchor) anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => {
      const card = panel.current;
      if (!card || !stage) return;
      const bounds = stage.getBoundingClientRect();
      const side = sidebar?.getBoundingClientRect();
      const right = side && side.width > 0 ? Math.min(bounds.right, side.left) : bounds.right;
      let left = (bounds.left + right - card.offsetWidth) / 2;
      let top = bounds.bottom - card.offsetHeight - 24;
      if (mode === "dashboard") top = bounds.top + (bounds.height - card.offsetHeight) / 2;
      let targetX = (bounds.left + right) / 2;
      let targetY = bounds.top + bounds.height * .3;
      const currentAnchor = mode === "dashboard" ? dashboardAnchor() : anchor;
      if (currentAnchor) {
        const target = currentAnchor.getBoundingClientRect();
        left = target.left;
        top = target.bottom + 10;
        targetX = target.left + target.width / 2;
        targetY = target.bottom;
        if (sideAnchor) {
          left = step === 1 ? target.left - card.offsetWidth - 12 : target.right + 12;
          top = target.top + (target.height - card.offsetHeight) / 2;
          targetY = target.top + target.height / 2;
        }
        if (mode === "dashboard" && currentAnchor.closest(".kercad-dashboard-sidebar")) {
          left = target.right + 12;
          top = target.top + (target.height - card.offsetHeight) / 2;
          targetY = target.top + target.height / 2;
        }
      } else if (mode === "3d" && step === 2 && side) {
        left = side.left - card.offsetWidth - 12;
        top = side.top + (side.height - card.offsetHeight) / 2;
        targetX = side.left + 20;
        targetY = side.top + side.height / 2;
      }
      left = Math.max(12, Math.min(left + dragOffset.current.x, window.innerWidth - card.offsetWidth - 12));
      top = Math.max(bounds.top + 8, Math.min(top + dragOffset.current.y, window.innerHeight - card.offsetHeight - 12));
      const arrowSide = targetY <= top ? "top" : targetX >= left + card.offsetWidth ? "right" : targetX <= left ? "left" : targetY >= top + card.offsetHeight ? "bottom" : step === 2 ? "right" : "top";
      const horizontal = arrowSide === "top" || arrowSide === "bottom";
      const arrowOffset = Math.max(20, Math.min(horizontal ? targetX - left : targetY - top, (horizontal ? card.offsetWidth : card.offsetHeight) - 20));
      setPosition((previous) => previous?.left === left && previous.top === top && previous.arrowSide === arrowSide && previous.arrowOffset === arrowOffset ? previous : { left, top, arrowSide, arrowOffset });
    };
    updatePosition.current = update;
    update();
    const observer = new ResizeObserver(update);
    for (const element of [stage, sidebar, anchor, panel.current]) if (element) observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { updatePosition.current = () => {}; observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [active, visible, step, locale, mode, dashboardSection, centeredDashboardCard, welcomeRequired]);
  if (active && mode === "dashboard" && welcomeRequired && onLocaleChange) return <DashboardWelcomeDialog onLocaleChange={onLocaleChange} onConfirm={() => {
    try { localStorage.setItem(DASHBOARD_WELCOME_KEY, "true"); localStorage.removeItem(DASHBOARD_STORAGE_KEY); } catch { /* Continue even when storage is unavailable. */ }
    dragOffset.current = { x: 0, y: 0 };
    setStep(0);
    setPosition(null);
    setVisible(true);
    setWelcomeRequired(false);
  }} />;
  if (!active || !visible) return null;
  const card = text.cards[step];
  return createPortal(<section ref={panel} className="kercad-getting-started" role="dialog" aria-modal="false" aria-labelledby={`kercad-getting-started-title-${mode}`} style={{ left: position?.left ?? 12, top: position?.top ?? 12, visibility: position ? "visible" : "hidden" }}>
    {position && !centeredDashboardCard && <svg className={`kercad-getting-started-pointer ${position.arrowSide}`} style={position.arrowSide === "top" || position.arrowSide === "bottom" ? { left: position.arrowOffset - 10 } : { top: position.arrowOffset - 10 }} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M0 10 10 0 20 10" fill="white" stroke="#9ac2f4" strokeWidth="1" /></svg>}
    <div className="kercad-getting-started-content">
    <header title={uiText("ui.editorgettingstarted.drag.to.move.this.card.adda7d", {}, locale)}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: dragOffset.current.x, offsetY: dragOffset.current.y };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        dragOffset.current = { x: current.offsetX + event.clientX - current.x, y: current.offsetY + event.clientY - current.y };
        updatePosition.current();
      }}
      onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
    ><span className="kercad-getting-started-count">{step + 1}/{text.cards.length}</span><button type="button" className="kercad-getting-started-close" title={text.close} aria-label={text.close} onClick={dismiss}><X size={18} /></button></header>
    <div aria-live="polite"><h2 id={`kercad-getting-started-title-${mode}`}>{card.title}</h2>{card.lines.map((line) => {
      const emphasis = uiText("tutorial.teachersEmphasis", {}, locale);
      const emphasisIndex = line.indexOf(emphasis);
      return <p key={line}>{mode === "3d" && step === 0 ? <><strong>{line.slice(0, line.indexOf(":"))}</strong>{line.slice(line.indexOf(":"))}</> : emphasisIndex >= 0 ? <>{line.slice(0, emphasisIndex)}<strong>{emphasis}</strong>{line.slice(emphasisIndex + emphasis.length)}</> : line}</p>;
    })}</div>
    <footer>{step > 0 && <button type="button" onClick={() => navigate(step - 1)}>{text.previous}</button>}<button type="button" className="primary" onClick={() => step === text.cards.length - 1 ? dismiss() : navigate(step + 1)}>{step === text.cards.length - 1 ? text.finish : text.next}</button></footer>
    </div>
  </section>, document.querySelector(".kercad-reference-shell") ?? document.body);
}
