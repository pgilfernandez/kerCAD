"use client";

import { useEffect, useState } from "react";
import { exportEducadProject, importEducadProject, EDUCAD_PACKAGE_MEDIA_TYPE } from "@/lib/educadProject";
import { getLibraryProject, newProjectLibraryId, saveLibraryProject, type ProjectLibraryEntry } from "@/lib/projectLibrary";

type SharedFile = { fileName: string; name: string; revision: string; updatedAt: number; updatedBy?: string };
const endpoint = "/api/educad-shared-projects";

export function SharedProjects({ projects, onOpen, onSaved }: {
  projects: ProjectLibraryEntry[];
  onOpen: (entry: ProjectLibraryEntry) => void;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  useEffect(() => {
    try { setAuthor(localStorage.getItem("educad.shared-author") ?? ""); } catch {}
  }, []);
  const [conflict, setConflict] = useState(false);
  const refresh = async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.enabled) throw new Error(payload.error || "Shared storage is unavailable.");
    setFiles(payload.projects);
  };
  useEffect(() => { void refresh().catch(error => setMessage(error.message)); }, []);
  const open = async (file: SharedFile) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${endpoint}?fileName=${encodeURIComponent(file.fileName)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not open the shared project. Refresh the library and try again.");
      const revision = response.headers.get("etag");
      if (!revision) throw new Error("The server did not provide a project revision.");
      const { document, assets } = await importEducadProject(await response.arrayBuffer());
      const now = Date.now();
      const entry: ProjectLibraryEntry = { id: newProjectLibraryId(), name: document.name, document, assets, createdAt: now, updatedAt: now, sharedSource: { fileName: file.fileName, revision } };
      await saveLibraryProject(entry);
      onOpen(entry);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open project."); }
    finally { setBusy(false); }
  };
  const remove = async (file: SharedFile) => {
    if (!window.confirm(`Delete shared project “${file.name}”?\n\nThis removes it from the server for everyone and cannot be undone. Local copies are kept.`)) return;
    setBusy(true); setMessage(""); setConflict(false);
    try {
      const response = await fetch(`${endpoint}?fileName=${encodeURIComponent(file.fileName)}`, {
        method: "DELETE", headers: { "If-Match": file.revision },
      });
      if (!response.ok) {
        const payload = await response.json();
        setConflict(true);
        throw new Error(payload.error || "Could not delete the shared project.");
      }
      setFiles(current => current.filter(entry => entry.fileName !== file.fileName));
      setMessage(`Shared project “${file.name}” deleted. Local copies are kept.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete the shared project."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setMessage(""); setConflict(false);
    try {
      if (!author.trim()) throw new Error("Enter your name before sharing.");
      const entry = await getLibraryProject(selected);
      if (!entry) throw new Error("Choose a local project first.");
      const fileName = `${name.trim().replace(/\.educad$/i, "")}.educad`;
      const revision = entry.sharedSource?.fileName === fileName ? entry.sharedSource.revision : undefined;
      const bytes = await exportEducadProject(entry.document, entry.assets);
      const response = await fetch(`${endpoint}?fileName=${encodeURIComponent(fileName)}`, {
        method: "POST", body: new Uint8Array(bytes),
        headers: { "Content-Type": EDUCAD_PACKAGE_MEDIA_TYPE, "X-Educad-Author": encodeURIComponent(author.trim()), ...(revision ? { "If-Match": revision } : { "If-None-Match": "*" }) },
      });
      const payload = await response.json();
      if (response.status === 409) {
        setConflict(true);
        throw new Error("The server copy has changed or this name is already in use. Your local work is safe. Save with another name, or open the server version as a separate local copy below.");
      }
      if (!response.ok) throw new Error(payload.error || "Could not share the project.");
      await saveLibraryProject({ ...entry, sharedSource: { fileName: payload.project.fileName, revision: payload.project.revision } });
      try { localStorage.setItem("educad.shared-author", author.trim()); } catch {}
      onSaved();
      setMessage("Project saved to the shared library.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not share project."); }
    finally { setBusy(false); }
  };
  return <div className="educad-shared-library" aria-busy={busy}>
    <header><h1>Shared projects</h1><p>Files available to everyone using this server. Opening a file creates your own local copy; changes are shared only when you save them here.</p><button type="button" disabled={busy} onClick={() => { void refresh().catch(error => setMessage(error.message)); }}>Refresh library</button></header>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2>Save a local project to shared</h2>
      <label>Local project<select value={selected} disabled={busy} onChange={event => {
        setSelected(event.target.value); setConflict(false); setMessage("");
        const entry = projects.find(project => project.id === event.target.value);
        setName(entry?.sharedSource?.fileName.replace(/\.educad$/i, "") ?? entry?.name ?? "");
      }}><option value="">Choose a project</option>{projects.map(entry => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
      <label>Shared file name<input value={name} maxLength={100} required pattern={'[^<>:"/\\\\|?*]+'} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <label>Your name<input value={author} maxLength={80} required disabled={busy} autoComplete="nickname" onChange={event => setAuthor(event.target.value)} /><small>Shown with your shared changes. Remembered in this browser; this is not a verified account.</small></label>
      <button type="submit" disabled={busy || !selected || !name.trim() || !author.trim()}>Save to shared</button>
    </form>
    {message ? <p role={conflict ? "alert" : "status"}>{message}</p> : null}
    <div className="educad-shared-files">{files.map(file => <article key={file.fileName}><div className="educad-shared-file-details"><strong>{file.name}</strong><small>Last modified: <time dateTime={new Date(file.updatedAt).toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(file.updatedAt)}</time> · {file.updatedBy || "Author not provided"}</small></div><div className="educad-shared-file-actions"><button type="button" disabled={busy} onClick={() => void open(file)}>Open local copy</button><button className="delete-shared" type="button" disabled={busy} aria-label={`Delete shared project ${file.name}`} onClick={() => void remove(file)}>Delete shared</button></div></article>)}</div>
    {!files.length ? <p>No shared projects yet. Choose a local project above to share the first one.</p> : null}
  </div>;
}
