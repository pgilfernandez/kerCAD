"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HeaderToolbarIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { educadTranslate, type EducadLocale } from "@/lib/educadI18n";
import { projectLoadingCampaign as campaign } from "@/lib/projectLoadingCampaign";
import "./projectLoadingDialog.css";

const MINIMUM_LOADING_MS = 3_000;

export function ProjectLoadingDialog({ projectName, locale, ready, onFinished }: {
  projectName: string;
  locale: EducadLocale;
  ready: boolean;
  onFinished: () => void;
}) {
  const t = (key: Parameters<typeof educadTranslate>[1]) => educadTranslate(locale, key);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const dialogRef = useAccessibleDialog<HTMLElement>(true, () => {});
  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready || !minimumElapsed) return;
    // Let the viewport commit and paint its initial geometry before uncovering it.
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(onFinished);
    });
    return () => { window.cancelAnimationFrame(firstFrame); window.cancelAnimationFrame(secondFrame); };
  }, [ready, minimumElapsed, onFinished]);

  return createPortal(<div className="educad-project-loading-backdrop">
    <section ref={dialogRef} className="educad-project-loading-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-project-loading-title" tabIndex={-1} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
      <header><img src="/assets/educad/logo.svg" alt="" aria-hidden="true" /><strong>eduCAD</strong></header>
      <div className="educad-project-loading-status" role="status" aria-live="polite" aria-atomic="true">
        <h1 id="educad-project-loading-title">{t("loading.project")} <span>“{projectName}”</span></h1>
        <div className="educad-project-loading-bar" aria-hidden="true"><span /></div>
      </div>
      <figure className="educad-project-loading-campaign">
        {campaign.kind === "video"
          ? <video src={campaign.src} poster={campaign.poster} muted autoPlay loop playsInline preload="metadata" aria-label={t("loading.campaign")} />
          : <img src={campaign.src} alt={t("loading.campaign")} />}
        <figcaption>{t("loading.campaign")}</figcaption>
      </figure>
      <footer>
        <p>{t("loading.freeOpenSource")}</p>
        {campaign.supportUrl
          ? <a href={campaign.supportUrl} target="_blank" rel="noopener noreferrer"><HeaderToolbarIcon file="donate" />{t("loading.support")}</a>
          : <button type="button" disabled title={t("about.donatePending")}><HeaderToolbarIcon file="donate" />{t("loading.support")}</button>}
        {!campaign.supportUrl && <small>{t("about.donatePending")}</small>}
      </footer>
    </section>
  </div>, document.body);
}
