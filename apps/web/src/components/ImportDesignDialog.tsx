"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { ToolbarImportIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import type { KercadLocale } from "@/lib/kercadI18n";
import { uiText } from "@/lib/kercadI18n";

export function ImportDesignDialog({ locale, onClose, onBrowse, onFile, newProject = false }: {
  locale: KercadLocale;
  onClose: () => void;
  onBrowse: () => void;
  onFile: (file: File) => void;
  newProject?: boolean;
}) {
  const dialog = useAccessibleDialog<HTMLElement>(true, onClose);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const formats = [
    [".jpg · .jpeg · .png", uiText("ui.importdesigndialog.reference.images.409986", {}, locale), uiText("ui.importdesigndialog.flat.images.you.can.move.rotate.and.scale.they.d.16eba3", {}, locale)],
    [".kercad · .json", uiText("ui.importdesigndialog.kercad.projects.1d7ed8", {}, locale), newProject ? (uiText("ui.importdesigndialog.create.a.new.local.copy.of.the.project.6d65dd", {}, locale)) : (uiText("ui.importdesigndialog.open.the.project.or.add.its.objects.to.the.curre.a7e181", {}, locale))],
    [".step · .stp", uiText("ui.importdesigndialog.solid.geometry.1e125e", {}, locale), uiText("ui.importdesigndialog.import.cad.solids.to.work.with.them.64edfd", {}, locale)],
    [".stl · .obj", uiText("ui.importdesigndialog.reference.meshes.713d73", {}, locale), uiText("ui.importdesigndialog.added.as.references.not.as.parametric.solids.6b9148", {}, locale)],
    [".svg", uiText("ui.importdesigndialog.vector.drawing.51866a", {}, locale), uiText("ui.importdesigndialog.create.a.sketch.with.an.extrusion.from.the.drawi.977e65", {}, locale)],
  ];
  return <div className="kercad-dialog-backdrop kercad-import-backdrop" onPointerDown={onClose}>
    <section ref={dialog} className="kercad-new-document-dialog kercad-import-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-import-title" aria-describedby="kercad-import-description" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()}>
      <header><strong id="kercad-import-title">{uiText("ui.importdesigndialog.import.design.b33615", {}, locale)}</strong><button type="button" title={uiText("common.close", {}, locale)} aria-label={uiText("common.close", {}, locale)} onClick={onClose}><X size={18} /></button></header>
      <p id="kercad-import-description">{uiText("ui.importdesigndialog.import.a.project.3d.geometry.or.a.vector.drawing.c2e97a", {}, locale)}</p>
      {newProject && <p>{uiText("ui.importdesigndialog.the.file.will.be.imported.into.a.new.project.fab3e3", {}, locale)}</p>}
      <button type="button" className={`kercad-import-dropzone ${dragging ? "dragging" : ""}`} onClick={onBrowse}
        onDragEnter={(event) => { event.preventDefault(); depth.current += 1; setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false);
          const files = event.dataTransfer.files;
          if (files.length !== 1) { setError(uiText("ui.importdesigndialog.drop.one.file.at.a.time.bb1eaf", {}, locale)); return; }
          if (!/\.(kercad|json|step|stp|stl|obj|svg|jpe?g|png)$/i.test(files[0].name)) { setError(uiText("ui.importdesigndialog.unsupported.format.use.one.of.the.formats.listed.c7e9b7", {}, locale)); return; }
          onFile(files[0]);
        }}>
        <ToolbarImportIcon /><strong>{uiText("ui.importdesigndialog.drag.and.drop.a.file.here.e1a775", {}, locale)}</strong><span>{uiText("ui.importdesigndialog.or.click.to.choose.it.from.your.computer.04e7a7", {}, locale)}</span>
      </button>
      {error && <p className="kercad-import-error" role="alert">{error}</p>}
      <ul className="kercad-import-formats">{formats.map(([extensions, title, description]) => <li key={extensions}><div><strong>{title}</strong><span>{extensions}</span></div><p>{description}</p></li>)}</ul>
      <footer><button type="button" onClick={onClose}>{uiText("dashboard.cancel.77dfd2", {}, locale)}</button><button type="button" className="primary" onClick={onBrowse}>{uiText("ui.importdesigndialog.choose.file.eb7eb7", {}, locale)}</button></footer>
    </section>
  </div>;
}
