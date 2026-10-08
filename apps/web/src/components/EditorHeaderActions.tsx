"use client";

import { HeaderToolbarIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { createPortal } from "react-dom";
import { version, license } from "../../../../package.json";
import { useEffect, useRef, useState } from "react";
import type { EducadLocale } from "@/lib/educadI18n";

export function EditorHeaderActions({ locale, onLocaleChange }: { locale: EducadLocale; onLocaleChange: (locale: EducadLocale) => void }) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useAccessibleDialog(infoOpen, () => setInfoOpen(false));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className="educad-header-actions">
    <button type="button" aria-label={locale === "es" ? "Idioma" : "Language"} title={locale === "es" ? "Idioma" : "Language"} aria-expanded={open} aria-controls="educad-header-language-menu" onClick={() => setOpen((value) => !value)}><HeaderToolbarIcon file="language" /></button>
    <button type="button" aria-label={locale === "es" ? "Acerca de eduCAD" : "About eduCAD"} title={locale === "es" ? "Acerca de eduCAD" : "About eduCAD"} onClick={() => { setOpen(false); setInfoOpen(true); }}><HeaderToolbarIcon file="information" /></button>
    {infoOpen ? createPortal(<div className="educad-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setInfoOpen(false); }}>
      <section ref={infoRef} className="educad-about-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-about-title" tabIndex={-1}>
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
    </div>, document.body) : null}
    {open ? <div id="educad-header-language-menu" className="educad-header-language-menu" role="group" aria-label={locale === "es" ? "Idioma" : "Language"}>
      {(["en", "es"] as const).map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => { onLocaleChange(language); setOpen(false); }}>{language === "en" ? "English" : "Español"}</button>)}
    </div> : null}
  </div>;
}
