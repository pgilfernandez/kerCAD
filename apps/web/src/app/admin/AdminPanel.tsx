"use client";
import { useEffect, useId, useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAppLocale } from "@/lib/useAppLocale";
import { DashboardBrandLogo } from "@/components/DashboardBrandLogo";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { uiText, type KercadLocale } from "@/lib/kercadI18n";
import "./admin.css";
type Metrics = { enabled: boolean; sponsorPopupEnabled: boolean; sharedProjectsEnabled: boolean; sharedProjectsConfigured: boolean; sharedProjectsDirectory?: string; sharedProjectsEffectiveDirectory?: string | null; adminPasswordManagedByServer: boolean; since: string; active: number; visitors: number; bytes: number; counts: Record<string, number> };

function AdminPasswordField({ label, locale, title, ...inputProps }: ComponentPropsWithoutRef<"input"> & { label: string; locale: KercadLocale }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = uiText(visible ? "admin.hidePassword" : "admin.showPassword", {}, locale);
  return <div className="kercad-admin-password-field">
    <label htmlFor={id} title={title}>{label}</label>
    <div className="kercad-admin-password-input">
      <input {...inputProps} id={id} title={title} type={visible ? "text" : "password"} />
      <button type="button" aria-controls={id} aria-label={toggleLabel} title={toggleLabel} onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}
