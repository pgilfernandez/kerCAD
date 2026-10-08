"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { EducadLandingPage } from "@/components/EducadLandingPage";
import { SketchForgeParametricEditor } from "@/components/SketchForgeParametricEditor";
import { createEmptyChallenge, deleteInstalledChallenge, duplicateChallenge, exportChallengePackage, importChallengePackage, listInstalledChallenges, saveInstalledChallenge, syncBundledChallenges, type EducadChallenge } from "@/lib/challengeLibrary";
import { exportEducadProject, importEducadProject, EDUCAD_PACKAGE_MEDIA_TYPE } from "@/lib/educadProject";
import { createEmptyDocument, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { deleteLibraryProject, getLibraryProject, listLibraryProjects, newProjectLibraryId, saveLibraryProject, updateLibraryProjectThumbnail, type ProjectLibraryEntry } from "@/lib/projectLibrary";
import { thumbnailDocumentKey, uploadSharedThumbnail } from "@/lib/sharedProjectThumbnail";
import type { ParametricDocument } from "@/types/parametric";

export default function Home() {
  const [projects, setProjects] = useState<ProjectLibraryEntry[]>([]);
  const [active, setActive] = useState<ProjectLibraryEntry | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const [busy, setBusy] = useState(true);
  const [showLanding, setShowLanding] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("about") === "1") setShowLanding(true);
  }, []);
  const [dashboardSection, setDashboardSection] = useState<"home" | "challenges" | "shared">("home");
  const [sharedEnabled, setSharedEnabled] = useState(false);
  useEffect(() => {
    void fetch("/api/educad-shared-projects", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(payload => setSharedEnabled(payload?.enabled === true))
      .catch(() => setSharedEnabled(false));
  }, []);
  const [challenges, setChallenges] = useState<EducadChallenge[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<EducadChallenge | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<EducadChallenge | null>(null);
  const saveTimer = useRef<number | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeRef = useRef<ProjectLibraryEntry | null>(null);
  const pendingDocumentRef = useRef<ParametricDocument | null>(null);
  const changeVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const transientEditorRef = useRef(false);

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
    if (!latest || transientEditorRef.current || version === savedVersionRef.current) return;
    await enqueueLibraryWrite(() => saveLibraryProject(structuredClone(latest)));
    if (changeVersionRef.current === version) savedVersionRef.current = version;
  }, [enqueueLibraryWrite]);
  const openProject = useCallback((entry: ProjectLibraryEntry, transient = false) => {
    transientEditorRef.current = transient;
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
      await deleteInstalledChallenge("educad-demo-key-tag@1");
      setChallenges(await listInstalledChallenges());
      setBusy(false);
      // The local library is usable immediately, including without a network.
      void syncBundledChallenges()
        .then(async (updated) => { if (updated) setChallenges(await listInstalledChallenges()); })
        .catch(() => { /* Optional server updates must not hide local activities. */ });
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
  const startChallenge = async (challenge: EducadChallenge) => {
    const document = createEmptyDocument();
    document.name = challenge.title;
    const now = Date.now();
    const entry = { id: newProjectLibraryId(), name: document.name, createdAt: now, updatedAt: now, document };
    await saveLibraryProject(entry);
    setProjects((current) => [entry, ...current]);
    setEditingChallenge(null);
    setActiveChallenge(challenge);
    openProject(entry);
  };
  const editChallenge = (challenge = createEmptyChallenge()) => {
    const document = structuredClone(challenge.workspaceDocument ?? createEmptyDocument());
    document.name = challenge.title;
    const now = Date.now();
    setActiveChallenge(null);
    setEditingChallenge(structuredClone(challenge));
    openProject({ id: `challenge-editor:${challenge.id}`, name: document.name, createdAt: now, updatedAt: now, document }, true);
  };
  const installChallenge = async (file: File) => {
    setBusy(true);
    try {
      const challenge = await importChallengePackage(file);
      await saveInstalledChallenge(challenge);
      setChallenges(await listInstalledChallenges());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not install the challenge.");
    } finally { setBusy(false); }
  };
  const persistActive = useCallback((document: ParametricDocument) => {
    const current = activeRef.current;
    if (!current) return;
    const pending = structuredClone(document);
    pendingDocumentRef.current = pending;
    activeRef.current = { ...current, name: pending.name, updatedAt: Date.now(), document: pending };
    changeVersionRef.current += 1;
    if (transientEditorRef.current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveLatestActive(); }, 350);
  }, [saveLatestActive]);
  const persistThumbnail = useCallback((thumbnail: string, capturedDocument?: ParametricDocument) => {
    const current = activeRef.current;
    if (!current || transientEditorRef.current) return;
    void (async () => {
      const key = capturedDocument ? await thumbnailDocumentKey(capturedDocument) : undefined;
      if (activeRef.current?.id !== current.id) return;
      activeRef.current = { ...activeRef.current, thumbnail, thumbnailDocumentKey: key };
      await enqueueLibraryWrite(() => updateLibraryProjectThumbnail(current.id, thumbnail, key));
    })();
  }, [enqueueLibraryWrite]);
  const leaveEditor = async (document: ParametricDocument) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    const current = activeRef.current;
    if (current && !transientEditorRef.current) {
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
    setActiveChallenge(null);
    setEditingChallenge(null);
    transientEditorRef.current = false;
  };
  const finishChallengeEdit = async (challenge: EducadChallenge, workspaceDocument: ParametricDocument) => {
    const saved = { ...challenge, title: challenge.title.trim(), workspaceDocument: structuredClone(workspaceDocument), installedAt: Date.now() };
    await saveInstalledChallenge(saved);
    setChallenges(await listInstalledChallenges());
    setDashboardSection("challenges");
    activeRef.current = null;
    pendingDocumentRef.current = null;
    transientEditorRef.current = false;
    setActive(null);
    setEditingChallenge(null);
  };
  const cancelChallengeEdit = () => {
    activeRef.current = null;
    pendingDocumentRef.current = null;
    transientEditorRef.current = false;
    setActive(null);
    setEditingChallenge(null);
  };
  const downloadChallenge = (challenge: EducadChallenge) => {
    const blob = exportChallengePackage(challenge);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${challenge.title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "challenge"}.zip`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
  };
  const duplicateInstalledChallenge = async (challenge: EducadChallenge) => {
    setBusy(true);
    try {
      const copy = duplicateChallenge(challenge, await listInstalledChallenges());
      await saveInstalledChallenge(copy);
      setChallenges(await listInstalledChallenges());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not duplicate the challenge.");
    } finally { setBusy(false); }
  };
  const importProject = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const packaged = file.name.toLowerCase().endsWith(".educad") ? await importEducadProject(bytes) : null;
      const document = packaged
        ? packaged.document
        : (() => { const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown; if (!validateDocument(parsed)) throw new Error("This is not a valid eduCAD project."); return normalizeParametricDocument(parsed); })();
      const now = Date.now();
      const entry = { id: newProjectLibraryId(), name: document.name, createdAt: now, updatedAt: now, document, assets: packaged?.assets };
      await saveLibraryProject(entry);
      setProjects((current) => [entry, ...current]);
      openProject(entry);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not open the project.");
    } finally { setBusy(false); }
  };
  const saveActiveShared = async (document: ParametricDocument, fileName: string, author: string) => {
    const current = activeRef.current;
    if (!current || transientEditorRef.current) throw new Error("No local project is open.");
    // Keep the editable local copy even if publishing fails or conflicts.
    persistActive(document);
    await saveLatestActive();
    const bytes = await exportEducadProject(document, current.assets);
    const revision = current.sharedSource?.fileName === fileName ? current.sharedSource.revision : undefined;
    const response = await fetch(`/api/educad-shared-projects?fileName=${encodeURIComponent(fileName)}`, {
      method: "POST", body: new Uint8Array(bytes),
      headers: { "Content-Type": EDUCAD_PACKAGE_MEDIA_TYPE, "X-Educad-Author": encodeURIComponent(author), ...(revision ? { "If-Match": revision } : { "If-None-Match": "*" }) },
    });
    const payload = await response.json();
    if (response.status === 409) throw new Error("The shared file has changed or this name is already in use. Your local work is safe. Save with another name, or open a fresh copy from Shared.");
    if (!response.ok) throw new Error(payload.error || "Could not save the shared project.");
    await uploadSharedThumbnail(payload.project.fileName, payload.project.revision, document, current.thumbnail, current.thumbnailDocumentKey);
    if (activeRef.current?.id === current.id) {
      activeRef.current = { ...activeRef.current, sharedSource: { fileName: payload.project.fileName, revision: payload.project.revision } };
      await enqueueLibraryWrite(async () => {
        // Preserve any edits made while the request was in flight.
        if (activeRef.current?.id === current.id) await saveLibraryProject(structuredClone(activeRef.current));
      });
    }
  };
  const renameProject = async (project: ProjectLibraryEntry, name: string) => {
    const updated = { ...project, name, updatedAt: Date.now(), document: { ...project.document, name } };
    await saveLibraryProject(updated);
    setProjects((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  };

  if (active) return <SketchForgeParametricEditor key={`${active.id}:${editorSession}`} initialProject={active.document} sharedFileName={active.sharedSource?.fileName} onSaveShared={sharedEnabled && !editingChallenge ? saveActiveShared : undefined} challenge={activeChallenge} challengeEditor={editingChallenge} onSaveChallenge={(challenge, document) => void finishChallengeEdit(challenge, document)} onCancelChallengeEdit={cancelChallengeEdit} onProjectChange={persistActive} onProjectThumbnail={persistThumbnail} onExitToProjects={(document) => void leaveEditor(document)} />;
  if (showLanding) return <EducadLandingPage projectCount={projects.length} preview={projects.find((project) => project.thumbnail)?.thumbnail} onStart={() => { setDashboardSection("home"); setShowLanding(false); }} onOpenChallenges={() => { setDashboardSection("challenges"); setShowLanding(false); }} />;
  return <ProjectDashboard sharedEnabled={sharedEnabled} onSharedSaved={() => void refresh()} projects={projects} challenges={challenges} busy={busy} section={dashboardSection} onSectionChange={setDashboardSection} onShowLanding={() => setShowLanding(true)} onCreate={() => void createProject()} onOpen={(project) => { setActiveChallenge(null); setEditingChallenge(null); void openStoredProject(project); }} onImport={(file) => void importProject(file)} onImportChallenge={(file) => void installChallenge(file)} onCreateChallenge={() => editChallenge()} onEditChallenge={editChallenge} onDuplicateChallenge={(challenge) => void duplicateInstalledChallenge(challenge)} onExportChallenge={downloadChallenge} onStartChallenge={(challenge) => void startChallenge(challenge)} onDeleteChallenge={(challenge) => void (async () => { await deleteInstalledChallenge(challenge.id); setChallenges(await listInstalledChallenges()); })()} onRename={(project, name) => void renameProject(project, name)} onDelete={(project) => void (async () => { await deleteLibraryProject(project.id); await refresh(); })()} />;
}
