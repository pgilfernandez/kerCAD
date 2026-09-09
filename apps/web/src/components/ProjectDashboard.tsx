"use client";

import { Download, FileArchive, Grid3X3, Home, List, Play, Plus, Search, Settings, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolbarEditOperationIcon } from "@/components/icons";
import type { EducadChallenge } from "@/lib/challengeLibrary";
import type { ProjectLibraryEntry } from "@/lib/projectLibrary";

type Props = {
  projects: ProjectLibraryEntry[];
  busy?: boolean;
  section: "home" | "challenges";
  onSectionChange: (section: "home" | "challenges") => void;
  onShowLanding: () => void;
  onCreate: () => void;
  onOpen: (project: ProjectLibraryEntry) => void;
  onImport: (file: File) => void;
  onDelete: (project: ProjectLibraryEntry) => void;
  onRename: (project: ProjectLibraryEntry, name: string) => void;
  challenges: EducadChallenge[];
  onImportChallenge: (file: File) => void;
  onCreateChallenge: () => void;
  onStartChallenge: (challenge: EducadChallenge) => void;
  onEditChallenge: (challenge: EducadChallenge) => void;
  onExportChallenge: (challenge: EducadChallenge) => void;
  onDeleteChallenge: (challenge: EducadChallenge) => void;
};

