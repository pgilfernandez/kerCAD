"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HeaderToolbarIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import { consumePreparedLoadingCampaign, prepareProjectLoadingCampaign, projectLoadingCampaign } from "@/lib/projectLoadingCampaign";
import type { ParametricBuildProgress } from "@/lib/parametricBuildProgress";
import "./projectLoadingDialog.css";

const MINIMUM_LOADING_MS = 2_000;

export function ProjectLoadingDialog({ projectName, locale, ready, progress, onFinished }: {
  projectName: string;
  locale: KercadLocale;
  ready: boolean;
  progress: ParametricBuildProgress | null;
  onFinished: () => void;
}) {
  const t = (key: Parameters<typeof kercadTranslate>[1]) => kercadTranslate(locale, key);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [campaign, setCampaign] = useState(projectLoadingCampaign);
  const dialogRef = useAccessibleDialog<HTMLElement>(true, () => {});
  useEffect(() => {
    let active = true;
    void prepareProjectLoadingCampaign("low").then((loaded) => {
      if (!active) return;
      setCampaign(loaded);
      consumePreparedLoadingCampaign(loaded);
    });
    return () => { active = false; };
  }, []);
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

  const percent = ready ? 100 : progress ? Math.max(10, Math.min(99, Math.round(10 + 90 * progress.completed / Math.max(1, progress.total)))) : 10;

  if (typeof document === "undefined") return null;

  return createPortal(<div className="kercad-project-loading-backdrop">
    <section ref={dialogRef} className="kercad-project-loading-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-loading-title" tabIndex={-1} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
      <div className="kercad-project-loading-status" role="status" aria-live="polite" aria-atomic="true">
        <h1 id="kercad-project-loading-title">{t("loading.project")} <span>“{projectName}”</span></h1>
        <div className="kercad-project-loading-bar" role="progressbar" aria-label={t("loading.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
      </div>
      <figure className="kercad-project-loading-campaign">
        {campaign.kind === "video"
          ? <video src={campaign.src} poster={campaign.poster} muted autoPlay loop playsInline preload="metadata" aria-label={t("loading.campaign")} />
          : <img src={campaign.src} alt={t("loading.campaign")} width={960} height={480} loading="eager" fetchPriority="high" decoding="async" onError={() => setCampaign(projectLoadingCampaign)} />}
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
