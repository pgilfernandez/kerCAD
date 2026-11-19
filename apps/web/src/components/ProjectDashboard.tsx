"use client";

import { ChallengeIcon } from "@/components/ChallengeIcon";

import { DashboardBrandLogo } from "@/components/DashboardBrandLogo";

import { CreateDesignIcon } from "@/components/CreateDesignIcon";
import { LEGACY_PROJECT_ACCEPT } from "@/lib/legacyBrand";
import { Copy, Download, FileArchive, Grid3X3, List, PencilRuler, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolbarEditOperationIcon } from "@/components/icons";
import { SharedProjects } from "@/components/SharedProjects";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { EditorGettingStarted, resetStartupTutorials } from "@/components/EditorGettingStarted";
import { ImportDesignDialog } from "@/components/ImportDesignDialog";
import type { KercadLocale } from "@/lib/kercadI18n";
import { dashboardTranslate, type DashboardTranslationKey } from "@/lib/dashboardI18n";
import type { KercadChallenge } from "@/lib/challengeLibrary";
import type { ProjectLibraryEntry } from "@/lib/projectLibrary";
import { uiText } from "@/lib/kercadI18n";
import { useAppLocale } from "@/lib/useAppLocale";

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
  onImport: (files: File[]) => void;
  onDelete: (project: ProjectLibraryEntry) => void;
  onRename: (project: ProjectLibraryEntry, name: string, author: string) => void;
  onDuplicate: (project: ProjectLibraryEntry) => void;
  onExport: (project: ProjectLibraryEntry) => void;
  challenges: KercadChallenge[];
  onImportChallenge: (files: File[]) => void;
  onCreateChallenge: () => void;
  onStartChallenge: (challenge: KercadChallenge) => void;
  onEditChallenge: (challenge: KercadChallenge) => void;
  onDuplicateChallenge: (challenge: KercadChallenge) => void;
  onExportChallenge: (challenge: KercadChallenge) => void;
  onDeleteChallenge: (challenge: KercadChallenge) => void;
};

function updatedLabel(timestamp: number, locale: KercadLocale) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return dashboardTranslate(locale, "dashboard.just.now.a69f48");
  if (age < 3_600_000) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.max(1, Math.round(age / 60_000)), "minute");
  if (age < 86_400_000) return dashboardTranslate(locale, "dashboard.today.24345a");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(timestamp);
}