function updatedLabel(timestamp: number) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.max(1, Math.round(age / 60_000))} min ago`;
  if (age < 86_400_000) return "Today";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(timestamp);
}

export function ProjectDashboard({ projects, busy = false, section, onSectionChange, onShowLanding, onCreate, onOpen, onImport, onDelete, onRename, challenges, onImportChallenge, onCreateChallenge, onStartChallenge, onEditChallenge, onExportChallenge, onDeleteChallenge }: Props) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [challengeQuery, setChallengeQuery] = useState("");
  const [challengeView, setChallengeView] = useState<"grid" | "list">("grid");
  const [challengeSort, setChallengeSort] = useState<"recent" | "name">("recent");
  const [renaming, setRenaming] = useState<ProjectLibraryEntry | null>(null);
  const [deleting, setDeleting] = useState<ProjectLibraryEntry | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const challengeInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => projects
    .filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => sort === "recent"
      ? right.updatedAt - left.updatedAt
      : left.name.localeCompare(right.name, undefined, { sensitivity: "base" })), [projects, query, sort]);
  const visibleChallenges = useMemo(() => {
    const needle = challengeQuery.trim().toLocaleLowerCase();
    return challenges
      .filter((challenge) => !needle || [challenge.title, challenge.description, challenge.author, ...(challenge.categories ?? [])].some((value) => value?.toLocaleLowerCase().includes(needle)))
      .sort((left, right) => challengeSort === "recent"
        ? right.installedAt - left.installedAt
        : left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
  }, [challenges, challengeQuery, challengeSort]);
  useEffect(() => {
    if (!renaming) return;
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renaming]);
  const beginRename = (project: ProjectLibraryEntry) => {
    setRenameDraft(project.name);
    setRenaming(project);
  };
  const commitRename = () => {
    if (!renaming || !renameDraft.trim()) return;
    onRename(renaming, renameDraft.trim());
    setRenaming(null);
  };
  return <main className="educad-dashboard-shell" aria-busy={busy}>
    <header className="educad-dashboard-topbar">
      <strong className="educad-dashboard-brand"><img className="educad-dashboard-logo" src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></strong>
      <nav className="educad-dashboard-mobile-nav" aria-label="Dashboard sections"><button className={section === "home" ? "active" : ""} type="button" onClick={() => onSectionChange("home")}><Home size={18} /> Projects</button><button className={section === "challenges" ? "active" : ""} type="button" onClick={() => onSectionChange("challenges")}><Grid3X3 size={18} /> Challenges</button></nav>
      <button className="educad-dashboard-about" type="button" onClick={onShowLanding}>About eduCAD</button>
    </header>
    <div className="educad-dashboard-layout">
      <aside className="educad-dashboard-sidebar">
        <button className={section === "home" ? "active" : ""} type="button" onClick={() => onSectionChange("home")}><Home size={23} /><span>Home</span></button>
        <button className={section === "challenges" ? "active" : ""} type="button" onClick={() => onSectionChange("challenges")}><Grid3X3 size={23} /><span>Challenges</span></button>
        <button className="settings" type="button" disabled><Settings size={23} /><span>Settings</span></button>
      </aside>
      <section className="educad-dashboard-main">
        {section === "challenges" ? <>
          <header className="educad-dashboard-project-heading educad-challenges-heading">
            <div><h1>Challenges</h1><span>{visibleChallenges.length} visible · {challenges.length} installed</span></div>
            <div className="educad-challenge-heading-actions"><button className="educad-create-challenge" type="button" onClick={onCreateChallenge}><Plus size={19} /> Create new challenge</button><button className="educad-install-challenge" type="button" onClick={() => challengeInputRef.current?.click()}><Upload size={19} /> Install challenge</button></div>
          </header>
          <div className="educad-dashboard-project-controls educad-challenge-library-controls">
            <label className="educad-dashboard-search"><Search size={20} /><input value={challengeQuery} onChange={(event) => setChallengeQuery(event.target.value)} placeholder="Search challenges" /></label>
            <div className="educad-dashboard-sort-toggle" role="group" aria-label="Sort challenges"><button type="button" className={challengeSort === "recent" ? "active" : ""} onClick={() => setChallengeSort("recent")} aria-label="Sort by recent" title="Sort by recent"><img src="/assets/educad/toolbar/project-sort-recent.svg" alt="" /></button><button type="button" className={challengeSort === "name" ? "active" : ""} onClick={() => setChallengeSort("name")} aria-label="Sort by name" title="Sort by name"><img src="/assets/educad/toolbar/project-sort-name.svg" alt="" /></button></div>
            <div className="educad-dashboard-view-toggle"><button className={challengeView === "grid" ? "active" : ""} onClick={() => setChallengeView("grid")} aria-label="Grid view"><Grid3X3 size={20} /></button><button className={challengeView === "list" ? "active" : ""} onClick={() => setChallengeView("list")} aria-label="List view"><List size={21} /></button></div>
          </div>
          <div className={`educad-challenge-library ${challengeView}`}>
            {visibleChallenges.map((challenge) => <article className="educad-challenge-card" key={challenge.id}>
              <button className="challenge-open" type="button" onClick={() => onStartChallenge(challenge)}>
                <span className="challenge-cover">{challenge.cover ? <img src={challenge.cover} alt="" /> : <FileArchive size={52} />}</span>
                <span className="challenge-copy"><small>{challenge.steps.length} STEPS</small><strong>{challenge.title}</strong><span>{challenge.description || "Guided eduCAD activity"}</span>{challenge.categories?.length ? <span className="challenge-categories">{challenge.categories.map((category) => <i key={category}>{category}</i>)}</span> : null}{challenge.author ? <em>By {challenge.author}</em> : null}</span>
                <span className="challenge-play"><Play size={19} fill="currentColor" /> Start</span>
              </button>
              <nav className="challenge-actions" aria-label={`${challenge.title} actions`}>
                <button type="button" title="Edit challenge" aria-label={`Edit ${challenge.title}`} onClick={() => onEditChallenge(challenge)}><ToolbarEditOperationIcon /></button>
                <button type="button" title="Export challenge" aria-label={`Export ${challenge.title}`} onClick={() => onExportChallenge(challenge)}><Download size={17} /></button>
                <button type="button" title="Remove challenge" aria-label={`Remove ${challenge.title}`} onClick={() => onDeleteChallenge(challenge)}><Trash2 size={17} /></button>
              </nav>
            </article>)}
            {!challenges.length ? <button className="educad-challenge-empty" type="button" onClick={() => challengeInputRef.current?.click()}><Upload size={34} /><strong>Install your first challenge</strong><span>Choose an eduCAD challenge ZIP from your computer.</span></button> : null}
            {challenges.length > 0 && !visibleChallenges.length ? <div className="educad-dashboard-empty"><strong>No matching challenges</strong><span>Try another search.</span></div> : null}
          </div>
        </> : <>
        <header className="educad-dashboard-project-heading">
          <div><h1>Projects</h1><span>{visible.length} visible</span></div>
          <div className="educad-dashboard-project-controls">
            <button className="educad-import-project" type="button" onClick={() => inputRef.current?.click()}><Upload size={19} /> Import project</button>
            <label className="educad-dashboard-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></label>
            <div className="educad-dashboard-sort-toggle" role="group" aria-label="Sort projects"><button type="button" className={sort === "recent" ? "active" : ""} onClick={() => setSort("recent")} aria-label="Sort by recent" title="Sort by recent"><img src="/assets/educad/toolbar/project-sort-recent.svg" alt="" /></button><button type="button" className={sort === "name" ? "active" : ""} onClick={() => setSort("name")} aria-label="Sort by name" title="Sort by name"><img src="/assets/educad/toolbar/project-sort-name.svg" alt="" /></button></div>
            <div className="educad-dashboard-view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid3X3 size={20} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={21} /></button></div>
          </div>
        </header>
        <div className={`educad-dashboard-projects ${view}`}>
          {!query.trim() ? <article className="educad-dashboard-card educad-dashboard-new-card">
            <button className="card-open" type="button" onClick={onCreate}>
              <span className="card-preview"><span className="new-project-plus"><Plus size={48} /></span></span>
              <span className="card-copy"><strong>Create new 3D design</strong><small>Start with an empty workplane</small></span>
            </button>
          </article> : null}
          {visible.map((project, index) => <article className="educad-dashboard-card" key={project.id}>
            <button className="card-open" type="button" onClick={() => onOpen(project)}>
              <span className={`card-preview accent-${index % 4}`}>{project.thumbnail ? <img src={project.thumbnail} alt="" /> : <><span className="preview-grid" /><strong>{project.document.objects.length ? `${project.document.objects.length} object${project.document.objects.length === 1 ? "" : "s"}` : "Empty design"}</strong></>}</span>
              <span className="card-copy"><strong>{project.name}</strong><small>{updatedLabel(project.updatedAt)} · {project.document.features.length} operations</small></span>
            </button>
            <button className="card-rename" type="button" aria-label={`Rename ${project.name}`} title="Rename project" onClick={() => beginRename(project)}><ToolbarEditOperationIcon /></button>
            <button className="card-delete" type="button" aria-label={`Delete ${project.name}`} title="Delete project" onClick={() => setDeleting(project)}><Trash2 size={17} /></button>
          </article>)}
          {query.trim() && !visible.length ? <div className="educad-dashboard-empty"><strong>No projects found</strong><span>Try another project name.</span></div> : null}
        </div>
        </>}
      </section>
    </div>
    {renaming ? <div className="educad-dialog-backdrop" role="presentation" onPointerDown={() => setRenaming(null)}>
      <form className="educad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-project-rename-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
        <header><strong id="educad-project-rename-title">Rename project</strong><button type="button" aria-label="Cancel" onClick={() => setRenaming(null)}><X size={18} /></button></header>
        <label><span>Name</span><input ref={renameInputRef} value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /></label>
        <footer><button type="button" onClick={() => setRenaming(null)}>Cancel</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>OK</button></footer>
      </form>
    </div> : null}
    {deleting ? <div className="educad-dialog-backdrop" role="presentation" onPointerDown={() => setDeleting(null)}>
      <section className="educad-rename-dialog educad-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-project-delete-title" onPointerDown={(event) => event.stopPropagation()}>
        <header><strong id="educad-project-delete-title">Delete project?</strong><button type="button" aria-label="Cancel" onClick={() => setDeleting(null)}><X size={18} /></button></header>
        <p>Delete <strong>{deleting.name}</strong>? This cannot be undone.</p>
        <footer><button type="button" onClick={() => setDeleting(null)}>Cancel</button><button className="danger" type="button" onClick={() => { onDelete(deleting); setDeleting(null); }}>Delete</button></footer>
      </section>
    </div> : null}
    <input ref={inputRef} hidden type="file" accept=".educad,.educad.json,.json,application/vnd.educad.project+zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
    <input ref={challengeInputRef} hidden type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportChallenge(file); event.target.value = ""; }} />
  </main>;
}
