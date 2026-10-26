"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HeaderToolbarIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import { projectLoadingCampaign as campaign } from "@/lib/projectLoadingCampaign";
import type { ParametricBuildProgress } from "@/lib/parametricBuildProgress";
import "./projectLoadingDialog.css";

const MINIMUM_LOADING_MS = 3_000;

export function ProjectLoadingDialog({ projectName, locale, ready, progress, onFinished }: {
  projectName: string;
  locale: KercadLocale;
  ready: boolean;
  progress: ParametricBuildProgress | null;
  onFinished: () => void;
}) {
  const t = (key: Parameters<typeof kercadTranslate>[1]) => kercadTranslate(locale, key);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const dialogRef = useAccessibleDialog<HTMLElement>(true, () => {});
  useEffect(() => {
    const startedAt = performance.now();
    const clock = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 250);
    const timer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_LOADING_MS);
    return () => { window.clearTimeout(timer); window.clearInterval(clock); };
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

  const percent = ready ? 100 : progress ? Math.min(99, Math.round(100 * progress.completed / Math.max(1, progress.total))) : 0;
  // Extrapolate observed throughput; CAD steps have different costs, so the ETA
  // deliberately remains approximate and is recalculated as each step finishes.
  const remainingModelMs = progress && progress.completed > 0
    ? elapsedMs * Math.max(0, progress.total - progress.completed) / progress.completed
    : null;
  const remainingMinimumMs = Math.max(0, MINIMUM_LOADING_MS - elapsedMs);
  const remainingText = ready
    ? minimumElapsed ? t("loading.opening") : t("loading.openingIn").replace("{seconds}", String(Math.max(1, Math.ceil(remainingMinimumMs / 1000))))
    : remainingModelMs === null ? t("loading.estimating") : t("loading.remaining").replace("{seconds}", String(Math.max(1, Math.ceil(Math.max(remainingMinimumMs, remainingModelMs) / 1000))));
  const phaseText = ready ? t("loading.opening") : t(progress?.stage === "meshing" || progress?.stage === "ready" ? "loading.meshing" : progress?.stage === "operations" ? "loading.operations" : "loading.initializing");

  return createPortal(<div className="kercad-project-loading-backdrop">
    <section ref={dialogRef} className="kercad-project-loading-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-loading-title" tabIndex={-1} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
      <div className="kercad-project-loading-status" role="status" aria-live="polite" aria-atomic="true">
        <h1 id="kercad-project-loading-title">{t("loading.project")} <span>“{projectName}”</span></h1>
        <div className="kercad-project-loading-bar" role="progressbar" aria-label={t("loading.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress || ready ? percent : undefined} aria-valuetext={`${phaseText} · ${remainingText}`}><span style={{ width: `${percent}%` }} /></div>
        <div className="kercad-project-loading-estimate">{remainingText}</div>
      </div>
      <figure className="kercad-project-loading-campaign">
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
