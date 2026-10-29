"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { KercadLocale } from "@/lib/kercadI18n";

const STORAGE_KEY = "kercad.getting-started.v1.dismissed";
const SKETCH_STORAGE_KEY = "kercad.sketch-getting-started.v1.dismissed";
const DASHBOARD_STORAGE_KEY = "kercad.dashboard-getting-started.v1.dismissed";

export function resetStartupTutorials() {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SKETCH_STORAGE_KEY); localStorage.removeItem(DASHBOARD_STORAGE_KEY); }
  catch { /* The mounted tutorials can still be relaunched without storage. */ }
}

const dashboardCards = {
  en: [
    { title: "Choose your language and theme", lines: ["Start here to choose the interface language and switch between the light and dark themes.", "Your preferences are remembered in this browser."] },
    { title: "Your projects", lines: ["Projects is the main area of kerCAD, where you create and organize your designs.", "Use the new-project card to start designing. You can return to Projects from the navigation at any time."] },
    { title: "Learn and teach with challenges", lines: ["Challenges are step-by-step tutorials for learning and teaching how to use kerCAD and design parts.", "Open Challenges to explore the installed activities, import a challenge or create your own."] },
    { title: "Keep learning", lines: ["Open Documentation to learn more about kerCAD, explore its tools and deepen your design skills.", "You can relaunch this introduction from the Information button whenever you need it."] },
  ],
  es: [
    { title: "Elige el idioma y el tema", lines: ["Empieza aquí para elegir el idioma de la interfaz y cambiar entre los temas claro y oscuro.", "Tus preferencias se recuerdan en este navegador."] },
    { title: "Tus proyectos", lines: ["Proyectos es la parte principal de kerCAD, donde creas y organizas tus diseños.", "Usa la tarjeta de nuevo proyecto para empezar a diseñar. Puedes volver a Proyectos desde la navegación en cualquier momento."] },
    { title: "Aprende y enseña con retos", lines: ["Los retos son tutoriales paso a paso para aprender y enseñar a usar kerCAD y a diseñar piezas.", "Entra en Retos para explorar las actividades instaladas, importar un reto o crear los tuyos."] },
    { title: "Sigue aprendiendo", lines: ["Abre Documentación para aprender más sobre kerCAD, explorar sus herramientas y profundizar en el diseño.", "Puedes volver a iniciar esta introducción desde el botón de Información cuando lo necesites."] },
  ],
};

const sketchCards = {
  en: [
    { title: "Draw your sketch", lines: ["Use Draw to create lines, curves, rectangles, circles, slots and polygons.", "Buttons with a corner triangle open a group of tools. Close a contour to use it in a 3D operation."] },
    { title: "Add constraints", lines: ["Select points or edges, then use this panel to apply constraints or dimensions.", "Horizontal, vertical, tangent and other relations preserve your design intent while you edit."] },
    { title: "Edit your paths", lines: ["Use Edit to add or connect nodes, merge endpoints, trim geometry or smooth a path.", "Select the geometry you want to change before choosing the tool."] },
    { title: "Import an SVG", lines: ["Import an SVG drawing from your computer to bring vector paths into this sketch.", "You can then edit the imported geometry and add constraints."] },
    { title: "Explain with annotations", lines: ["Add text, dimensions, angles and circles without creating sketch geometry.", "These annotations are useful for teachers and exercise corrections. They stay in the sketch and do not appear in the 3D view."] },
    { title: "Keep the view clear", lines: ["These three buttons independently show or hide length labels, annotations and constraint labels.", "Hide what you do not need while drawing. Your visibility preferences are remembered."] },
  ],
  es: [
    { title: "Dibuja tu boceto", lines: ["Usa Dibujar para crear líneas, curvas, rectángulos, círculos, ranuras y polígonos.", "Los botones con un triángulo en la esquina abren un grupo de herramientas. Cierra un contorno para usarlo en una operación 3D."] },
    { title: "Añade restricciones", lines: ["Selecciona puntos o aristas y usa este panel para aplicar restricciones o cotas.", "Las relaciones de horizontalidad, verticalidad, tangencia y otras mantienen la intención del diseño mientras lo editas."] },
    { title: "Edita los trazados", lines: ["Usa Editar para añadir o conectar nodos, fusionar extremos, recortar geometría o suavizar un trazado.", "Selecciona la geometría que quieras modificar antes de elegir la herramienta."] },
    { title: "Importa un SVG", lines: ["Importa un dibujo SVG desde tu ordenador para incorporar trazados vectoriales al boceto.", "Después podrás editar la geometría importada y añadir restricciones."] },
    { title: "Explica con anotaciones", lines: ["Añade textos, dimensiones, ángulos y círculos sin crear geometría del boceto.", "Son útiles para profesores y para corregir ejercicios. Estas anotaciones se quedan en el boceto y no aparecen en la vista 3D."] },
    { title: "Despeja la vista", lines: ["Estos tres botones muestran u ocultan, de forma independiente, las etiquetas de longitud, las anotaciones y las etiquetas de restricciones.", "Oculta lo que no necesites mientras dibujas. Se recuerdan tus preferencias de visibilidad."] },
  ],
};
const copy = {
  en: {
    close: "Close and do not show again", previous: "Previous", next: "Next", finish: "Finish",
    cards: [
      { title: "Move around in 3D", lines: ["Orbit: right-drag or move two fingers on a trackpad.", "Pan: middle-drag or Shift + two fingers.", "Zoom: mouse wheel or pinch."] },
      { title: "Create simple shapes", lines: ["Open Create to add a box, cylinder, sphere or another simple shape. You can also create a sketch here."] },
      { title: "Edit properties", lines: ["This panel lists your objects and their operations. Select an entry to see its properties.", "Change dimensions, color and transformations here. You can also use the handles directly in the 3D view."] },
      { title: "Modify your model", lines: ["Use Modify to chamfer or round edges, extrude a face, revolve a profile or hollow out a solid.", "Choose a tool and follow its selection instructions. Each change becomes an editable operation in the panel."] },
      { title: "Import and export", lines: ["Import kerCAD projects, STEP solids, SVG drawings, STL/OBJ reference meshes or JPG/PNG reference images.", "Export your editable project as .kercad, or your model as STEP or STL for sharing and 3D printing."] },
      { title: "Explain with annotations", lines: ["Add text, dimensions, angles and circles to explain your design without changing its geometry.", "Annotations are especially useful for teachers: highlight details, give feedback and correct students’ exercises directly on the model."] },
    ],
  },
  es: {
    close: "Cerrar y no volver a mostrar", previous: "Anterior", next: "Siguiente", finish: "Terminar",
    cards: [
      { title: "Muévete por la vista 3D", lines: ["Órbita: arrastra con el botón derecho o mueve dos dedos en el trackpad.", "Pan: arrastra con el botón central o Mayús + dos dedos.", "Zoom: rueda del ratón o pellizco."] },
      { title: "Crea formas simples", lines: ["Abre Crear para añadir una caja, un cilindro, una esfera u otra forma simple. Aquí también puedes crear un boceto."] },
      { title: "Edita las propiedades", lines: ["Este panel muestra los objetos y sus operaciones. Selecciona una entrada para ver sus propiedades.", "Cambia aquí las dimensiones, el color y las transformaciones. También puedes usar los manipuladores de la vista 3D."] },
      { title: "Modifica tu modelo", lines: ["Usa Modificar para achaflanar o redondear aristas, extruir una cara, revolucionar un perfil o vaciar un sólido.", "Elige una herramienta y sigue sus indicaciones de selección. Cada cambio queda como una operación editable en el panel."] },
      { title: "Importa y exporta", lines: ["Importa proyectos kerCAD, sólidos STEP, dibujos SVG, mallas de referencia STL/OBJ o imágenes de referencia JPG/PNG.", "Exporta el proyecto editable como .kercad o el modelo como STEP o STL para compartirlo e imprimirlo en 3D."] },
      { title: "Explica con anotaciones", lines: ["Añade textos, dimensiones, ángulos y círculos para explicar tu diseño sin modificar su geometría.", "Las anotaciones son especialmente útiles para profesores: permiten destacar detalles, dar indicaciones y corregir ejercicios del alumnado directamente sobre el modelo."] },
    ],
  },
};

