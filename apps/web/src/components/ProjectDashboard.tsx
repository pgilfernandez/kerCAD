"use client";

import { LEGACY_PROJECT_ACCEPT } from "@/lib/legacyBrand";

import { Copy, Download, FileArchive, Grid3X3, Home, List, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolbarEditOperationIcon } from "@/components/icons";
import { SharedProjects } from "@/components/SharedProjects";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { EditorGettingStarted, resetStartupTutorials } from "@/components/EditorGettingStarted";
import { ImportDesignDialog } from "@/components/ImportDesignDialog";
import type { KercadLocale } from "@/lib/kercadI18n";
import { dashboardTranslate, type DashboardTranslationKey } from "@/lib/dashboardI18n";
import type { KercadChallenge } from "@/lib/challengeLibrary";
import type { ProjectLibraryEntry } from "@/lib/projectLibrary";

type Props = {
  projects: ProjectLibraryEntry[];
  sharedEnabled?: boolean;
  onSharedSaved: () => void;
  busy?: boolean;
  section: "home" | "challenges" | "shared";
  onSectionChange: (section: "home" | "challenges" | "shared") => void;
  onShowLanding: () => void;
  onCreate: () => void;
  onOpen: (project: ProjectLibraryEntry) => void;
  onImport: (file: File) => void;
  onDelete: (project: ProjectLibraryEntry) => void;
  onRename: (project: ProjectLibraryEntry, name: string, author: string) => void;
  onDuplicate: (project: ProjectLibraryEntry) => void;
  onExport: (project: ProjectLibraryEntry) => void;
  challenges: KercadChallenge[];
  onImportChallenge: (file: File) => void;
  onCreateChallenge: () => void;
  onStartChallenge: (challenge: KercadChallenge) => void;
  onEditChallenge: (challenge: KercadChallenge) => void;
  onDuplicateChallenge: (challenge: KercadChallenge) => void;
  onExportChallenge: (challenge: KercadChallenge) => void;
  onDeleteChallenge: (challenge: KercadChallenge) => void;
};

function updatedLabel(timestamp: number, locale: KercadLocale) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return dashboardTranslate(locale, "Just now");
  if (age < 3_600_000) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.max(1, Math.round(age / 60_000)), "minute");
  if (age < 86_400_000) return dashboardTranslate(locale, "Today");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(timestamp);
}

