"use client";

import { HeaderToolbarIcon } from "@/components/icons";
import { PopupPointer } from "@/components/PopupPointer";
import { useDonationPopup } from "@/components/DonationPopup";
import { createPortal } from "react-dom";
import packageInfo from "../../../../package.json";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { KERCAD_LOCALES, kercadTranslate, type KercadLocale, type KercadTranslationKey } from "@/lib/kercadI18n";
import { AccentColorOptions } from "@/components/AccentColorOptions";
import { useAppTheme } from "@/lib/useAppTheme";
import { Moon, Sun } from "lucide-react";
import { uiText, getLanguageName } from "@/lib/kercadI18n";

const GITHUB_URL = "https://github.com/pgilfernandez/SketchForge-3D-App/";

export function EditorHeaderActions({ locale, onLocaleChange, onShowLanding, onLaunchTutorial, showDocumentation = true, startDesigning = false, showDonation = false, compactInformation = false }: { locale: KercadLocale; onLocaleChange: (locale: KercadLocale) => void; onShowLanding?: () => void; onLaunchTutorial?: () => void; showDocumentation?: boolean; startDesigning?: boolean; showDonation?: boolean; compactInformation?: boolean }) {
  const t = (key: KercadTranslationKey) => kercadTranslate(locale, key);
  const donation = useDonationPopup();
  const { theme, setTheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLElement>(null);
  const infoTriggerRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [infoTop, setInfoTop] = useState(40);
  const [languageTop, setLanguageTop] = useState(40);
  useLayoutEffect(() => {
    if (!infoOpen && !open) return;
    const header = root.current?.closest("header");
    if (!root.current) return;
    const update = () => {
      const top = onShowLanding && header ? header.getBoundingClientRect().bottom - 8 : 40;
      setInfoTop(top);
      setLanguageTop(top - (root.current?.getBoundingClientRect().top ?? 0));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root.current);
    if (header) observer.observe(header);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [infoOpen, open, onShowLanding]);
  useEffect(() => {
    if (!open && !infoOpen) return;
    const outside = (event: PointerEvent) => {
      if (donation.open) return;
      if (!root.current?.contains(event.target as Node) && !infoRef.current?.contains(event.target as Node)) { setOpen(false); setInfoOpen(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (donation.open) return;
      if (event.key === "Escape") {
        setOpen(false);
        setInfoOpen(false);
        if (infoOpen) infoTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, infoOpen, donation.open]);
  return <div ref={root} className={`kercad-header-actions${onShowLanding ? " dashboard-header-actions" : ""}`}>
    {onShowLanding && <>
      {showDonation && startDesigning && <button type="button" className="kercad-header-start-designing" aria-label={t("about.startDesigning")} title={t("about.startDesigning")} onClick={onShowLanding}><HeaderToolbarIcon file="square-pen" /><span>{t("about.startDesigning")}</span></button>}
      {showDonation ? <button type="button" aria-haspopup="dialog" aria-label={t("about.donate")} title={t("about.donate")} onClick={(event) => { setOpen(false); setInfoOpen(false); donation.show(locale, event.currentTarget); }}><HeaderToolbarIcon file="donate" /><span>{t("about.donate")}</span></button> : <button type="button" className={startDesigning ? "kercad-header-start-designing" : undefined} aria-label={t(startDesigning ? "about.startDesigning" : "about.projectOverview")} title={t(startDesigning ? "about.startDesigning" : "about.projectOverview")} onClick={onShowLanding}><HeaderToolbarIcon file={startDesigning ? "square-pen" : "project-overview"} /><span>{t(startDesigning ? "about.startDesigning" : "about.projectOverview")}</span></button>}
      {showDocumentation && <a data-tutorial="documentation" href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer" title={t("about.documentation")}><HeaderToolbarIcon file="documentation" /><span>{uiText("ui.page.documentation.9e9cf3", {}, locale)}</span></a>}
    </>}
    <button ref={infoTriggerRef} type="button" aria-label={t("about.label")} title={t("about.title")} aria-expanded={infoOpen} aria-controls="kercad-about-panel" onClick={() => { setOpen(false); setInfoOpen((value) => !value); }}><HeaderToolbarIcon file="information" />{onShowLanding && !compactInformation && <span>{t("about.title")}</span>}</button>
    <button data-tutorial="appearance-language" type="button" aria-label={t("settings.appearanceLanguage")} title={t("settings.appearanceLanguage")} aria-expanded={open} aria-controls="kercad-header-language-menu" onClick={() => { setInfoOpen(false); setOpen((value) => !value); }}><HeaderToolbarIcon file="theme-language" /></button>
    <PopupPointer open={infoOpen} panel="#kercad-about-panel" trigger='button[aria-controls="kercad-about-panel"]' />
    <PopupPointer open={open} panel="#kercad-header-language-menu" trigger='button[aria-controls="kercad-header-language-menu"]' />
    {infoOpen ? createPortal(
      <section ref={infoRef} id="kercad-about-panel" className="kercad-about-dialog" style={onShowLanding ? { top: infoTop, maxHeight: `calc(100dvh - ${infoTop + 12}px)` } : undefined} role="dialog" aria-modal="false" aria-labelledby="kercad-about-title" tabIndex={-1}>
        <header><h2 id="kercad-about-title">{t("about.title")}</h2><button type="button" aria-label={t("common.close")} onClick={() => setInfoOpen(false)}>×</button></header>
        <p>{t("about.description")}</p>
        <dl>
          <dt>{t("about.version")}</dt><dd>0.9 ({process.env.NEXT_PUBLIC_KERCAD_COMMIT ?? "—"})</dd>
          <dt>{t("about.cadEngine")}</dt><dd>{uiText("ui.editorheaderactions.opencascade.webassembly.occt.wasm.ee4783", {}, locale)}</dd>
          <dt>{t("about.viewer")}</dt><dd>{uiText("ui.editorheaderactions.three.js.webgl.a44d17", {}, locale)}</dd>
          <dt>{t("about.sketches")}</dt><dd>{uiText("ui.editorheaderactions.svg.ec9928", {}, locale)}{" "}{t("about.constraints")}</dd>
          <dt>{t("about.license")}</dt><dd>{packageInfo.license}</dd>
        </dl>
        <nav className="kercad-about-links" aria-label={t("about.resources")}>
          <a href={`/documentation?lang=${locale}`} target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="documentation" />{t("about.documentation")}</a>
          <a href="/?about=1" target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="project-overview" />{t("about.projectOverview")}</a>
          {onLaunchTutorial && <button type="button" onClick={() => { setInfoOpen(false); onLaunchTutorial(); }}><HeaderToolbarIcon file="documentation" />{t("about.launchTutorial")}</button>}
          <div className="kercad-about-support-links">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" title={uiText("ui.editorheaderactions.github.5442e2", {}, locale)}><HeaderToolbarIcon file="github" />{uiText("ui.editorheaderactions.github.5442e2", {}, locale)}</a>
            <button type="button" aria-haspopup="dialog" title={t("about.donate")} onClick={(event) => donation.show(locale, event.currentTarget)}><HeaderToolbarIcon file="donate" />{t("about.donate")}</button>
          </div>
        </nav>
        <footer><p lang={locale}>{t("about.credit")}</p></footer>
      </section>
    , document.body) : null}
    {open ? <div id="kercad-header-language-menu" className="kercad-header-language-menu" style={{ top: languageTop }} aria-label={t("settings.appearanceLanguage")}>
      <div className="kercad-header-preference-group" role="group" aria-labelledby="kercad-header-theme-heading"><span id="kercad-header-theme-heading" className="kercad-header-preference-heading">{t("settings.theme")}</span>
        <div className="kercad-header-theme-options">{(["light", "dark"] as const).map((option) => <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)}>{option === "light" ? <Sun size={16} /> : <Moon size={16} />}<span>{t(option === "light" ? "settings.themeLight" : "settings.themeDark")}</span></button>)}</div>
        <AccentColorOptions locale={locale} />
      </div>
      <hr className="kercad-header-preference-separator" />
      <div className="kercad-header-preference-group" role="group" aria-labelledby="kercad-header-language-heading"><span id="kercad-header-language-heading" className="kercad-header-preference-heading">{t("settings.language")}</span>
      {KERCAD_LOCALES.map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => { onLocaleChange(language); setOpen(false); }}>{getLanguageName(language)}</button>)}
      </div>
    </div> : null}
  </div>;
}
