"use client";

import { dashboardTranslate, type DashboardTranslationKey } from "@/lib/dashboardI18n";
import type { KercadLocale } from "@/lib/kercadI18n";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { Box, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { importKercadProject } from "@/lib/kercadProject";
import { newProjectLibraryId, saveLibraryProject, type ProjectLibraryEntry } from "@/lib/projectLibrary";

type SharedFile = { fileName: string; name: string; revision: string; updatedAt: number; updatedBy?: string; thumbnailUrl?: string };
const endpoint = "/api/kercad-shared-projects";

export function SharedProjects({ onOpen, locale = "en" }: {
  locale?: KercadLocale;
  onOpen: (entry: ProjectLibraryEntry) => void;
}) {
  const t = (key: DashboardTranslationKey, values?: Record<string, string | number>) => dashboardTranslate(locale, key, values);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<SharedFile | null>(null);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());
  const deleteDialog = useAccessibleDialog(Boolean(deleting), () => setDeleting(null));
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
    setDeleting(null);
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
  return <div className="kercad-shared-library" aria-busy={busy}>
    <header className="kercad-dashboard-project-heading">
      <div><h1>{t("dashboard.shared.projects.d9f6f7")}</h1><span>{t("dashboard.visible.4cd4ed", { count: files.length })}</span></div>
      <div className="kercad-dashboard-project-controls"><button className="kercad-import-project" type="button" disabled={busy} onClick={() => { void refresh().catch(error => setMessage(error.message)); }}><RefreshCw size={18} />{t("dashboard.refresh.library.564fe5")}</button></div>
    </header>
    <p className="kercad-shared-description">{t("dashboard.files.available.to.everyone.using.this.server.opening.a.05eff1")}</p>
    {message ? <p role={conflict ? "alert" : "status"}>{message}</p> : null}
    <div className="kercad-dashboard-projects grid">{files.map((file, index) => {
      const thumbnail = file.thumbnailUrl;
      const openLabel = t("dashboard.open.local.copy.09f82d");
      return <article className="kercad-dashboard-card" key={file.fileName}>
        <button className="card-open" type="button" disabled={busy} title={openLabel} aria-label={`${openLabel}: ${file.name}`} onClick={() => void open(file)}>
          <span className={`card-preview accent-${index % 4}`}>
            {thumbnail && !failedThumbnails.has(thumbnail) ? <img src={thumbnail} alt="" loading="lazy" onError={() => setFailedThumbnails((failed) => new Set(failed).add(thumbnail))} />
              : <><span className="preview-grid" /><Box size={32} className="kercad-shared-preview-icon" aria-hidden="true" /></>}
          </span>
          <span className="card-copy"><strong>{file.name}</strong><small>{t("dashboard.last.modified.42a3d4")}: <time dateTime={new Date(file.updatedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(file.updatedAt)}</time> · {file.updatedBy || t("dashboard.author.not.provided.a749ef")}</small></span>
        </button>
        <button className="card-delete" type="button" disabled={busy} title={t("dashboard.delete.shared.c57ada")} aria-label={t("dashboard.delete.shared.project.c74851", { name: file.name })} onClick={() => setDeleting(file)}><Trash2 size={17} /></button>
      </article>;
    })}</div>
    {!files.length && <div className="kercad-dashboard-empty">{t("dashboard.no.shared.projects.yet.choose.a.local.project.above.to..806f11")}</div>}
    {deleting && <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setDeleting(null)}>
      <section ref={deleteDialog} className="kercad-rename-dialog kercad-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-shared-delete-title" onPointerDown={(event) => event.stopPropagation()}>
        <header><strong id="kercad-shared-delete-title">{t("dashboard.delete.shared.c57ada")}</strong><button type="button" aria-label={t("dashboard.cancel.77dfd2")} onClick={() => setDeleting(null)}><X size={18} /></button></header>
        <p>{t("dashboard.delete.shared.project.this.removes.it.from.the.server.f.5d7d0e", { name: deleting.name })}</p>
        <footer><button type="button" onClick={() => setDeleting(null)}>{t("dashboard.cancel.77dfd2")}</button><button className="danger" type="button" onClick={() => void remove(deleting)}>{t("dashboard.delete.f6fdbe")}</button></footer>
      </section>
    </div>}
  </div>;
}
