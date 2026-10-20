"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { ToolbarImportIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import type { EducadLocale } from "@/lib/educadI18n";

export function ImportDesignDialog({ locale, onClose, onBrowse, onFile, newProject = false }: {
  locale: EducadLocale;
  onClose: () => void;
  onBrowse: () => void;
  onFile: (file: File) => void;
  newProject?: boolean;
}) {
  const dialog = useAccessibleDialog<HTMLElement>(true, onClose);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const es = locale === "es";
  const formats = [
    [".jpg · .jpeg · .png", es ? "Imágenes de referencia" : "Reference images", es ? "Imágenes planas que puedes mover, rotar y escalar. No forman parte del sólido." : "Flat images you can move, rotate and scale. They do not become solid geometry."],
    [".educad · .json", es ? "Proyectos eduCAD" : "eduCAD projects", newProject ? (es ? "Crea una nueva copia local del proyecto." : "Create a new local copy of the project.") : (es ? "Abre el proyecto o añade sus objetos al diseño actual." : "Open the project or add its objects to the current design.")],
    [".step · .stp", es ? "Geometría sólida" : "Solid geometry", es ? "Importa sólidos CAD para trabajar con ellos." : "Import CAD solids to work with them."],
    [".stl · .obj", es ? "Mallas de referencia" : "Reference meshes", es ? "Se incorporan como referencia, no como sólidos paramétricos." : "Added as references, not as parametric solids."],
    [".svg", es ? "Dibujo vectorial" : "Vector drawing", es ? "Crea un boceto con extrusión a partir del dibujo." : "Create a sketch with an extrusion from the drawing."],
  ];
  return <div className="educad-dialog-backdrop educad-import-backdrop" onPointerDown={onClose}>
    <section ref={dialog} className="educad-new-document-dialog educad-import-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-import-title" aria-describedby="educad-import-description" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()}>
      <header><strong id="educad-import-title">{es ? "Importar diseño" : "Import design"}</strong><button type="button" title={es ? "Cerrar" : "Close"} aria-label={es ? "Cerrar" : "Close"} onClick={onClose}><X size={18} /></button></header>
      <p id="educad-import-description">{es ? "Importa un proyecto, geometría 3D o un dibujo vectorial. Elige un archivo cada vez." : "Import a project, 3D geometry or a vector drawing. Choose one file at a time."}</p>
      {newProject && <p>{es ? "El archivo se importará en un proyecto nuevo." : "The file will be imported into a new project."}</p>}
      <button type="button" className={`educad-import-dropzone ${dragging ? "dragging" : ""}`} onClick={onBrowse}
        onDragEnter={(event) => { event.preventDefault(); depth.current += 1; setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false);
          const files = event.dataTransfer.files;
          if (files.length !== 1) { setError(es ? "Suelta un único archivo cada vez." : "Drop one file at a time."); return; }
          if (!/\.(educad|json|step|stp|stl|obj|svg|jpe?g|png)$/i.test(files[0].name)) { setError(es ? "Formato no compatible. Usa uno de los formatos indicados abajo." : "Unsupported format. Use one of the formats listed below."); return; }
          onFile(files[0]);
        }}>
        <ToolbarImportIcon /><strong>{es ? "Arrastra y suelta un archivo aquí" : "Drag and drop a file here"}</strong><span>{es ? "o pulsa para elegirlo desde tu ordenador" : "or click to choose it from your computer"}</span>
      </button>
      {error && <p className="educad-import-error" role="alert">{error}</p>}
      <ul className="educad-import-formats">{formats.map(([extensions, title, description]) => <li key={extensions}><div><strong>{title}</strong><span>{extensions}</span></div><p>{description}</p></li>)}</ul>
      <footer><button type="button" onClick={onClose}>{es ? "Cancelar" : "Cancel"}</button><button type="button" className="primary" onClick={onBrowse}>{es ? "Elegir archivo" : "Choose file"}</button></footer>
    </section>
  </div>;
}