export function ProjectDashboard({ projects, sharedEnabled = false, onSharedSaved, busy = false, section, onSectionChange, onShowLanding, onCreate, onOpen, onImport, onDelete, onRename, onDuplicate, onExport, challenges, onImportChallenge, onCreateChallenge, onStartChallenge, onEditChallenge, onDuplicateChallenge, onExportChallenge, onDeleteChallenge }: Props) {
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [locale, setLocale] = useState<KercadLocale>("en");
  const [tutorialLaunchRequest, setTutorialLaunchRequest] = useState(0);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("kercad.locale"); } catch { /* Keep English if storage is unavailable. */ }
    const language = saved === "es" ? "es" : "en";
    setLocale(language);
    document.documentElement.lang = language;
  }, []);
  const changeLocale = (language: KercadLocale) => {
    setLocale(language);
    try { localStorage.setItem("kercad.locale", language); } catch { /* The selected language still applies for this session. */ }
    document.documentElement.lang = language;
  };
  const t = (key: DashboardTranslationKey, values?: Record<string, string | number>) => dashboardTranslate(locale, key, values);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [challengeQuery, setChallengeQuery] = useState("");
  const [challengeView, setChallengeView] = useState<"grid" | "list">("grid");
  const [challengeSort, setChallengeSort] = useState<"recent" | "name">("recent");
  const [renaming, setRenaming] = useState<ProjectLibraryEntry | null>(null);
  const [deleting, setDeleting] = useState<ProjectLibraryEntry | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const challengeInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => projects
    .filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => sort === "recent"
      ? right.updatedAt - left.updatedAt
      : left.name.localeCompare(right.name, locale, { sensitivity: "base" })), [projects, query, sort, locale]);
  const visibleChallenges = useMemo(() => {
    const needle = challengeQuery.trim().toLocaleLowerCase();
    return challenges
      .filter((challenge) => !needle || [challenge.title, challenge.description, challenge.author, ...(challenge.categories ?? [])].some((value) => value?.toLocaleLowerCase().includes(needle)))
      .sort((left, right) => challengeSort === "recent"
        ? right.installedAt - left.installedAt
        : left.title.localeCompare(right.title, locale, { sensitivity: "base" }));
  }, [challenges, challengeQuery, challengeSort, locale]);
  useEffect(() => {
    if (!renaming) return;
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renaming]);
  const beginRename = (project: ProjectLibraryEntry) => {
    setRenameDraft(project.name);
    setAuthorDraft(project.document.author ?? project.document.creator ?? "");
    setRenaming(project);
  };
  const commitRename = () => {
    if (!renaming || !renameDraft.trim()) return;
    onRename(renaming, renameDraft.trim(), authorDraft.trim());
    setRenaming(null);
  };
  return <main className="kercad-dashboard-shell" aria-busy={busy}>
    <EditorGettingStarted locale={locale} onLocaleChange={changeLocale} active={!busy} mode="dashboard" dashboardSection={section} launchRequest={tutorialLaunchRequest} />
    <header className="kercad-dashboard-topbar">
      <strong className="kercad-dashboard-brand"><img className="kercad-dashboard-logo" src="/assets/kercad/logo.svg" alt="" /><span>kerCAD</span></strong>
      <nav className="kercad-dashboard-mobile-nav" aria-label={t("Dashboard sections")}><button data-tutorial="dashboard-projects" className={section === "home" ? "active" : ""} type="button" onClick={() => onSectionChange("home")}><Home size={18} /> {t("Projects")}</button><button data-tutorial="dashboard-challenges" className={section === "challenges" ? "active" : ""} type="button" onClick={() => onSectionChange("challenges")}><Grid3X3 size={18} /> {t("Challenges")}</button>{sharedEnabled ? <button type="button" onClick={() => onSectionChange("shared")}>{t("Shared")}</button> : null}</nav>
      <EditorHeaderActions locale={locale} onLocaleChange={changeLocale} onShowLanding={onShowLanding} onLaunchTutorial={() => { resetStartupTutorials(); setTutorialLaunchRequest((request) => request + 1); }} showDonation />
    </header>
    <div className="kercad-dashboard-layout">
      <aside className="kercad-dashboard-sidebar">
        <button data-tutorial="dashboard-projects" className={section === "home" ? "active" : ""} type="button" onClick={() => onSectionChange("home")}><Home size={23} /><span>{t("Projects")}</span></button>
        <button data-tutorial="dashboard-challenges" className={section === "challenges" ? "active" : ""} type="button" onClick={() => onSectionChange("challenges")}><Grid3X3 size={23} /><span>{t("Challenges")}</span></button>
        {sharedEnabled ? <button className={section === "shared" ? "active" : ""} type="button" onClick={() => onSectionChange("shared")}><Upload size={23} /><span>{t("Shared")}</span></button> : null}
      </aside>
      <section className="kercad-dashboard-main">
        {section === "shared" ? <SharedProjects locale={locale} projects={projects} onOpen={onOpen} onSaved={onSharedSaved} /> : section === "challenges" ? <>
          <header className="kercad-dashboard-project-heading kercad-challenges-heading">
            <div><h1>{t("Challenges")}</h1><span>{t("{count} visible", { count: visibleChallenges.length })} · {t("{count} installed", { count: challenges.length })}</span></div>
            <div className="kercad-dashboard-project-controls">
              <button className="kercad-install-challenge" type="button" onClick={() => challengeInputRef.current?.click()}><Upload size={19} /> {t("Import challenge")}</button>
              <label className="kercad-dashboard-search"><Search size={20} /><input value={challengeQuery} onChange={(event) => setChallengeQuery(event.target.value)} placeholder={t("Search challenges")} /></label>
              <div className="kercad-dashboard-sort-toggle" role="group" aria-label={t("Sort challenges")}><button type="button" className={challengeSort === "recent" ? "active" : ""} onClick={() => setChallengeSort("recent")} aria-label={t("Sort by recent")} title={t("Sort by recent")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-recent.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-recent.svg")' }} /></button><button type="button" className={challengeSort === "name" ? "active" : ""} onClick={() => setChallengeSort("name")} aria-label={t("Sort by name")} title={t("Sort by name")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-name.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-name.svg")' }} /></button></div>
              <div className="kercad-dashboard-view-toggle"><button className={challengeView === "grid" ? "active" : ""} onClick={() => setChallengeView("grid")} aria-label={t("Card view")} title={t("Card view")}><Grid3X3 size={20} /></button><button className={challengeView === "list" ? "active" : ""} onClick={() => setChallengeView("list")} aria-label={t("List view")} title={t("List view")}><List size={21} /></button></div>
            </div>
          </header>
          <div className={`kercad-challenge-library ${challengeView}`}>
            {!challengeQuery.trim() ? <article className="kercad-challenge-card kercad-challenge-new-card">
              <button className="challenge-open" type="button" onClick={onCreateChallenge}>
                <span className="challenge-cover"><img src="/assets/kercad/create-new-3d-design.svg" alt="" draggable={false} /></span>
                <span className="challenge-copy"><strong>{t("Create new challenge")}</strong><span>{t("Build a guided kerCAD activity")}</span></span>
              </button>
            </article> : null}
            {visibleChallenges.map((challenge) => <article className="kercad-challenge-card" key={challenge.id}>
              <button className="challenge-open" type="button" onClick={() => onStartChallenge(challenge)}>
                <span className="challenge-cover">{challenge.cover ? <img src={challenge.cover} alt="" /> : <FileArchive size={52} />}</span>
                <span className="challenge-copy"><strong>{challenge.title}</strong><span>{challenge.description || t("Guided kerCAD activity")}</span>{challenge.categories?.length ? <span className="challenge-categories">{challenge.categories.map((category) => <i key={category}>{category}</i>)}</span> : null}{challenge.author ? <em>{t("By {name}", { name: challenge.author })}</em> : null}</span>
              </button>
              <nav className="challenge-actions" aria-label={t("Actions for {name}", { name: challenge.title })}>
                <button type="button" title={t("Edit challenge")} aria-label={t("Edit {name}", { name: challenge.title })} onClick={() => onEditChallenge(challenge)}><ToolbarEditOperationIcon /></button>
                <button type="button" title={t("Duplicate challenge")} aria-label={t("Duplicate {name}", { name: challenge.title })} disabled={busy} onClick={() => onDuplicateChallenge(challenge)}><Copy size={17} /></button>
                <button type="button" title={t("Export challenge")} aria-label={t("Export {name}", { name: challenge.title })} onClick={() => onExportChallenge(challenge)}><Download size={17} /></button>
                <button className="challenge-delete" type="button" title={t("Remove challenge")} aria-label={t("Remove {name}", { name: challenge.title })} onClick={() => onDeleteChallenge(challenge)}><Trash2 size={17} /></button>
              </nav>
            </article>)}
            {!challenges.length ? <button className="kercad-challenge-empty" type="button" onClick={() => challengeInputRef.current?.click()}><Upload size={34} /><strong>{t("Install your first challenge")}</strong><span>{t("Choose an kerCAD challenge ZIP from your computer.")}</span></button> : null}
            {challenges.length > 0 && !visibleChallenges.length ? <div className="kercad-dashboard-empty"><strong>{t("No matching challenges")}</strong><span>{t("Try another search.")}</span></div> : null}
          </div>
        </> : <>
        <header className="kercad-dashboard-project-heading">
          <div><h1>{t("Projects")}</h1><span>{t("{count} visible", { count: visible.length })}</span></div>
          <div className="kercad-dashboard-project-controls">
            <button className="kercad-import-project" type="button" disabled={busy} onClick={() => setImportOpen(true)}><Upload size={19} /> {t("Import project or 3D file")}</button>
            <label className="kercad-dashboard-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search projects")} /></label>
            <div className="kercad-dashboard-sort-toggle" role="group" aria-label={t("Sort projects")}><button type="button" className={sort === "recent" ? "active" : ""} onClick={() => setSort("recent")} aria-label={t("Sort by recent")} title={t("Sort by recent")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-recent.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-recent.svg")' }} /></button><button type="button" className={sort === "name" ? "active" : ""} onClick={() => setSort("name")} aria-label={t("Sort by name")} title={t("Sort by name")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-name.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-name.svg")' }} /></button></div>
            <div className="kercad-dashboard-view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label={t("Card view")} title={t("Card view")}><Grid3X3 size={20} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label={t("List view")} title={t("List view")}><List size={21} /></button></div>
          </div>
        </header>
        <div className={`kercad-dashboard-projects ${view}`}>
          {!query.trim() ? <article className="kercad-dashboard-card kercad-dashboard-new-card">
            <button className="card-open" type="button" onClick={onCreate}>
              <span className="card-preview"><img src="/assets/kercad/create-new-3d-design.svg" alt="" draggable={false} /></span>
              <span className="card-copy"><strong>{t("Create new 3D design")}</strong><small>{t("Start with an empty workplane")}</small></span>
            </button>
          </article> : null}
          {visible.map((project, index) => <article className="kercad-dashboard-card" key={project.id}>
            <button className="card-open" type="button" onClick={() => onOpen(project)}>
              <span className={`card-preview accent-${index % 4}`}>{project.thumbnail ? <img src={project.thumbnail} alt="" /> : <><span className="preview-grid" /><strong>{project.document.objects.length ? t(project.document.objects.length === 1 ? "{count} object" : "{count} objects", { count: project.document.objects.length }) : t("Empty design")}</strong></>}</span>
              <span className="card-copy"><strong>{project.name}</strong><small>{updatedLabel(project.updatedAt, locale)} · {project.document.author?.trim() || project.document.creator?.trim() || t("Author not provided")}</small></span>
            </button>
            <button className="card-rename" type="button" aria-label={t("Rename {name}", { name: project.name })} title={t("Rename project")} onClick={() => beginRename(project)}><ToolbarEditOperationIcon /></button>
            <button className="card-duplicate" type="button" disabled={busy} aria-label={t("Duplicate {name}", { name: project.name })} title={t("Duplicate project")} onClick={() => onDuplicate(project)}><Copy size={17} /></button>
            <button className="card-export" type="button" disabled={busy} aria-label={t("Export {name}", { name: project.name })} title={t("Export project")} onClick={() => onExport(project)}><Download size={17} /></button>
            <button className="card-delete" type="button" aria-label={t("Delete {name}", { name: project.name })} title={t("Delete project")} onClick={() => setDeleting(project)}><Trash2 size={17} /></button>
          </article>)}
          {query.trim() && !visible.length ? <div className="kercad-dashboard-empty"><strong>{t("No projects found")}</strong><span>{t("Try another project name.")}</span></div> : null}
        </div>
        </>}
      </section>
    </div>
    {renaming ? <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setRenaming(null)}>
      <form className="kercad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-rename-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
        <header><strong id="kercad-project-rename-title">{t("Rename project")}</strong><button type="button" aria-label={t("Cancel")} onClick={() => setRenaming(null)}><X size={18} /></button></header>
        <label><span>{t("Name")}</span><input ref={renameInputRef} value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /></label>
        <label><span>{t("Author")}</span><input value={authorDraft} maxLength={160} autoComplete="name" onChange={(event) => setAuthorDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /></label>
        <footer><button type="button" onClick={() => setRenaming(null)}>{t("Cancel")}</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>{t("OK")}</button></footer>
      </form>
    </div> : null}
    {deleting ? <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setDeleting(null)}>
      <section className="kercad-rename-dialog kercad-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-delete-title" onPointerDown={(event) => event.stopPropagation()}>
        <header><strong id="kercad-project-delete-title">{t("Delete project?")}</strong><button type="button" aria-label={t("Cancel")} onClick={() => setDeleting(null)}><X size={18} /></button></header>
        <p>{t("Delete project “{name}”? This cannot be undone.", { name: deleting.name })}</p>
        <footer><button type="button" onClick={() => setDeleting(null)}>{t("Cancel")}</button><button className="danger" type="button" onClick={() => { onDelete(deleting); setDeleting(null); }}>{t("Delete")}</button></footer>
      </section>
    </div> : null}
    {importOpen && <ImportDesignDialog locale={locale} newProject onClose={() => setImportOpen(false)} onBrowse={() => inputRef.current?.click()} onFile={(file) => { setImportOpen(false); onImport(file); }} />}
    <input ref={inputRef} hidden type="file" accept={".kercad,.kercad.json,.json,.svg,.step,.stp,.stl,.obj,.jpg,.jpeg,.png,application/vnd.kercad.project+zip,application/json,image/svg+xml,model/step,model/stl,model/obj,image/jpeg,image/png ," + LEGACY_PROJECT_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setImportOpen(false); onImport(file); } event.target.value = ""; }} />
    <input ref={challengeInputRef} hidden type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportChallenge(file); event.target.value = ""; }} />
  </main>;
}
