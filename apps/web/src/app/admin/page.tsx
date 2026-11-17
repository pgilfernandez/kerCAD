"use client";
import { useEffect, useState } from "react";
import { useAppLocale } from "@/lib/useAppLocale";
import { DashboardBrandLogo } from "@/components/DashboardBrandLogo";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { uiText } from "@/lib/kercadI18n";
import "./admin.css";
type Metrics = { since: string; active: number; visitors: number; bytes: number; counts: Record<string, number> };
export default function AdminPage() {
  const [locale, setLocale] = useAppLocale();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/metrics", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        setMetrics(await response.json()); setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const cards = [
    ["admin.projects", metrics?.counts.project], ["admin.challenges", metrics?.counts.challenge],
    ["admin.active", metrics?.active], ["admin.visitors", metrics?.visitors],
    ["admin.megabytes", metrics ? (metrics.bytes / 1e6).toFixed(2) : undefined],
    ["admin.documentation", metrics?.counts.documentation], ["admin.overview", metrics?.counts.overview],
    ["admin.donate", metrics?.counts.donate], ["admin.github", metrics?.counts.github],
  ] as const;
  return <main className="kercad-admin">
    <header className="kercad-dashboard-topbar">
      <strong className="kercad-dashboard-brand"><DashboardBrandLogo /><span>{uiText("ui.page.kercad.c0bf6d", {}, locale)}</span></strong>
      <EditorHeaderActions locale={locale} onLocaleChange={setLocale} onShowLanding={() => { window.location.href = "/?about=1"; }} showDonation />
    </header>
    <div className="kercad-admin-content">
    <h1>{uiText("admin.title", {}, locale)}</h1><a href="/">{uiText("admin.back", {}, locale)}</a>
    <p className="kercad-admin-warning">{uiText("admin.public", {}, locale)}</p>
    <p>{uiText("admin.explanation", {}, locale)}</p>
    {error && <p role="alert">{uiText("admin.error", {}, locale)}</p>}
    <div className="kercad-admin-cards">{cards.map(([key, value]) => <section key={key}><h2>{uiText(key, {}, locale)}</h2><strong>{value ?? "—"}</strong></section>)}</div>
    <footer><p>{uiText("admin.bytesNote", {}, locale)}</p>{metrics && <p>{uiText("admin.since", {}, locale)} {new Date(metrics.since).toLocaleString(locale)}</p>}</footer>
    </div>
  </main>;
}
