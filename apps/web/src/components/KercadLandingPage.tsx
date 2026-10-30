"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HeaderToolbarIcon } from "@/components/icons";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { KercadAboutContent } from "@/components/KercadAboutContent";
import { getAboutContent } from "@/lib/aboutContent";
import "./kercadLanding.css";
import { uiText } from "@/lib/kercadI18n";
import { useAppLocale } from "@/lib/useAppLocale";

type Props = {
  projectCount: number;
  preview?: string;
  onStart: () => void;
  onOpenChallenges: () => void;
};

export function KercadLandingPage({ preview, onStart, onOpenChallenges }: Props) {
  const [locale, setLocale] = useAppLocale();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionsMenuRef = useRef<HTMLDivElement>(null);
  const sectionsTriggerRef = useRef<HTMLButtonElement>(null);
  const sectionLinksRef = useRef<HTMLElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, arrow: 20 });
  useLayoutEffect(() => {
    if (!sectionsOpen) return;
    const trigger = sectionsTriggerRef.current, menu = sectionLinksRef.current;
    const parent = trigger?.closest(".kercad-landing-header-actions");
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
  const navigation = getAboutContent(locale).navigation.map((label, index) => ({ id: sectionIds[index], label }));
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
  const changeLocale = setLocale;
  return <main className="kercad-landing kercad-about-page" lang={locale}>
    <header className="kercad-landing-nav kercad-dashboard-topbar">
      <strong className="kercad-dashboard-brand"><img className="kercad-dashboard-logo" src="/assets/kercad/logo.svg" alt="" /><span>{uiText("ui.page.kercad.c0bf6d", {}, locale)}</span></strong>
      <nav lang={locale} aria-label={uiText("ui.kercadlandingpage.main.navigation.efd197", {}, locale)}>{navigation.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</nav>
      <div className="kercad-landing-header-actions">
        <div ref={sectionsMenuRef} className="kercad-landing-section-control">
          <button ref={sectionsTriggerRef} type="button" className="kercad-landing-menu-trigger" aria-label={uiText("ui.kercadlandingpage.page.sections.630cb5", {}, locale)} title={uiText("ui.kercadlandingpage.page.sections.630cb5", {}, locale)} aria-expanded={sectionsOpen} aria-controls="kercad-landing-section-menu" onClick={() => setSectionsOpen((open) => !open)}><HeaderToolbarIcon file="menu" /></button>
          {sectionsOpen && <nav ref={sectionLinksRef} id="kercad-landing-section-menu" className="kercad-landing-section-menu" style={{ left: menuPosition.left }} lang={locale} aria-label={uiText("ui.kercadlandingpage.page.sections.630cb5", {}, locale)}><svg className="kercad-landing-menu-pointer" style={{ left: menuPosition.arrow - 10 }} width="20" height="10" viewBox="0 0 20 10" aria-hidden="true"><path d="M0 10 10 0 20 10" fill="white" stroke="#c7d5de" strokeWidth="1" /></svg>{navigation.map((item) => <a key={item.id} href={`#${item.id}`} onClick={() => setSectionsOpen(false)}>{item.label}</a>)}</nav>}
        </div>
        <EditorHeaderActions locale={locale} onLocaleChange={changeLocale} onShowLanding={onStart} showDocumentation={false} showDonation startDesigning compactInformation />
      </div>
    </header>

    <KercadAboutContent locale={locale} preview={preview} onStart={onStart} onOpenChallenges={onOpenChallenges} />
  </main>;
}