export function AdminPanel({ slug, passwordRequired: initialPasswordRequired }: { slug: string; passwordRequired: boolean }) {
  const [locale, setLocale] = useAppLocale();
  const [passwordRequired, setPasswordRequired] = useState(initialPasswordRequired);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [key, setKey] = useState("");
  const [pathInput, setPathInput] = useState(`/${slug}`);
  const [directoryInput, setDirectoryInput] = useState<string | null>(null);
  const [directoryInvalid, setDirectoryInvalid] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ deleted: number; failed: number } | null>(null);
  const authHeaders = (secret: string): Record<string, string> => secret
    ? { Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`admin:${secret}`)))}` }
    : {};
  const resetAccess = (required: boolean) => {
    setKey("");
    setKeyInput("");
    setConfirmation("");
    setMetrics(null);
    setDirectoryInput(null);
    setDirectoryInvalid(false);
    setDeleteResult(null);
    setError(false);
    setPasswordRequired(required);
  };
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
      resetAccess(true);
    } catch { setError(true); }
    finally { setSaving(false); }
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
    if ((passwordRequired && !key) || saving) return;
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
      resetAccess(false);
    } catch { setError(true); }
    finally { setSaving(false); }
  };
  const saveSharedDirectory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!key || saving || directoryInput === null) return;
    setSaving(true);
    setDirectoryInvalid(false);
    try {
      const response = await fetch("/api/admin/metrics", {
        method: "POST", headers: { ...authHeaders(key), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shared-projects-directory", directory: directoryInput }),
      });
      if (response.status === 400) { setDirectoryInvalid(true); return; }
      if (!response.ok) throw new Error();
      setMetrics(await response.json());
      setDirectoryInput(null);
      setError(false);
    } catch { setError(true); }
    finally { setSaving(false); }
  };
  const deleteAllSharedProjects = async () => {
    const directory = passwordRequired ? metrics?.sharedProjectsEffectiveDirectory : null;
    if (!metrics || metrics.sharedProjectsEnabled || saving || (passwordRequired && (!key || !directory))) return;
    const confirmation = directory
      ? uiText("admin.deleteSharedConfirm", { directory }, locale)
      : uiText("admin.deleteSharedConfirmWithoutPath", {}, locale);
    if (!window.confirm(confirmation)) return;
    setSaving(true);
    setDeleteResult(null);
    try {
      const response = await fetch("/api/admin/metrics", {
        method: "POST", headers: { ...authHeaders(key), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-shared-projects", directory, confirm: true }),
      });
      if (!response.ok) throw new Error();
      setDeleteResult(await response.json());
      setError(false);
    } catch { setError(true); }
    finally { setSaving(false); }
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
        if (controller.signal.aborted) return;
        if (response.status === 401) { resetAccess(true); return; }
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
    ["admin.donate", metrics?.counts.donate], ["admin.donateGithub", metrics ? metrics.counts.donateGithub ?? 0 : undefined],
    ["admin.donatePaypal", metrics ? metrics.counts.donatePaypal ?? 0 : undefined], ["admin.github", metrics?.counts.github],
  ] as const;
  return <main className="kercad-admin">
    <header className="kercad-dashboard-topbar">
      <strong className="kercad-dashboard-brand"><DashboardBrandLogo /><span>{uiText("ui.page.kercad.c0bf6d", {}, locale)}</span></strong>
      <EditorHeaderActions locale={locale} onLocaleChange={setLocale} onShowLanding={() => { window.location.href = "/"; }} showDocumentation={false} showDonation startDesigning startDesigningAfterDonation />
    </header>
    <div className="kercad-admin-content">
    <h1>{uiText("admin.title", {}, locale)}</h1>
    {passwordRequired && !key ? <form className="kercad-admin-access-form" onSubmit={signIn}>
      <AdminPasswordField locale={locale} label={uiText("admin.accessKey", {}, locale)} required autoComplete="current-password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} />
      <button className="kercad-admin-telemetry" type="submit" disabled={saving}>{uiText("admin.signIn", {}, locale)}</button>
      {error && <p role="alert">{uiText("admin.signInError", {}, locale)}</p>}
    </form> : <>
    <p>{uiText("admin.explanation", {}, locale)}</p>
    <p>{uiText("admin.telemetryNote", {}, locale)}</p>
    {error && <p role="alert">{uiText("admin.error", {}, locale)}</p>}
    {!passwordRequired ? <>
      <p>{uiText("admin.unprotected", {}, locale)}</p>
      <form className="kercad-admin-access-form kercad-admin-password-setup" onSubmit={setupPassword}>
        <AdminPasswordField locale={locale} label={uiText("admin.newPassword", {}, locale)} title={uiText("admin.passwordMinLength", {}, locale)} required minLength={8} maxLength={128} autoComplete="new-password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} />
        <AdminPasswordField locale={locale} label={uiText("admin.confirmPassword", {}, locale)} required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <button className="kercad-admin-telemetry" type="submit" disabled={saving || keyInput !== confirmation}>{uiText("admin.savePassword", {}, locale)}</button>
        {confirmation && keyInput !== confirmation && <p role="status">{uiText("admin.passwordMismatch", {}, locale)}</p>}
      </form>
    </> : null}
    <form className="kercad-admin-access-form" onSubmit={savePath}>
      <label>{uiText("admin.accessPath", {}, locale)}<input type="text" required maxLength={65} value={pathInput} onChange={(event) => setPathInput(event.target.value)} /></label>
      <button className="kercad-admin-telemetry" type="submit" disabled={saving || !pathInput.trim() || pathInput.trim().replace(/^\//, "") === slug}>{uiText("admin.savePath", {}, locale)}</button>
    </form>
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
    <button className="kercad-admin-telemetry kercad-admin-danger" type="button" disabled={!metrics || metrics.sharedProjectsEnabled || saving} title={uiText("admin.deleteSharedHint", {}, locale)} onClick={() => void deleteAllSharedProjects()}>
      {uiText("admin.deleteShared", {}, locale)}
    </button>
    </div>
    {deleteResult && <p role={deleteResult.failed ? "alert" : "status"}>{uiText("admin.deleteSharedResult", deleteResult, locale)}</p>}
    {passwordRequired ? <>
      <form className="kercad-admin-access-form" onSubmit={saveSharedDirectory}>
        <label>{uiText("admin.sharedDirectory", {}, locale)}
          <input type="text" size={38} maxLength={450} spellCheck={false} value={directoryInput ?? metrics?.sharedProjectsDirectory ?? ""} placeholder={metrics?.sharedProjectsEffectiveDirectory ?? undefined} onChange={(event) => { setDirectoryInput(event.target.value); setDirectoryInvalid(false); }} />
        </label>
        <button className="kercad-admin-telemetry" type="submit" disabled={saving || directoryInput === null || directoryInput.trim() === (metrics?.sharedProjectsDirectory ?? "")}>{uiText("admin.savePath", {}, locale)}</button>
      </form>
      <p>{uiText("admin.sharedDirectoryHint", {}, locale)}</p>
      {directoryInvalid && <p role="alert">{uiText("admin.sharedDirectoryInvalid", {}, locale)}</p>}
    </> : null}
    <div className="kercad-admin-cards">{cards.map(([key, value]) => <section key={key}><h2>{uiText(key, {}, locale)}</h2><strong>{value ?? "—"}</strong></section>)}</div>
    <footer><p>{uiText("admin.bytesNote", {}, locale)}</p>{metrics && <p>{uiText("admin.since", {}, locale)} {new Date(metrics.since).toLocaleString(locale)}</p>}</footer>
    </>}
    </div>
  </main>;
}
