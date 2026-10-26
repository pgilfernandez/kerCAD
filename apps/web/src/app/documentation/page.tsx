"use client";

import { useEffect, useRef, useState } from "react";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import type { KercadLocale } from "@/lib/kercadI18n";

// One entry adds both the sidebar link and its documentation section.
const sections = [
  { id: "getting-started", en: "Getting started", es: "Primeros pasos", contentEn: "Create an empty project, add shapes and adjust their parameters. Use the operation tree to revisit and edit each step.", contentEs: "Crea un proyecto vacío, añade formas y modifica sus parámetros. Usa el árbol de operaciones para volver a editar cada paso." },
  { id: "sketches", en: "Sketches and constraints", es: "Bocetos y restricciones", contentEn: "Draw lines and curves, add dimensions and constraints, and save the sketch to use it in 3D operations.", contentEs: "Dibuja líneas y curvas, añade cotas y restricciones y guarda el boceto para usarlo en operaciones 3D." },
  { id: "tutorials", en: "Tutorials", es: "Tutoriales", contentEn: "Coming soon: guided exercises, examples and teaching resources.", contentEs: "Próximamente: ejercicios guiados, ejemplos y recursos para docentes." },
];

export default function DocumentationPage() {
  const [spanish, setSpanish] = useState(false);
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { setSpanish(new URLSearchParams(window.location.search).get("lang") === "es"); }, []);
  const changeLocale = (locale: KercadLocale) => {
    setSpanish(locale === "es");
    document.documentElement.lang = locale;
    try { localStorage.setItem("kercad.locale", locale); } catch { /* Language can still be changed without storage. */ }
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.history.replaceState(window.history.state, "", url);
  };
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = root.getBoundingClientRect().top + 100;
      let current = sections[0].id;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= top) current = section.id;
      }
      setActiveSection(current);
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    root.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    const initial = document.getElementById(window.location.hash.slice(1));
    initial?.scrollIntoView({ block: "start" });
    update();
    return () => { root.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); cancelAnimationFrame(frame); };
  }, []);
  return <main className="kercad-documentation-page">
    <header className="kercad-dashboard-topbar">
      <strong className="kercad-dashboard-brand"><img className="kercad-dashboard-logo" src="/assets/kercad/logo.svg" alt="" /><span>kerCAD</span></strong>
      <strong className="kercad-documentation-header-title">{spanish ? "Documentación" : "Documentation"}</strong>
      <EditorHeaderActions locale={spanish ? "es" : "en"} onLocaleChange={changeLocale} onShowLanding={() => { window.location.href = "/"; }} showDocumentation={false} startDesigning />
    </header>
    <div className="kercad-documentation-layout">
      <aside className="kercad-documentation-sidebar">
        <strong>{spanish ? "En esta guía" : "In this guide"}</strong>
        <nav aria-label={spanish ? "Secciones de documentación" : "Documentation sections"}>
          {sections.map((section) => <a key={section.id} href={`#${section.id}`} aria-current={activeSection === section.id ? "location" : undefined} onClick={() => setActiveSection(section.id)}>{spanish ? section.es : section.en}</a>)}
        </nav>
      </aside>
      <div ref={content} className="kercad-documentation-content">
      <article>
      <h1>{spanish ? "Aprende a diseñar con kerCAD" : "Learn to design with kerCAD"}</h1>
      <p>{spanish ? "Aquí encontrarás la guía de uso, tutoriales y recursos para aprender CAD paramétrico. Esta página está en preparación." : "Find user guides, tutorials and resources for learning parametric CAD here. This page is under construction."}</p>
      {sections.map((section) => <section key={section.id} id={section.id}><h2>{spanish ? section.es : section.en}</h2><p>{spanish ? section.contentEs : section.contentEn}</p></section>)}
      </article>
      </div>
    </div>
  </main>;
}