export function ProjectDashboard({ projects, sharedEnabled = false, onSharedSaved, busy = false, section, onSectionChange, onShowLanding, onCreate, onOpen, onImport, onDelete, onRename, onDuplicate, onExport, challenges, onImportChallenge, onCreateChallenge, onStartChallenge, onEditChallenge, onDuplicateChallenge, onExportChallenge, onDeleteChallenge }: Props) {
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [locale, setLocale] = useAppLocale();
  const [tutorialLaunchRequest, setTutorialLaunchRequest] = useState(0);
  const changeLocale = setLocale;
  const t = (key: DashboardTranslationKey, values?: Record<string, string | number>) => dashboardTranslate(locale, key, values);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [challengeQuery, setChallengeQuery] = useState("");
  const [challengeView, setChallengeView] = useState<"grid" | "list">("grid");
  const [challengeSort, setChallengeSort] = useState<"recent" | "name">("recent");
  const [renaming, setRenaming] = useState<ProjectLibraryEntry | null>(null);
  const [deleting, setDeleting] = useState<ProjectLibraryEntry | null>(null);
  const [sharing, setSharing] = useState<ProjectLibraryEntry | null>(null);
  const [sharedNotice, setSharedNotice] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const challengeInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => projects
    .filter((project) => project.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)))
    .sort((left, right) => sort === "recent"
      ? right.updatedAt - left.updatedAt
      : left.name.localeCompare(right.name, locale, { sensitivity: "base" })), [projects, query, sort, locale]);
  const visibleChallenges = useMemo(() => {
    const needle = challengeQuery.trim().toLocaleLowerCase(locale);
    return challenges
      .filter((challenge) => !needle || [challenge.title, challenge.description, challenge.author, ...(challenge.categories ?? [])].some((value) => value?.toLocaleLowerCase(locale).includes(needle)))
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
      <strong className="kercad-dashboard-brand"><DashboardBrandLogo /><span>{uiText("ui.page.kercad.c0bf6d", {}, locale)}</span></strong>
      <nav className="kercad-dashboard-mobile-nav" aria-label={t("dashboard.dashboard.sections.385166")}><button data-tutorial="dashboard-projects" className={section === "home" ? "active" : ""} type="button" onClick={() => onSectionChange("home")}><PencilRuler size={18} /> {t("dashboard.projects.53e890")}</button><button data-tutorial="dashboard-challenges" className={section === "challenges" ? "active" : ""} type="button" onClick={() => onSectionChange("challenges")}><ChallengeIcon size={18} /> {t("dashboard.challenges.ff3876")}</button>{sharedEnabled ? <button className={section === "shared" ? "active" : ""} type="button" onClick={() => onSectionChange("shared")}><PencilRuler size={18} /> {t("dashboard.shared.50d0d8")}</button> : null}</nav>
      <EditorHeaderActions locale={locale} onLocaleChange={changeLocale} onShowLanding={onShowLanding} onLaunchTutorial={() => { resetStartupTutorials(); setTutorialLaunchRequest((request) => request + 1); }} showDonation />
    </header>
    <div className="kercad-dashboard-layout">
      <aside className="kercad-dashboard-sidebar">
        <button data-tutorial="dashboard-projects" className={section === "home" ? "active" : ""} type="button" onClick={() => onSectionChange("home")}><PencilRuler size={23} /><span>{t("dashboard.projects.53e890")}</span></button>
        {sharedEnabled ? <button className={section === "shared" ? "active" : ""} type="button" onClick={() => onSectionChange("shared")}><PencilRuler size={23} /><span>{t("dashboard.shared.50d0d8")}</span></button> : null}
        <button data-tutorial="dashboard-challenges" className={section === "challenges" ? "active" : ""} type="button" onClick={() => onSectionChange("challenges")}><ChallengeIcon size={23} /><span>{t("dashboard.challenges.ff3876")}</span></button>
      </aside>
      <section className="kercad-dashboard-main">
        {sharedEnabled && section === "shared" ? <SharedProjects locale={locale} onOpen={onOpen} /> : section === "challenges" ? <>
          <header className="kercad-dashboard-project-heading kercad-challenges-heading">
            <div><h1>{t("dashboard.challenges.ff3876")}</h1><span>{t("dashboard.visible.4cd4ed", { count: visibleChallenges.length })} · {t("dashboard.installed.25f009", { count: challenges.length })}</span></div>
            <div className="kercad-dashboard-project-controls">
              <button className="kercad-install-challenge" type="button" onClick={() => challengeInputRef.current?.click()}><Upload size={19} /> {t("dashboard.import.challenge.d5239e")}</button>
              <label className="kercad-dashboard-search"><Search size={20} /><input value={challengeQuery} onChange={(event) => setChallengeQuery(event.target.value)} placeholder={t("dashboard.search.challenges.6bea73")} /></label>
              <div className="kercad-dashboard-sort-toggle" role="group" aria-label={t("dashboard.sort.challenges.8d2a7e")}><button type="button" className={challengeSort === "recent" ? "active" : ""} onClick={() => setChallengeSort("recent")} aria-label={t("dashboard.sort.by.recent.d7127b")} title={t("dashboard.sort.by.recent.d7127b")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-recent.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-recent.svg")' }} /></button><button type="button" className={challengeSort === "name" ? "active" : ""} onClick={() => setChallengeSort("name")} aria-label={t("dashboard.sort.by.name.d3b65f")} title={t("dashboard.sort.by.name.d3b65f")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-name.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-name.svg")' }} /></button></div>
              <div className="kercad-dashboard-view-toggle"><button className={challengeView === "grid" ? "active" : ""} onClick={() => setChallengeView("grid")} aria-label={t("dashboard.card.view.5b36c5")} title={t("dashboard.card.view.5b36c5")}><Grid3X3 size={20} /></button><button className={challengeView === "list" ? "active" : ""} onClick={() => setChallengeView("list")} aria-label={t("dashboard.list.view.694bbd")} title={t("dashboard.list.view.694bbd")}><List size={21} /></button></div>
            </div>
          </header>
          <div className={`kercad-challenge-library ${challengeView}`}>
            {!challengeQuery.trim() ? <article className="kercad-challenge-card kercad-challenge-new-card">
              <button className="challenge-open" type="button" onClick={onCreateChallenge}>
                <span className="challenge-cover"><CreateDesignIcon /></span>
                <span className="challenge-copy"><strong>{t("dashboard.create.new.challenge.6f83c0")}</strong><span>{t("dashboard.build.a.guided.kercad.activity.107ef1")}</span></span>
              </button>
            </article> : null}
            {visibleChallenges.map((challenge) => <article className="kercad-challenge-card" key={challenge.id}>
              <button className="challenge-open" type="button" onClick={() => onStartChallenge(challenge)}>
                <span className="challenge-cover">{challenge.cover ? <img src={challenge.cover} alt="" /> : <FileArchive size={52} />}</span>
                <span className="challenge-copy"><strong>{challenge.title}</strong><span>{challenge.description || t("dashboard.guided.kercad.activity.4fcbd0")}</span>{challenge.categories?.length ? <span className="challenge-categories">{challenge.categories.map((category) => <i key={category}>{category}</i>)}</span> : null}{challenge.author ? <em>{t("dashboard.by.e13a27", { name: challenge.author })}</em> : null}</span>
              </button>
              <nav className="challenge-actions" aria-label={t("dashboard.actions.for.0a35ec", { name: challenge.title })}>
                <button type="button" title={t("dashboard.edit.challenge.9e0613")} aria-label={t("dashboard.edit.3dfae1", { name: challenge.title })} onClick={() => onEditChallenge(challenge)}><ToolbarEditOperationIcon inheritColor /></button>
                <button type="button" title={t("dashboard.duplicate.challenge.5f9c28")} aria-label={t("dashboard.duplicate.a4f35f", { name: challenge.title })} disabled={busy} onClick={() => onDuplicateChallenge(challenge)}><Copy size={17} /></button>
                <button type="button" title={t("dashboard.export.challenge.d3c657")} aria-label={t("dashboard.export.63638e", { name: challenge.title })} onClick={() => onExportChallenge(challenge)}><Download size={17} /></button>
                <button className="challenge-delete" type="button" title={t("dashboard.remove.challenge.8354b7")} aria-label={t("dashboard.remove.df7193", { name: challenge.title })} onClick={() => onDeleteChallenge(challenge)}><Trash2 size={17} /></button>
              </nav>
            </article>)}
            {!challenges.length ? <button className="kercad-challenge-empty" type="button" onClick={() => challengeInputRef.current?.click()}><Upload size={34} /><strong>{t("dashboard.install.your.first.challenge.94f9b2")}</strong><span>{t("dashboard.choose.an.kercad.challenge.zip.from.your.computer.c64cea")}</span></button> : null}
            {challenges.length > 0 && !visibleChallenges.length ? <div className="kercad-dashboard-empty"><strong>{t("dashboard.no.matching.challenges.c3eeae")}</strong><span>{t("dashboard.try.another.search.1824b9")}</span></div> : null}
          </div>
        </> : <>
        <header className="kercad-dashboard-project-heading">
          <div><h1>{t("dashboard.projects.53e890")}</h1><span>{t("dashboard.visible.4cd4ed", { count: visible.length })}</span></div>
          <div className="kercad-dashboard-project-controls">
            <button className="kercad-import-project" type="button" disabled={busy} onClick={() => setImportOpen(true)}><Upload size={19} /> {t("dashboard.import.project.or.3d.file.b01974")}</button>
            <label className="kercad-dashboard-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dashboard.search.projects.30c3c3")} /></label>
            <div className="kercad-dashboard-sort-toggle" role="group" aria-label={t("dashboard.sort.projects.28e2d3")}><button type="button" className={sort === "recent" ? "active" : ""} onClick={() => setSort("recent")} aria-label={t("dashboard.sort.by.recent.d7127b")} title={t("dashboard.sort.by.recent.d7127b")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-recent.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-recent.svg")' }} /></button><button type="button" className={sort === "name" ? "active" : ""} onClick={() => setSort("name")} aria-label={t("dashboard.sort.by.name.d3b65f")} title={t("dashboard.sort.by.name.d3b65f")}><span aria-hidden="true" className="kercad-dashboard-sort-icon" style={{ maskImage: 'url("/assets/kercad/project-sort-name.svg")', WebkitMaskImage: 'url("/assets/kercad/project-sort-name.svg")' }} /></button></div>
            <div className="kercad-dashboard-view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label={t("dashboard.card.view.5b36c5")} title={t("dashboard.card.view.5b36c5")}><Grid3X3 size={20} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label={t("dashboard.list.view.694bbd")} title={t("dashboard.list.view.694bbd")}><List size={21} /></button></div>
          </div>
        </header>
        {sharedNotice && <p className="kercad-shared-description" role="status">{t("dashboard.project.saved.to.the.shared.library.b67eff")}</p>}
        <div className={`kercad-dashboard-projects ${view}`}>
          {!query.trim() ? <article className="kercad-dashboard-card kercad-dashboard-new-card">
            <button className="card-open" type="button" onClick={onCreate}>
              <span className="card-preview"><CreateDesignIcon /></span>
              <span className="card-copy"><strong>{t("dashboard.create.new.3d.design.5f6c94")}</strong><small>{t("dashboard.start.with.an.empty.workplane.69a37f")}</small></span>
            </button>
          </article> : null}
          {visible.map((project, index) => <article className="kercad-dashboard-card" key={project.id}>
            <button className="card-open" type="button" onClick={() => onOpen(project)}>
              <span className={`card-preview accent-${index % 4}`}>{project.thumbnail ? <img src={project.thumbnail} alt="" /> : <><span className="preview-grid" /><strong>{project.document.objects.length ? t(project.document.objects.length === 1 ? "dashboard.object.ad9044" : "dashboard.objects.aecbf9", { count: project.document.objects.length }) : t("dashboard.empty.design.c33dae")}</strong></>}</span>
              <span className="card-copy"><strong>{project.name}</strong><small>{updatedLabel(project.updatedAt, locale)} · {project.document.author?.trim() || project.document.creator?.trim() || t("dashboard.author.not.provided.a749ef")}</small></span>
            </button>
            <button className="card-rename" type="button" aria-label={t("dashboard.rename.c2729b", { name: project.name })} title={t("dashboard.rename.project.633018")} onClick={() => beginRename(project)}><ToolbarEditOperationIcon inheritColor /></button>
            {sharedEnabled && <button className="card-share" type="button" disabled={busy} aria-label={`${t("dashboard.save.to.shared.5476e1")}: ${project.name}`} title={t("dashboard.save.to.shared.5476e1")} onClick={() => { setSharedNotice(false); setSharing(project); }}><Upload size={17} /></button>}
            <button className="card-duplicate" type="button" disabled={busy} aria-label={t("dashboard.duplicate.a4f35f", { name: project.name })} title={t("dashboard.duplicate.project.7c2f4c")} onClick={() => onDuplicate(project)}><Copy size={17} /></button>
            <button className="card-export" type="button" disabled={busy} aria-label={t("dashboard.export.63638e", { name: project.name })} title={t("dashboard.export.project.5eff3a")} onClick={() => onExport(project)}><Download size={17} /></button>
            <button className="card-delete" type="button" aria-label={t("dashboard.delete.1164a6", { name: project.name })} title={t("dashboard.delete.project.af1456")} onClick={() => setDeleting(project)}><Trash2 size={17} /></button>
          </article>)}
          {query.trim() && !visible.length ? <div className="kercad-dashboard-empty"><strong>{t("dashboard.no.projects.found.008ce3")}</strong><span>{t("dashboard.try.another.project.name.688aec")}</span></div> : null}
        </div>
        </>}
      </section>
    </div>
    {renaming ? <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setRenaming(null)}>
      <form className="kercad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-rename-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
        <header><strong id="kercad-project-rename-title">{t("dashboard.rename.project.633018")}</strong><button type="button" aria-label={t("dashboard.cancel.77dfd2")} onClick={() => setRenaming(null)}><X size={18} /></button></header>
        <label><span>{t("dashboard.name.709a23")}</span><input ref={renameInputRef} value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /></label>
        <label><span>{t("dashboard.author.5fda23")}</span><input value={authorDraft} maxLength={160} autoComplete="name" onChange={(event) => setAuthorDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /></label>
        <footer><button type="button" onClick={() => setRenaming(null)}>{t("dashboard.cancel.77dfd2")}</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>{t("dashboard.ok.9ce3bd")}</button></footer>
      </form>
    </div> : null}
    {deleting ? <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setDeleting(null)}>
      <section className="kercad-rename-dialog kercad-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-delete-title" onPointerDown={(event) => event.stopPropagation()}>
        <header><strong id="kercad-project-delete-title">{t("dashboard.delete.project.28fff6")}</strong><button type="button" aria-label={t("dashboard.cancel.77dfd2")} onClick={() => setDeleting(null)}><X size={18} /></button></header>
        <p>{t("dashboard.delete.project.this.cannot.be.undone.48a0c6", { name: deleting.name })}</p>
        <footer><button type="button" onClick={() => setDeleting(null)}>{t("dashboard.cancel.77dfd2")}</button><button className="danger" type="button" onClick={() => { onDelete(deleting); setDeleting(null); }}>{t("dashboard.delete.f6fdbe")}</button></footer>
      </section>
    </div> : null}
    {sharing && sharedEnabled && <ShareProjectDialog key={sharing.id} project={sharing} locale={locale} onClose={() => setSharing(null)} onSaved={() => { setSharing(null); setSharedNotice(true); onSharedSaved(); }} />}
    {importOpen && <ImportDesignDialog locale={locale} newProject onClose={() => setImportOpen(false)} onBrowse={() => inputRef.current?.click()} onFile={(file) => { setImportOpen(false); onImport([file]); }} onFiles={(files) => { setImportOpen(false); onImport(files); }} />}
    <input ref={inputRef} hidden multiple type="file" accept={".kercad,.kercad.json,.json,.svg,.step,.stp,.stl,.obj,.jpg,.jpeg,.png,application/vnd.kercad.project+zip,application/json,image/svg+xml,model/step,model/stl,model/obj,image/jpeg,image/png ," + LEGACY_PROJECT_ACCEPT} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) { setImportOpen(false); onImport(files); } event.target.value = ""; }} />
    <input ref={challengeInputRef} hidden multiple type="file" accept=".zip,application/zip" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onImportChallenge(files); event.target.value = ""; }} />
  </main>;
}
