"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HeaderToolbarIcon } from "@/components/icons";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { EducadAboutContent } from "@/components/EducadAboutContent";
import { aboutContent } from "@/lib/aboutContent";
import "./educadLanding.css";
import { normalizeEducadLocale, type EducadLocale } from "@/lib/educadI18n";

type Props = {
  projectCount: number;
  preview?: string;
  onStart: () => void;
  onOpenChallenges: () => void;
};

export function EducadLandingPage({ preview, onStart, onOpenChallenges }: Props) {
  const [locale, setLocale] = useState<EducadLocale>("en");
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionsMenuRef = useRef<HTMLDivElement>(null);
  const sectionsTriggerRef = useRef<HTMLButtonElement>(null);
  const sectionLinksRef = useRef<HTMLElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, arrow: 20 });
  useLayoutEffect(() => {
    if (!sectionsOpen) return;
    const trigger = sectionsTriggerRef.current, menu = sectionLinksRef.current;
    const parent = trigger?.closest(".educad-landing-header-actions");
    if (!trigger || !menu || !parent) return;
    const update = () => {
      const button = trigger.getBoundingClientRect();
      const center = button.left + button.width / 2;
      const left = Math.max(12, Math.min(center - 28, window.innerWidth - menu.offsetWidth - 12));
      setMenuPosition({ left: left - parent.getBoundingClientRect().left, arrow: center - left });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [sectionsOpen, locale]);
  const sectionIds = ["top", "learning", "features", "challenges", "community", "stories"];
  const navigation = aboutContent[locale].navigation.map((label, index) => ({ id: sectionIds[index], label }));
  useEffect(() => {
    if (!sectionsOpen) return;
    const outside = (event: PointerEvent) => { if (!sectionsMenuRef.current?.contains(event.target as Node)) setSectionsOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setSectionsOpen(false); sectionsTriggerRef.current?.focus(); } };
    const breakpoint = window.matchMedia("(max-width: 1500px)");
    const resize = () => { if (!breakpoint.matches) setSectionsOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    breakpoint.addEventListener("change", resize);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); breakpoint.removeEventListener("change", resize); };
  }, [sectionsOpen]);
  useEffect(() => {
    try { setLocale(normalizeEducadLocale(localStorage.getItem("educad.locale"))); } catch { /* Keep English when storage is unavailable. */ }
  }, []);
  const changeLocale = (language: EducadLocale) => {
    setLocale(language);
    document.documentElement.lang = language;
    try { localStorage.setItem("educad.locale", language); } catch { /* Language selection remains usable without storage. */ }
  };
  return <main className="educad-landing educad-about-page" lang={locale}>
    <header className="educad-landing-nav educad-dashboard-topbar">
      <strong className="educad-dashboard-brand"><img className="educad-dashboard-logo" src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></strong>
      <nav lang={locale} aria-label={locale === "es" ? "Navegación principal" : "Main navigation"}>{navigation.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</nav>
      <div className="educad-landing-header-actions">
        <div ref={sectionsMenuRef} className="educad-landing-section-control">
          <button ref={sectionsTriggerRef} type="button" className="educad-landing-menu-trigger" aria-label={locale === "es" ? "Secciones de la página" : "Page sections"} title={locale === "es" ? "Secciones de la página" : "Page sections"} aria-expanded={sectionsOpen} aria-controls="educad-landing-section-menu" onClick={() => setSectionsOpen((open) => !open)}><HeaderToolbarIcon file="menu" /></button>
          {sectionsOpen && <nav ref={sectionLinksRef} id="educad-landing-section-menu" className="educad-landing-section-menu" style={{ left: menuPosition.left }} lang={locale} aria-label={locale === "es" ? "Secciones de la página" : "Page sections"}><svg className="educad-landing-menu-pointer" style={{ left: menuPosition.arrow - 10 }} width="20" height="10" viewBox="0 0 20 10" aria-hidden="true"><path d="M0 10 10 0 20 10" fill="white" stroke="#c7d5de" strokeWidth="1" /></svg>{navigation.map((item) => <a key={item.id} href={`#${item.id}`} onClick={() => setSectionsOpen(false)}>{item.label}</a>)}</nav>}
        </div>
        <EditorHeaderActions locale={locale} onLocaleChange={changeLocale} onShowLanding={onStart} showDocumentation={false} showDonation startDesigning compactInformation />
      </div>
    </header>

    <EducadAboutContent locale={locale} preview={preview} onStart={onStart} onOpenChallenges={onOpenChallenges} />
  </main>;
}
