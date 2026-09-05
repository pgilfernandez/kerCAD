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

  useEffect(() => { activeRef.current = active; }, [active]);

  const refresh = useCallback(async () => setProjects(await listLibraryProjects()), []);
  const enqueueLibraryWrite = useCallback((write: () => Promise<void>) => {
    const queued = writeQueueRef.current.catch(() => undefined).then(write);
    writeQueueRef.current = queued;
    return queued;
  }, []);
  const openProject = useCallback((entry: ProjectLibraryEntry) => {
    activeRef.current = entry;
    pendingDocumentRef.current = entry.document;
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
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const latest = activeRef.current;
      if (!latest) return;
      void enqueueLibraryWrite(() => saveLibraryProject(structuredClone(latest)));
    }, 350);
  }, [enqueueLibraryWrite]);
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

  if (active) return <SketchForgeParametricEditor key={`${active.id}:${editorSession}`} initialProject={active.document} onProjectChange={persistActive} onProjectThumbnail={persistThumbnail} onExitToProjects={(document) => void leaveEditor(document)} />;
  return <ProjectDashboard projects={projects} busy={busy} onCreate={() => void createProject()} onOpen={(project) => void openStoredProject(project)} onImport={(file) => void importProject(file)} onDelete={(project) => void (async () => { if (!window.confirm(`Delete “${project.name}”?`)) return; await deleteLibraryProject(project.id); await refresh(); })()} />;
}