export function EditorGettingStarted({ locale, active, mode = "3d", launchRequest = 0, onShowProperties, dashboardSection = "home" }: { locale: KercadLocale; active: boolean; mode?: "3d" | "sketch" | "dashboard"; launchRequest?: number; onShowProperties?: () => void; dashboardSection?: "home" | "challenges" | "shared" }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; arrowSide: "top" | "right" | "bottom" | "left"; arrowOffset: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const updatePosition = useRef<() => void>(() => {});
  const text = { ...copy[locale], cards: mode === "dashboard" ? dashboardCards[locale] : mode === "sketch" ? sketchCards[locale] : copy[locale].cards };
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
    if (!launchRequest) return;
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
    if (!visible || !active) return;
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
  }, [active, visible, step, locale, mode, dashboardSection, centeredDashboardCard]);
  if (!active || !visible) return null;
  const card = text.cards[step];
  return createPortal(<section ref={panel} className="kercad-getting-started" role="dialog" aria-modal="false" aria-labelledby={`kercad-getting-started-title-${mode}`} style={{ left: position?.left ?? 12, top: position?.top ?? 12, visibility: position ? "visible" : "hidden" }}>
    {position && !centeredDashboardCard && <svg className={`kercad-getting-started-pointer ${position.arrowSide}`} style={position.arrowSide === "top" || position.arrowSide === "bottom" ? { left: position.arrowOffset - 10 } : { top: position.arrowOffset - 10 }} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M0 10 10 0 20 10" fill="white" stroke="#9ac2f4" strokeWidth="1" /></svg>}
    <div className="kercad-getting-started-content">
    <header title={locale === "es" ? "Arrastra para mover esta tarjeta" : "Drag to move this card"}
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
      const emphasis = locale === "es" ? "profesores" : "teachers";
      const emphasisIndex = line.indexOf(emphasis);
      return <p key={line}>{mode === "3d" && step === 0 ? <><strong>{line.slice(0, line.indexOf(":"))}</strong>{line.slice(line.indexOf(":"))}</> : emphasisIndex >= 0 ? <>{line.slice(0, emphasisIndex)}<strong>{emphasis}</strong>{line.slice(emphasisIndex + emphasis.length)}</> : line}</p>;
    })}</div>
    <footer>{step > 0 && <button type="button" onClick={() => navigate(step - 1)}>{text.previous}</button>}<button type="button" className="primary" onClick={() => step === text.cards.length - 1 ? dismiss() : navigate(step + 1)}>{step === text.cards.length - 1 ? text.finish : text.next}</button></footer>
    </div>
  </section>, document.querySelector(".kercad-reference-shell") ?? document.body);
}
