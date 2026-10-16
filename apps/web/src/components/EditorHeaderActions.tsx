"use client";

import { HeaderToolbarIcon } from "@/components/icons";
import { createPortal } from "react-dom";
import { version, license } from "../../../../package.json";
import { useEffect, useRef, useState } from "react";
import { educadTranslate, type EducadLocale, type EducadTranslationKey } from "@/lib/educadI18n";

export function EditorHeaderActions({ locale, onLocaleChange, onShowLanding }: { locale: EducadLocale; onLocaleChange: (locale: EducadLocale) => void; onShowLanding?: () => void }) {
  const t = (key: EducadTranslationKey) => educadTranslate(locale, key);
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
  return <div ref={root} className={`educad-header-actions${onShowLanding ? " dashboard-header-actions" : ""}`}>
    <button ref={infoTriggerRef} type="button" aria-label={t("about.label")} title={t("about.title")} aria-expanded={infoOpen} aria-controls="educad-about-panel" onClick={() => { setOpen(false); setInfoOpen((value) => !value); }}><HeaderToolbarIcon file="information" />{onShowLanding && <span>{t("about.title")}</span>}</button>
    {onShowLanding && <>
      <a href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer" title={t("about.documentation")}><HeaderToolbarIcon file="documentation" /><span>{locale === "es" ? "Documentación" : "Documentation"}</span></a>
    </>}
    <button type="button" aria-label={t("settings.language")} title={t("settings.language")} aria-expanded={open} aria-controls="educad-header-language-menu" onClick={() => { setInfoOpen(false); setOpen((value) => !value); }}><HeaderToolbarIcon file="language" /></button>
    {infoOpen ? createPortal(
      <section ref={infoRef} id="educad-about-panel" className="educad-about-dialog" role="dialog" aria-modal="false" aria-labelledby="educad-about-title" tabIndex={-1}>
        <header><h2 id="educad-about-title">{t("about.title")}</h2><button type="button" aria-label={t("common.close")} onClick={() => setInfoOpen(false)}>×</button></header>
        <p>{t("about.description")}</p>
        <dl>
          <dt>{t("about.version")}</dt><dd>{version}</dd>
          <dt>{t("about.cadEngine")}</dt><dd>OpenCascade · WebAssembly (occt-wasm)</dd>
          <dt>{t("about.viewer")}</dt><dd>Three.js · WebGL</dd>
          <dt>{t("about.sketches")}</dt><dd>SVG · {t("about.constraints")}</dd>
          <dt>{t("about.license")}</dt><dd>{license}</dd>
        </dl>
        <nav className="educad-about-links" aria-label={t("about.resources")}>
          <a href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="documentation" />{t("about.documentation")}</a>
          <a href="/?about=1" target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="project-overview" />{t("about.projectOverview")}</a>
        </nav>
        <footer><p lang={locale}>{t("about.credit")}</p></footer>
      </section>
    , document.body) : null}
    {open ? <div id="educad-header-language-menu" className="educad-header-language-menu" role="group" aria-label={t("settings.language")}>
      {(["en", "es"] as const).map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => { onLocaleChange(language); setOpen(false); }}>{t(language === "en" ? "settings.english" : "settings.spanish")}</button>)}
    </div> : null}
  </div>;
}
