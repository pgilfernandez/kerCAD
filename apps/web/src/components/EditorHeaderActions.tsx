"use client";

import { HeaderToolbarIcon } from "@/components/icons";
import { createPortal } from "react-dom";
import { version, license } from "../../../../package.json";
import { useEffect, useRef, useState } from "react";
import type { EducadLocale } from "@/lib/educadI18n";

export function EditorHeaderActions({ locale, onLocaleChange }: { locale: EducadLocale; onLocaleChange: (locale: EducadLocale) => void }) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLElement>(null);
  const infoTriggerRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open && !infoOpen) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !infoRef.current?.contains(event.target as Node)) { setOpen(false); setInfoOpen(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setInfoOpen(false);
        if (infoOpen) infoTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, infoOpen]);
  return <div ref={root} className="educad-header-actions">
    <button type="button" aria-label={locale === "es" ? "Idioma" : "Language"} title={locale === "es" ? "Idioma" : "Language"} aria-expanded={open} aria-controls="educad-header-language-menu" onClick={() => { setInfoOpen(false); setOpen((value) => !value); }}><HeaderToolbarIcon file="language" /></button>
    <button ref={infoTriggerRef} type="button" aria-label={locale === "es" ? "Acerca de eduCAD" : "About eduCAD"} title={locale === "es" ? "Acerca de eduCAD" : "About eduCAD"} aria-expanded={infoOpen} aria-controls="educad-about-panel" onClick={() => { setOpen(false); setInfoOpen((value) => !value); }}><HeaderToolbarIcon file="information" /></button>
    {infoOpen ? createPortal(
      <section ref={infoRef} id="educad-about-panel" className="educad-about-dialog" role="dialog" aria-modal="false" aria-labelledby="educad-about-title" tabIndex={-1}>
        <header><h2 id="educad-about-title">{locale === "es" ? "Acerca de eduCAD" : "About eduCAD"}</h2><button type="button" aria-label={locale === "es" ? "Cerrar" : "Close"} onClick={() => setInfoOpen(false)}>×</button></header>
        <p>{locale === "es" ? "CAD paramétrico de código abierto para educación." : "Open-source parametric CAD for education."}</p>
        <dl>
          <dt>{locale === "es" ? "Versión" : "Version"}</dt><dd>{version}</dd>
          <dt>{locale === "es" ? "Motor CAD" : "CAD engine"}</dt><dd>OpenCascade · WebAssembly (occt-wasm)</dd>
          <dt>{locale === "es" ? "Visor 3D" : "3D viewer"}</dt><dd>Three.js · WebGL</dd>
          <dt>{locale === "es" ? "Bocetos" : "Sketches"}</dt><dd>SVG · {locale === "es" ? "Restricciones paramétricas" : "Parametric constraints"}</dd>
          <dt>{locale === "es" ? "Licencia" : "License"}</dt><dd>{license}</dd>
        </dl>
        <nav className="educad-about-links" aria-label={locale === "es" ? "Recursos del proyecto" : "Project resources"}>
          <a href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="documentation" />{locale === "es" ? "Documentación y tutoriales" : "Documentation and tutorials"}</a>
          <a href="/?about=1" target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="project-overview" />{locale === "es" ? "Página del proyecto" : "Project overview"}</a>
        </nav>
        <footer><p lang="en">designed with love by Pablo Gil Fernández</p></footer>
      </section>
    , document.body) : null}
    {open ? <div id="educad-header-language-menu" className="educad-header-language-menu" role="group" aria-label={locale === "es" ? "Idioma" : "Language"}>
      {(["en", "es"] as const).map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => { onLocaleChange(language); setOpen(false); }}>{language === "en" ? "English" : "Español"}</button>)}
    </div> : null}
  </div>;
}
