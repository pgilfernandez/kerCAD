"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { dashboardTranslate, type DashboardTranslationKey } from "@/lib/dashboardI18n";
import { exportKercadProject, KERCAD_PACKAGE_MEDIA_TYPE } from "@/lib/kercadProject";
import type { KercadLocale } from "@/lib/kercadI18n";
import { PROJECT_FILE_PATTERN } from "@/lib/legacyBrand";
import { getLibraryProject, saveLibraryProject, type ProjectLibraryEntry } from "@/lib/projectLibrary";
import { uploadSharedThumbnail } from "@/lib/sharedProjectThumbnail";

export function ShareProjectDialog({ project, locale, onClose, onSaved }: { project: ProjectLibraryEntry; locale: KercadLocale; onClose: () => void; onSaved: () => void }) {
  const t = (key: DashboardTranslationKey) => dashboardTranslate(locale, key);
  const [name, setName] = useState((project.sharedSource?.fileName ?? project.name).replace(PROJECT_FILE_PATTERN, ""));
  const [author, setAuthor] = useState(project.document.author?.trim().slice(0, 80) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const close = () => { if (!busy) onClose(); };
  const dialogRef = useAccessibleDialog<HTMLFormElement>(true, close, nameRef);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kercad.shared-author");
      if (saved) setAuthor(saved.slice(0, 80));
    } catch { /* Storage is optional. */ }
  }, []);

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim() || !author.trim()) return;
    setBusy(true);
    setError("");
    try {
      const entry = await getLibraryProject(project.id);
      if (!entry) throw new Error(t("dashboard.choose.a.local.project.first.10f035"));
      const fileName = `${name.trim().replace(PROJECT_FILE_PATTERN, "")}.kercad`;
      const revision = entry.sharedSource?.fileName === fileName ? entry.sharedSource.revision : undefined;
      const bytes = await exportKercadProject(entry.document, entry.assets);
      const response = await fetch(`/api/kercad-shared-projects?fileName=${encodeURIComponent(fileName)}`, {
        method: "POST", body: new Uint8Array(bytes),
        headers: { "Content-Type": KERCAD_PACKAGE_MEDIA_TYPE, "X-Kercad-Author": encodeURIComponent(author.trim()), ...(revision ? { "If-Match": revision } : { "If-None-Match": "*" }) },
      });
      const payload = await response.json();
      if (response.status === 409) throw new Error(t("dashboard.the.server.copy.has.changed.or.this.name.is.already.in..0521f7"));
      if (!response.ok) throw new Error(payload.error || t("dashboard.could.not.share.the.project.6edd4f"));
      await saveLibraryProject({ ...entry, sharedSource: { fileName: payload.project.fileName, revision: payload.project.revision } });
      try { localStorage.setItem("kercad.shared-author", author.trim()); } catch { /* Storage is optional. */ }
      await uploadSharedThumbnail(payload.project.fileName, payload.project.revision, entry.document, entry.thumbnail, entry.thumbnailDocumentKey);
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("dashboard.could.not.share.project.d19698")); }
    finally { setBusy(false); }
  };

  return <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={close}>
    <form ref={dialogRef} className="kercad-rename-dialog kercad-share-project-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-share-project-title" aria-busy={busy} onPointerDown={(event) => event.stopPropagation()} onSubmit={publish}>
      <header><strong id="kercad-share-project-title">{t("dashboard.save.a.local.project.to.shared.9c6513")}</strong><button type="button" disabled={busy} aria-label={t("dashboard.cancel.77dfd2")} onClick={close}><X size={18} /></button></header>
      <p>{t("dashboard.files.available.to.everyone.using.this.server.opening.a.05eff1")}</p>
      <label><span>{t("dashboard.shared.file.name.930b6b")}</span><input ref={nameRef} value={name} maxLength={100} required pattern={String.raw`[^<>:"\/\\\|?*]+`} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label><span>{t("dashboard.your.name.ab4229")}</span><input value={author} maxLength={80} required disabled={busy} autoComplete="nickname" onChange={(event) => setAuthor(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={close}>{t("dashboard.cancel.77dfd2")}</button><button className="primary" type="submit" disabled={busy || !name.trim() || !author.trim()}>{t("dashboard.save.to.shared.5476e1")}</button></footer>
    </form>
  </div>;
}
