"use client";

import { PROJECT_FILE_PATTERN } from "@/lib/legacyBrand";
import { dashboardTranslate, type DashboardTranslationKey } from "@/lib/dashboardI18n";
import type { KercadLocale } from "@/lib/kercadI18n";
import { uploadSharedThumbnail } from "@/lib/sharedProjectThumbnail";
import { useEffect, useState } from "react";
import { exportKercadProject, importKercadProject, KERCAD_PACKAGE_MEDIA_TYPE } from "@/lib/kercadProject";
import { getLibraryProject, newProjectLibraryId, saveLibraryProject, type ProjectLibraryEntry } from "@/lib/projectLibrary";

type SharedFile = { fileName: string; name: string; revision: string; updatedAt: number; updatedBy?: string; thumbnailUrl?: string };
const endpoint = "/api/kercad-shared-projects";

export function SharedProjects({ projects, onOpen, onSaved, locale = "en" }: {
  locale?: KercadLocale;
  projects: ProjectLibraryEntry[];
  onOpen: (entry: ProjectLibraryEntry) => void;
  onSaved: () => void;
}) {
  const t = (key: DashboardTranslationKey, values?: Record<string, string | number>) => dashboardTranslate(locale, key, values);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  useEffect(() => {
    try { setAuthor(localStorage.getItem("kercad.shared-author") ?? ""); } catch {}
  }, []);
  const [conflict, setConflict] = useState(false);
  const refresh = async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.enabled) throw new Error(payload.error || t("dashboard.shared.storage.is.unavailable.d66703"));
    setFiles(payload.projects);
  };
  useEffect(() => { void refresh().catch(error => setMessage(error.message)); }, []);
  const open = async (file: SharedFile) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${endpoint}?fileName=${encodeURIComponent(file.fileName)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(t("dashboard.could.not.open.the.shared.project.refresh.the.library.a.2cc45c"));
      const revision = response.headers.get("etag");
      if (!revision) throw new Error(t("dashboard.the.server.did.not.provide.a.project.revision.2d0b2d"));
      const { document, assets } = await importKercadProject(await response.arrayBuffer());
      const now = Date.now();
      const entry: ProjectLibraryEntry = { id: newProjectLibraryId(), name: document.name, document, assets, createdAt: now, updatedAt: now, sharedSource: { fileName: file.fileName, revision } };
      await saveLibraryProject(entry);
      onOpen(entry);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("dashboard.could.not.open.project.2eb0be")); }
    finally { setBusy(false); }
  };
  const remove = async (file: SharedFile) => {
    if (!window.confirm(t("dashboard.delete.shared.project.this.removes.it.from.the.server.f.5d7d0e", { name: file.name }))) return;
    setBusy(true); setMessage(""); setConflict(false);
    try {
      const response = await fetch(`${endpoint}?fileName=${encodeURIComponent(file.fileName)}`, {
        method: "DELETE", headers: { "If-Match": file.revision },
      });
      if (!response.ok) {
        const payload = await response.json();
        setConflict(true);
        throw new Error(payload.error || t("dashboard.could.not.delete.the.shared.project.8866de"));
      }
      setFiles(current => current.filter(entry => entry.fileName !== file.fileName));
      setMessage(t("dashboard.shared.project.deleted.local.copies.are.kept.be3c57", { name: file.name }));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("dashboard.could.not.delete.the.shared.project.8866de")); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setMessage(""); setConflict(false);
    try {
      if (!author.trim()) throw new Error(t("dashboard.enter.your.name.before.sharing.bee702"));
      const entry = await getLibraryProject(selected);
      if (!entry) throw new Error(t("dashboard.choose.a.local.project.first.10f035"));
      const fileName = `${name.trim().replace(PROJECT_FILE_PATTERN, "")}.kercad`;
      const revision = entry.sharedSource?.fileName === fileName ? entry.sharedSource.revision : undefined;
      const bytes = await exportKercadProject(entry.document, entry.assets);
      const response = await fetch(`${endpoint}?fileName=${encodeURIComponent(fileName)}`, {
        method: "POST", body: new Uint8Array(bytes),
        headers: { "Content-Type": KERCAD_PACKAGE_MEDIA_TYPE, "X-Kercad-Author": encodeURIComponent(author.trim()), ...(revision ? { "If-Match": revision } : { "If-None-Match": "*" }) },
      });
      const payload = await response.json();
      if (response.status === 409) {
        setConflict(true);
        throw new Error(t("dashboard.the.server.copy.has.changed.or.this.name.is.already.in..0521f7"));
      }
      if (!response.ok) throw new Error(payload.error || t("dashboard.could.not.share.the.project.6edd4f"));
      await saveLibraryProject({ ...entry, sharedSource: { fileName: payload.project.fileName, revision: payload.project.revision } });
      try { localStorage.setItem("kercad.shared-author", author.trim()); } catch {}
      await uploadSharedThumbnail(payload.project.fileName, payload.project.revision, entry.document, entry.thumbnail, entry.thumbnailDocumentKey);
      onSaved();
      setMessage(t("dashboard.project.saved.to.the.shared.library.b67eff"));
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("dashboard.could.not.share.project.d19698")); }
    finally { setBusy(false); }
  };
  return <div className="kercad-shared-library" aria-busy={busy}>
    <header><h1>{t("dashboard.shared.projects.d9f6f7")}</h1><p>{t("dashboard.files.available.to.everyone.using.this.server.opening.a.05eff1")}</p><button type="button" disabled={busy} onClick={() => { void refresh().catch(error => setMessage(error.message)); }}>{t("dashboard.refresh.library.564fe5")}</button></header>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2>{t("dashboard.save.a.local.project.to.shared.9c6513")}</h2>
      <label>{t("dashboard.local.project.3ca6ec")}<select value={selected} disabled={busy} onChange={event => {
        setSelected(event.target.value); setConflict(false); setMessage("");
        const entry = projects.find(project => project.id === event.target.value);
        setName(entry?.sharedSource?.fileName.replace(PROJECT_FILE_PATTERN, "") ?? entry?.name ?? "");
      }}><option value="">{t("dashboard.choose.a.project.26ab25")}</option>{projects.map(entry => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
      <label>{t("dashboard.shared.file.name.930b6b")}<input value={name} maxLength={100} required pattern={'[^<>:"/\\\\|?*]+'} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <label>{t("dashboard.your.name.ab4229")}<input value={author} maxLength={80} required disabled={busy} autoComplete="nickname" onChange={event => setAuthor(event.target.value)} /><small>{t("dashboard.shown.with.your.shared.changes.remembered.in.this.brows.8e36c8")}</small></label>
      <button type="submit" disabled={busy || !selected || !name.trim() || !author.trim()}>{t("dashboard.save.to.shared.5476e1")}</button>
    </form>
    {message ? <p role={conflict ? "alert" : "status"}>{message}</p> : null}
    <div className="kercad-shared-files">{files.map(file => <article key={file.fileName}>{file.thumbnailUrl ? <img className="kercad-shared-thumbnail" src={file.thumbnailUrl} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="kercad-shared-thumbnail placeholder" aria-hidden="true">3D</span>}<div className="kercad-shared-file-details"><strong>{file.name}</strong><small>{t("dashboard.last.modified.42a3d4")}: <time dateTime={new Date(file.updatedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(file.updatedAt)}</time> · {file.updatedBy || t("dashboard.author.not.provided.a749ef")}</small></div><div className="kercad-shared-file-actions"><button type="button" disabled={busy} onClick={() => void open(file)}>{t("dashboard.open.local.copy.09f82d")}</button><button className="delete-shared" type="button" disabled={busy} aria-label={t("dashboard.delete.shared.project.c74851", { name: file.name })} onClick={() => void remove(file)}>{t("dashboard.delete.shared.c57ada")}</button></div></article>)}</div>
    {!files.length ? <p>{t("dashboard.no.shared.projects.yet.choose.a.local.project.above.to..806f11")}</p> : null}
  </div>;
}
