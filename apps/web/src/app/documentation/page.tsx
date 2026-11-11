"use client";

import { DashboardBrandLogo } from "@/components/DashboardBrandLogo";

import { useEffect, useRef, useState } from "react";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { uiText, getLocaleContent } from "@/lib/kercadI18n";
import { useAppLocale } from "@/lib/useAppLocale";

export default function DocumentationPage() {
  const [locale, setLocale] = useAppLocale();
  const sections = getLocaleContent(locale, "documentation").sections;
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const content = useRef<HTMLDivElement>(null);
  const changeLocale = setLocale;
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
      <strong className="kercad-dashboard-brand"><DashboardBrandLogo /><span>{uiText("ui.page.kercad.c0bf6d", {}, locale)}</span></strong>
      <strong className="kercad-documentation-header-title">{uiText("ui.page.documentation.9e9cf3", {}, locale)}</strong>
      <EditorHeaderActions locale={locale} onLocaleChange={changeLocale} onShowLanding={() => { window.location.href = "/"; }} showDocumentation={false} startDesigning />
    </header>
    <div className="kercad-documentation-layout">
      <aside className="kercad-documentation-sidebar">
        <strong>{uiText("ui.page.in.this.guide.fec75f", {}, locale)}</strong>
        <nav aria-label={uiText("ui.page.documentation.sections.05ee4a", {}, locale)}>
          {sections.map((section) => <a key={section.id} href={`#${section.id}`} aria-current={activeSection === section.id ? "location" : undefined} onClick={() => setActiveSection(section.id)}>{section.title}</a>)}
        </nav>
      </aside>
      <div ref={content} className="kercad-documentation-content">
      <article>
      <h1>{uiText("ui.page.learn.to.design.with.kercad.527e8b", {}, locale)}</h1>
      <p>{uiText("ui.page.find.user.guides.tutorials.and.resources.for.lea.d0ae27", {}, locale)}</p>
      {sections.map((section) => <section key={section.id} id={section.id}><h2>{section.title}</h2><p>{section.content}</p></section>)}
      </article>
      </div>
    </div>
  </main>;
}
