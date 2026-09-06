"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { SketchForgeParametricEditor } from "@/components/SketchForgeParametricEditor";
import { importEducadProject } from "@/lib/educadProject";
import { createEmptyDocument, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { deleteLibraryProject, getLibraryProject, listLibraryProjects, newProjectLibraryId, saveLibraryProject, updateLibraryProjectThumbnail, type ProjectLibraryEntry } from "@/lib/projectLibrary";
import type { ParametricDocument } from "@/types/parametric";

export default function Home() {
  const [projects, setProjects] = useState<ProjectLibraryEntry[]>([]);
  const [active, setActive] = useState<ProjectLibraryEntry | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const [busy, setBusy] = useState(true);
  const saveTimer = useRef<number | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeRef = useRef<ProjectLibraryEntry | null>(null);
  const pendingDocumentRef = useRef<ParametricDocument | null>(null);
  const changeVersionRef = useRef(0);
  const savedVersionRef = useRef(0);

  useEffect(() => { activeRef.current = active; }, [active]);

  const refresh = useCallback(async () => setProjects(await listLibraryProjects()), []);
  const enqueueLibraryWrite = useCallback((write: () => Promise<void>) => {
    const queued = writeQueueRef.current.catch(() => undefined).then(write);
    writeQueueRef.current = queued;
    return queued;
  }, []);
  const saveLatestActive = useCallback(async () => {
    const latest = activeRef.current;
    const version = changeVersionRef.current;
    if (!latest || version === savedVersionRef.current) return;
    await enqueueLibraryWrite(() => saveLibraryProject(structuredClone(latest)));
    if (changeVersionRef.current === version) savedVersionRef.current = version;
  }, [enqueueLibraryWrite]);
  const openProject = useCallback((entry: ProjectLibraryEntry) => {
    activeRef.current = entry;
    pendingDocumentRef.current = entry.document;
    changeVersionRef.current = 0;
    savedVersionRef.current = 0;
    setEditorSession((current) => current + 1);
    setActive(entry);
  }, []);
  const openStoredProject = useCallback(async (entry: ProjectLibraryEntry) => {
    setBusy(true);
    try {
      await writeQueueRef.current.catch(() => undefined);
      const fresh = await getLibraryProject(entry.id) ?? entry;
      openProject(fresh);
    } finally {
      setBusy(false);
    }
  }, [openProject]);
  useEffect(() => {
    const interval = window.setInterval(() => { void saveLatestActive(); }, 5_000);
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") void saveLatestActive(); };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [saveLatestActive]);
  useEffect(() => {
    void (async () => {
      let entries = await listLibraryProjects();
      if (!entries.length) {
        try {
          const legacy = JSON.parse(localStorage.getItem("educad.parametric.document.v1") ?? "null") as unknown;
          if (validateDocument(legacy)) {
            const document = normalizeParametricDocument(legacy);
            const now = Date.now();
            await saveLibraryProject({ id: newProjectLibraryId(), name: document.name, createdAt: now, updatedAt: now, document });
            entries = await listLibraryProjects();
          }
        } catch {}
      }
      localStorage.removeItem("educad.parametric.document.v1");
      localStorage.removeItem("educad.parametric.document.recovery.v1");
      localStorage.removeItem("educad.parametric.snapshots.v1");
      setProjects(entries);
      setBusy(false);
    })();
  }, []);

  const createProject = async () => {
    const document = createEmptyDocument();
    const now = Date.now();
    const entry = { id: newProjectLibraryId(), name: document.name, createdAt: now, updatedAt: now, document };
    await saveLibraryProject(entry);
    setProjects((current) => [entry, ...current]);
    openProject(entry);
  };
  const persistActive = useCallback((document: ParametricDocument) => {
    const current = activeRef.current;
    if (!current) return;
    const pending = structuredClone(document);
    pendingDocumentRef.current = pending;
    activeRef.current = { ...current, name: pending.name, updatedAt: Date.now(), document: pending };
    changeVersionRef.current += 1;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveLatestActive(); }, 350);
  }, [saveLatestActive]);
  const persistThumbnail = useCallback((thumbnail: string) => {
    const current = activeRef.current;
    if (!current || current.thumbnail === thumbnail) return;
    const next = { ...current, thumbnail };
    activeRef.current = next;
    void enqueueLibraryWrite(() => updateLibraryProjectThumbnail(current.id, thumbnail));
  }, [enqueueLibraryWrite]);
  const leaveEditor = async (document: ParametricDocument) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    const current = activeRef.current;
    if (current) {
      const saved = { ...current, name: document.name, updatedAt: Date.now(), document: structuredClone(document) };
      activeRef.current = saved;
      await enqueueLibraryWrite(() => saveLibraryProject(saved));
      savedVersionRef.current = changeVersionRef.current;
    }
    const updatedProjects = await listLibraryProjects();
    activeRef.current = null;
    pendingDocumentRef.current = null;
    setProjects(updatedProjects);
    setActive(null);
  };
  const importProject = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const document = file.name.toLowerCase().endsWith(".educad")
        ? (await importEducadProject(bytes)).document
        : (() => { const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown; if (!validateDocument(parsed)) throw new Error("This is not a valid eduCAD project."); return normalizeParametricDocument(parsed); })();
      const now = Date.now();
      const entry = { id: newProjectLibraryId(), name: document.name, createdAt: now, updatedAt: now, document };
      await saveLibraryProject(entry);
      setProjects((current) => [entry, ...current]);
      openProject(entry);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not open the project.");
    } finally { setBusy(false); }
  };
  const renameProject = async (project: ProjectLibraryEntry, name: string) => {
    const updated = { ...project, name, updatedAt: Date.now(), document: { ...project.document, name } };
    await saveLibraryProject(updated);
    setProjects((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  };

  if (active) return <SketchForgeParametricEditor key={`${active.id}:${editorSession}`} initialProject={active.document} onProjectChange={persistActive} onProjectThumbnail={persistThumbnail} onExitToProjects={(document) => void leaveEditor(document)} />;
  return <ProjectDashboard projects={projects} busy={busy} onCreate={() => void createProject()} onOpen={(project) => void openStoredProject(project)} onImport={(file) => void importProject(file)} onRename={(project, name) => void renameProject(project, name)} onDelete={(project) => void (async () => { if (!window.confirm(`Delete “${project.name}”?`)) return; await deleteLibraryProject(project.id); await refresh(); })()} />;
}
