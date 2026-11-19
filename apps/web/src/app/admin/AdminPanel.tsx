"use client";
import { useEffect, useState } from "react";
import { useAppLocale } from "@/lib/useAppLocale";
import { DashboardBrandLogo } from "@/components/DashboardBrandLogo";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { uiText } from "@/lib/kercadI18n";
import "./admin.css";
type Metrics = { enabled: boolean; sponsorPopupEnabled: boolean; sharedProjectsEnabled: boolean; sharedProjectsConfigured: boolean; adminPasswordManagedByServer: boolean; since: string; active: number; visitors: number; bytes: number; counts: Record<string, number> };
export function AdminPanel({ slug, passwordRequired }: { slug: string; passwordRequired: boolean }) {
  const [locale, setLocale] = useAppLocale();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [key, setKey] = useState("");
  const [pathInput, setPathInput] = useState(`/${slug}`);
  const authHeaders = (secret: string): Record<string, string> => secret
    ? { Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`admin:${secret}`)))}` }
    : {};
  const setupPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordRequired || saving || keyInput.length < 8 || !keyInput.trim() || keyInput !== confirmation) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/metrics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup-password", password: keyInput, confirmation }),
      });
      if (!response.ok && response.status !== 409) throw new Error();
      window.location.reload();
    } catch { setError(true); setSaving(false); }
  };
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !keyInput.trim()) return;
    const secret = keyInput;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/metrics", { cache: "no-store", headers: authHeaders(secret) });
      if (!response.ok) throw new Error();
      setMetrics(await response.json());
      setKey(secret);
      setKeyInput("");
      setError(false);
    } catch { setError(true); }
    finally { setSaving(false); }
  };
  const savePath = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!key || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/metrics", {
        method: "POST", headers: { ...authHeaders(key), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin-route", slug: pathInput }),
      });
      if (!response.ok) throw new Error();
      const { path } = await response.json() as { path: string };
      window.location.replace(path);
    } catch { setError(true); setSaving(false); }
  };
  const removePassword = async () => {
    if (!key || saving || metrics?.adminPasswordManagedByServer || !window.confirm(uiText("admin.removePasswordConfirm", {}, locale))) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/metrics", {
        method: "POST", headers: { ...authHeaders(key), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-password" }),
      });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch { setError(true); setSaving(false); }
  };
  const updateSwitch = async (action: "telemetry" | "sponsor-popup" | "shared-projects", enabled: boolean) => {
    if (!metrics || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/metrics", { method: "POST", headers: { ...authHeaders(key), "Content-Type": "application/json" }, body: JSON.stringify({ action, enabled }) });
      if (!response.ok) throw new Error();
      setMetrics(await response.json()); setError(false);
    } catch { setError(true); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (passwordRequired && !key) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/metrics", { cache: "no-store", signal: controller.signal, headers: authHeaders(key) });
        if (response.status === 401 && !passwordRequired) { window.location.reload(); return; }
        if (!response.ok) throw new Error();
        setMetrics(await response.json()); setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [key, passwordRequired]);
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
      <EditorHeaderActions locale={locale} onLocaleChange={setLocale} onShowLanding={() => { window.location.href = "/"; }} showDocumentation={false} showDonation startDesigning />
    </header>
    <div className="kercad-admin-content">
    <h1>{uiText("admin.title", {}, locale)}</h1>
    {passwordRequired && !key ? <form className="kercad-admin-access-form" onSubmit={signIn}>
      <label>{uiText("admin.accessKey", {}, locale)}<input type="password" required autoComplete="current-password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} /></label>
      <button className="kercad-admin-telemetry" type="submit" disabled={saving}>{uiText("admin.signIn", {}, locale)}</button>
      {error && <p role="alert">{uiText("admin.signInError", {}, locale)}</p>}
    </form> : <>
    <p>{uiText("admin.explanation", {}, locale)}</p>
    <p>{uiText("admin.telemetryNote", {}, locale)}</p>
    {error && <p role="alert">{uiText("admin.error", {}, locale)}</p>}
    {!passwordRequired ? <>
      <p>{uiText("admin.unprotected", {}, locale)}</p>
      <form className="kercad-admin-access-form" onSubmit={setupPassword}>
        <label>{uiText("admin.newPassword", {}, locale)}<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} /></label>
        <label>{uiText("admin.confirmPassword", {}, locale)}<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <button className="kercad-admin-telemetry" type="submit" disabled={saving || keyInput !== confirmation}>{uiText("admin.savePassword", {}, locale)}</button>
        {confirmation && keyInput !== confirmation && <p role="status">{uiText("admin.passwordMismatch", {}, locale)}</p>}
      </form>
    </> : <form className="kercad-admin-access-form" onSubmit={savePath}>
      <label>{uiText("admin.accessPath", {}, locale)}<input type="text" required maxLength={65} value={pathInput} onChange={(event) => setPathInput(event.target.value)} /></label>
      <button className="kercad-admin-telemetry" type="submit" disabled={saving || !pathInput.trim() || pathInput.trim().replace(/^\//, "") === slug}>{uiText("admin.savePath", {}, locale)}</button>
    </form>}
    {passwordRequired && (metrics?.adminPasswordManagedByServer
      ? <p>{uiText("admin.passwordManagedByServer", {}, locale)}</p>
      : <button className="kercad-admin-telemetry" type="button" disabled={!metrics || saving} onClick={() => void removePassword()}>{uiText("admin.removePassword", {}, locale)}</button>)}
    <div className="kercad-admin-switches">
    <button className="kercad-admin-telemetry" type="button" role="switch" aria-checked={metrics?.enabled ?? false} disabled={!metrics || saving} onClick={() => void updateSwitch("telemetry", !metrics?.enabled)}>
      <span className="kercad-admin-switch" aria-hidden="true" />{uiText("admin.telemetry", {}, locale)} · {uiText(metrics?.enabled ? "admin.enabled" : "admin.disabled", {}, locale)}
    </button>
    <button className="kercad-admin-telemetry" type="button" role="switch" aria-checked={metrics?.sponsorPopupEnabled ?? false} disabled={!metrics || saving} onClick={() => void updateSwitch("sponsor-popup", !metrics?.sponsorPopupEnabled)}>
      <span className="kercad-admin-switch" aria-hidden="true" />{uiText("admin.sponsorPopup", {}, locale)} · {uiText(metrics?.sponsorPopupEnabled ? "admin.enabled" : "admin.disabled", {}, locale)}
    </button>
    <button className="kercad-admin-telemetry" type="button" role="switch" aria-checked={metrics?.sharedProjectsEnabled ?? false} disabled={!metrics?.sharedProjectsConfigured || saving} onClick={() => void updateSwitch("shared-projects", !metrics?.sharedProjectsEnabled)}>
      <span className="kercad-admin-switch" aria-hidden="true" />{uiText("admin.sharedProjects", {}, locale)} · {uiText(metrics && !metrics.sharedProjectsConfigured ? "admin.sharedProjectsUnconfigured" : metrics?.sharedProjectsEnabled ? "admin.enabled" : "admin.disabled", {}, locale)}
    </button>
    </div>
    <div className="kercad-admin-cards">{cards.map(([key, value]) => <section key={key}><h2>{uiText(key, {}, locale)}</h2><strong>{value ?? "—"}</strong></section>)}</div>
    <footer><p>{uiText("admin.bytesNote", {}, locale)}</p>{metrics && <p>{uiText("admin.since", {}, locale)} {new Date(metrics.since).toLocaleString(locale)}</p>}</footer>
    </>}
    </div>
  </main>;
}
