"use client";

import { HeaderToolbarIcon } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import type { EducadLocale } from "@/lib/educadI18n";

export function EditorHeaderActions({ locale, onLocaleChange }: { locale: EducadLocale; onLocaleChange: (locale: EducadLocale) => void }) {
  const [open, setOpen] = useState(false);
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
    <a href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer" aria-label={locale === "es" ? "Documentación" : "Documentation"} title={locale === "es" ? "Documentación" : "Documentation"}><HeaderToolbarIcon file="documentation" /></a>
    <button type="button" aria-label={locale === "es" ? "Idioma" : "Language"} title={locale === "es" ? "Idioma" : "Language"} aria-expanded={open} aria-controls="educad-header-language-menu" onClick={() => setOpen((value) => !value)}><HeaderToolbarIcon file="language" /></button>
    {open ? <div id="educad-header-language-menu" className="educad-header-language-menu" role="group" aria-label={locale === "es" ? "Idioma" : "Language"}>
      {(["en", "es"] as const).map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => { onLocaleChange(language); setOpen(false); }}>{language === "en" ? "English" : "Español"}</button>)}
    </div> : null}
  </div>;
}
