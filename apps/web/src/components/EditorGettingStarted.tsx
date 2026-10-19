"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EducadLocale } from "@/lib/educadI18n";

const STORAGE_KEY = "educad.getting-started.v1.dismissed";
const copy = {
  en: {
    close: "Close and do not show again", previous: "Previous", next: "Next", finish: "Finish",
    cards: [
      { title: "Move around in 3D", lines: ["Orbit: drag with the right mouse button, or move two fingers on a trackpad.", "Pan: drag with the middle mouse button, or hold Shift while moving two fingers.", "Zoom: use the mouse wheel or pinch on a trackpad. Zoom follows the pointer."] },
      { title: "Create simple shapes", lines: ["Open Create to add a box, cylinder, sphere or another simple shape. You can also create a sketch here.", "Select a shape to edit its dimensions and position."] },
      { title: "Edit properties", lines: ["This panel lists your objects and their operations. Select an entry to see its properties.", "Change dimensions, color and transformations here. You can also use the handles directly in the 3D view."] },
      { title: "Modify your model", lines: ["Use Modify to chamfer or round edges, extrude a face, revolve a profile or hollow out a solid.", "Choose a tool and follow its selection instructions. Each change becomes an editable operation in the panel."] },
    ],
  },
  es: {
    close: "Cerrar y no volver a mostrar", previous: "Anterior", next: "Siguiente", finish: "Terminar",
    cards: [
      { title: "Muévete por la vista 3D", lines: ["Órbita: arrastra con el botón derecho del ratón o mueve dos dedos en el trackpad.", "Paneo: arrastra con el botón central del ratón o mantén Mayús mientras mueves dos dedos.", "Zoom: usa la rueda del ratón o pellizca en el trackpad. El zoom sigue al puntero."] },
      { title: "Crea formas simples", lines: ["Abre Crear para añadir una caja, un cilindro, una esfera u otra forma simple. Aquí también puedes crear un boceto.", "Selecciona una forma para editar sus dimensiones y posición."] },
      { title: "Edita las propiedades", lines: ["Este panel muestra los objetos y sus operaciones. Selecciona una entrada para ver sus propiedades.", "Cambia aquí las dimensiones, el color y las transformaciones. También puedes usar los manipuladores de la vista 3D."] },
      { title: "Modifica tu modelo", lines: ["Usa Modificar para achaflanar o redondear aristas, extruir una cara, revolucionar un perfil o vaciar un sólido.", "Elige una herramienta y sigue sus indicaciones de selección. Cada cambio queda como una operación editable en el panel."] },
    ],
  },
};

export function EditorGettingStarted({ locale, active, launchRequest = 0, onShowProperties }: { locale: EducadLocale; active: boolean; launchRequest?: number; onShowProperties: () => void }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; arrowSide: "top" | "right" | "bottom" | "left"; arrowOffset: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const text = copy[locale];
  useEffect(() => {
    try { setVisible(localStorage.getItem(STORAGE_KEY) !== "true"); }
    catch { setVisible(true); }
  }, []);
  useEffect(() => {
    if (!launchRequest) return;
    setStep(0);
    setPosition(null);
    setVisible(true);
  }, [launchRequest]);
  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* Storage may be unavailable. */ }
  };
  const navigate = (next: number) => {
    if (next === 2) onShowProperties();
    setPosition(null);
    setStep(next);
  };
  useLayoutEffect(() => {
    if (!visible || !active) return;
    const stage = document.querySelector(".educad-workplane-stage");
    const sidebar = document.querySelector(".educad-model-sidebar");
    const anchor = step === 1 ? document.querySelector(".toolbar-shapes-section")
      : step === 3 ? document.querySelector(".toolbar-modify-section") : null;
    if (anchor) anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => {
      const card = panel.current;
      if (!card || !stage) return;
      const bounds = stage.getBoundingClientRect();
      const side = sidebar?.getBoundingClientRect();
      const right = side && side.width > 0 ? Math.min(bounds.right, side.left) : bounds.right;
      let left = (bounds.left + right - card.offsetWidth) / 2;
      let top = bounds.bottom - card.offsetHeight - 24;
      let targetX = (bounds.left + right) / 2;
      let targetY = bounds.top + bounds.height * .3;
      if (anchor) {
        const target = anchor.getBoundingClientRect();
        left = target.left;
        top = target.bottom + 10;
        targetX = target.left + target.width / 2;
        targetY = target.bottom;
      } else if (step === 2 && side) {
        left = side.left - card.offsetWidth - 12;
        top = side.top + (side.height - card.offsetHeight) / 2;
        targetX = side.left + 20;
        targetY = side.top + side.height / 2;
      }
      left = Math.max(12, Math.min(left, window.innerWidth - card.offsetWidth - 12));
      top = Math.max(bounds.top + 8, Math.min(top, window.innerHeight - card.offsetHeight - 12));
      const arrowSide = targetY <= top ? "top" : targetX >= left + card.offsetWidth ? "right" : targetX <= left ? "left" : targetY >= top + card.offsetHeight ? "bottom" : step === 2 ? "right" : "top";
      const horizontal = arrowSide === "top" || arrowSide === "bottom";
      const arrowOffset = Math.max(20, Math.min(horizontal ? targetX - left : targetY - top, (horizontal ? card.offsetWidth : card.offsetHeight) - 20));
      setPosition((previous) => previous?.left === left && previous.top === top && previous.arrowSide === arrowSide && previous.arrowOffset === arrowOffset ? previous : { left, top, arrowSide, arrowOffset });
    };
    update();
    const observer = new ResizeObserver(update);
    for (const element of [stage, sidebar, anchor, panel.current]) if (element) observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [active, visible, step, locale]);
  if (!active || !visible) return null;
  const card = text.cards[step];
  return createPortal(<section ref={panel} className="educad-getting-started" role="dialog" aria-modal="false" aria-labelledby="educad-getting-started-title" style={{ left: position?.left ?? 12, top: position?.top ?? 12, visibility: position ? "visible" : "hidden" }}>
    {position && <svg className={`educad-getting-started-pointer ${position.arrowSide}`} style={position.arrowSide === "top" || position.arrowSide === "bottom" ? { left: position.arrowOffset - 10 } : { top: position.arrowOffset - 10 }} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M0 10 10 0 20 10" fill="white" stroke="#9ac2f4" strokeWidth="1" /></svg>}
    <div className="educad-getting-started-content">
    <header><span className="educad-getting-started-count">{step + 1}/{text.cards.length}</span><button type="button" className="educad-getting-started-close" title={text.close} aria-label={text.close} onClick={dismiss}><X size={18} /></button></header>
    <div aria-live="polite"><h2 id="educad-getting-started-title">{card.title}</h2>{card.lines.map((line) => <p key={line}>{line}</p>)}</div>
    <footer>{step > 0 && <button type="button" onClick={() => navigate(step - 1)}>{text.previous}</button>}<button type="button" className="primary" onClick={() => step === text.cards.length - 1 ? dismiss() : navigate(step + 1)}>{step === text.cards.length - 1 ? text.finish : text.next}</button></footer>
    </div>
  </section>, document.body);
}
