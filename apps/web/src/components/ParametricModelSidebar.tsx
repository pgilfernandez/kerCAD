"use client";

import {
  ArrowDown,
  ArrowUp,
  Box,
  Circle,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleOff,
  Crosshair,
  DraftingCompass,
  Eye,
  EyeOff,
  FileBox,
  FlipHorizontal2,
  Layers3,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  Radius,
  Rows3,
  RotateCw,
  Combine,
  Triangle,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { createContext, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { canReorderParametricSelection, OBJECT_COLOR_PALETTE, parametricObjectTree, sketchForExtrude, updateParametricTreeSelection, type ParametricTreeSelection } from "@/lib/parametricObjects";
import { parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import { parametricTextFontNames, updateParametricTextSketch } from "@/lib/parametricText";
import { ToolbarBooleanModeIcon } from "@/components/icons";
import type { ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";

export type ModelSelectionKind = "object" | "feature";
export type ModelSidebarMode = "normal" | "simplified";
export type ModelTreeSelection = ParametricTreeSelection;

const NumericStepContext = createContext({ input: 0.5, slider: 0.1 });

type Props = {
  document: ParametricDocument;
  selection: ModelTreeSelection[];
  mode: ModelSidebarMode;
  editingOriginObjectId: string | null;
  gridStep: number;
  onSelectionChange: (selection: ModelTreeSelection[]) => void;
  onReorderSelection: (direction: "up" | "down") => void;
  onRenameSelection: (name: string) => void;
  onDeleteSelection: () => void;
  onToggleOriginEdit: (objectId: string) => void;
  onEditFeatureSelection: (featureId: string) => void;
  onEditSketch: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
  onEditShellSelection: (featureId: string) => void;
  onEditRevolveFace: (featureId: string) => void;
  onEditRevolveAxis: (featureId: string) => void;
  edgeTreatmentDraft: { treatment: "fillet" | "chamfer"; radius: number; faceCount: number; edgeCount: number; editing: boolean } | null;
  onEdgeTreatmentDraftChange: (update: Partial<{ treatment: "fillet" | "chamfer"; radius: number }>) => void;
  onAcceptEdgeTreatment: () => void;
  onCancelEdgeTreatment: () => void;
  faceExtrudeDraft: { operation: "add" | "cut"; distance: number; faceCount: number; editing: boolean } | null;
  onFaceExtrudeDraftChange: (update: Partial<{ operation: "add" | "cut"; distance: number }>) => void;
  onAcceptFaceExtrude: () => void;
  onCancelFaceExtrude: () => void;
  shellDraft: { thickness: number; faceCount: number; editing: boolean } | null;
  onShellDraftChange: (thickness: number) => void;
  onAcceptShell: () => void;
  onCancelShell: () => void;
  revolveDraft: { operation: "add" | "cut" | "intersect"; angle: number; axis: "x" | "y" | "z" | "edge"; faceCount: number; edgeCount: number; editing: boolean } | null;
  onRevolveDraftChange: (update: Partial<{ operation: "add" | "cut" | "intersect"; angle: number; axis: "x" | "y" | "z" | "edge" }>) => void;
  onAcceptRevolve: () => void;
  onCancelRevolve: () => void;
  onUpdateObject: (id: string, update: (object: ParametricObject) => void) => void;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
};

export function ParametricModelSidebar({
  document,
  selection,
  mode,
  editingOriginObjectId,
  gridStep,
  onSelectionChange,
  onReorderSelection,
  onRenameSelection,
  onDeleteSelection,
  onToggleOriginEdit,
  onEditFeatureSelection,
  onEditSketch,
  onEditFaceExtrudeSelection,
  onEditShellSelection,
  onEditRevolveFace,
  onEditRevolveAxis,
  edgeTreatmentDraft,
  onEdgeTreatmentDraftChange,
  onAcceptEdgeTreatment,
  onCancelEdgeTreatment,
  faceExtrudeDraft,
  onFaceExtrudeDraftChange,
  onAcceptFaceExtrude,
  onCancelFaceExtrude,
  shellDraft,
  onShellDraftChange,
  onAcceptShell,
  onCancelShell,
  revolveDraft,
  onRevolveDraftChange,
  onAcceptRevolve,
  onCancelRevolve,
  onUpdateObject,
  onUpdateFeature,
}: Props) {
  const objects = parametricObjectTree(document);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const objectListRef = useRef<HTMLDivElement>(null);
  const rangeAnchorRef = useRef<ModelTreeSelection | null>(null);
  const primarySelection = selection.at(-1) ?? null;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      objectListRef.current?.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [document.objects, selectedId, selectionKind, selection.length]);

  const visibleNodes: ModelTreeSelection[] = objects.flatMap((object) => [
    { id: object.id, kind: "object" as const },
    ...(object.object.expanded ? object.operations.map((feature) => ({ id: feature.id, kind: "feature" as const })) : []),
  ]);
  const selectNode = (node: ModelTreeSelection, event: MouseEvent) => {
    onSelectionChange(updateParametricTreeSelection(selection, node, visibleNodes, rangeAnchorRef.current ?? primarySelection, { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
    if (!event.shiftKey) rangeAnchorRef.current = node;
  };

  const selectedFeature = selection.length === 1 && selectionKind === "feature"
    ? document.features.find((feature) => feature.id === selectedId) ?? null
    : null;
  const selectedObject = selection.length === 1 && selectionKind === "object"
    ? document.objects.find((object) => object.id === selectedId) ?? null
    : null;

  const beginRename = () => {
    if (selection.length === 0) return;
    const names = selection.flatMap((item) => {
      const entry = item.kind === "object"
        ? document.objects.find((object) => object.id === item.id)
        : document.features.find((feature) => feature.id === item.id);
      return entry ? [entry.name] : [];
    });
    setRenameDraft(names.length > 0 && names.every((name) => name === names[0]) ? names[0] : "");
    setRenameOpen(true);
  };

  const closeRename = () => {
    setRenameOpen(false);
    setRenameDraft("");
  };

  const commitRename = () => {
    if (!renameOpen) return;
    const name = renameDraft.trim();
    if (!name) return;
    onRenameSelection(name);
    closeRename();
  };

  return (
    <NumericStepContext.Provider value={{ input: Math.max(0.0001, gridStep / 2), slider: Math.max(0.0001, gridStep / 10) }}><>
    <aside className={`educad-model-sidebar ${mode}`} aria-label="Modelo paramétrico">
        <section className="educad-model-tree">
          <div ref={objectListRef} className="educad-object-list">
            {objects.map((object) => {
              const isExpanded = object.object.expanded;
              const objectSelected = selection.some((candidate) => candidate.kind === "object" && candidate.id === object.id);
              return (
                <div className="educad-object-node" key={object.id}>
                  <div className={`educad-object-row ${objectSelected ? "selected" : ""} ${object.object.visible ? "" : "hidden"} ${object.object.locked ? "locked" : ""}`} style={{ "--object-color": object.object.color } as CSSProperties}>
                    <button
                      className="educad-tree-toggle"
                      aria-label={isExpanded ? `Contraer ${object.name}` : `Desplegar ${object.name}`}
                      aria-expanded={isExpanded}
                      onClick={() => onUpdateObject(object.id, (draft) => { draft.expanded = !draft.expanded; })}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <button className="educad-object-select" title={object.name} onClick={(event) => selectNode({ id: object.id, kind: "object" }, event)}>
                      {object.object.referenceMesh ? <FileBox size={17} /> : <Box size={17} />}
                      <span><strong>{object.name}</strong></span>
                    </button>
                    <div className="educad-tree-actions">
                      <button aria-label={object.object.visible ? `Ocultar ${object.name}` : `Mostrar ${object.name}`} title={object.object.visible ? "Ocultar" : "Mostrar"} aria-pressed={!object.object.visible} onClick={() => onUpdateObject(object.id, (draft) => { draft.visible = !draft.visible; })}>{object.object.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                      <button aria-label={object.object.locked ? `Desbloquear ${object.name}` : `Bloquear ${object.name}`} title={object.object.locked ? "Desbloquear" : "Bloquear"} aria-pressed={object.object.locked} onClick={() => onUpdateObject(object.id, (draft) => { draft.locked = !draft.locked; })}>{object.object.locked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}</button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="educad-operation-list" role="group" aria-label={`Operaciones de ${object.name}`}>
                      {object.operations.map((feature) => (
                        <div key={feature.id} className={`educad-operation-row ${selection.some((candidate) => candidate.kind === "feature" && candidate.id === feature.id) ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""} ${feature.kind === "sketch" && !feature.visible ? "hidden" : ""} ${operationClass(feature)}`}>
                          <button className="educad-operation-select" title={feature.name} onClick={(event) => selectNode({ id: feature.id, kind: "feature" }, event)}>
                            <span className="educad-tree-branch" aria-hidden="true" />
                            <FeatureIcon document={document} feature={feature} />
                            <span className="educad-operation-name"><strong>{feature.name}</strong></span>
                          </button>
                          <div className="educad-tree-actions">
                            {feature.kind === "sketch" ? <button aria-label={feature.visible ? `Ocultar ${feature.name}` : `Mostrar ${feature.name}`} title={feature.visible ? "Ocultar boceto" : "Mostrar boceto"} aria-pressed={!feature.visible} onClick={() => onUpdateFeature(feature.id, (draft) => { if (draft.kind === "sketch") draft.visible = !draft.visible; })}>{feature.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button> : null}
                            <button aria-label={feature.suppressed ? `Activar ${feature.name}` : `Suprimir ${feature.name}`} title={feature.suppressed ? "Activar" : "Suprimir"} aria-pressed={feature.suppressed} onClick={() => onUpdateFeature(feature.id, (draft) => { draft.suppressed = !draft.suppressed; })}><CircleOff size={15} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

      {mode === "normal" ? <div className="educad-tree-toolbar" role="toolbar" aria-label="Acciones de la jerarquía">
        <button disabled={!canReorderParametricSelection(document, selection, "up")} aria-label="Subir selección" title="Subir en la jerarquía" onClick={() => onReorderSelection("up")}><ArrowUp size={16} /></button>
        <button disabled={!canReorderParametricSelection(document, selection, "down")} aria-label="Bajar selección" title="Bajar en la jerarquía" onClick={() => onReorderSelection("down")}><ArrowDown size={16} /></button>
        <span className="educad-tree-toolbar-separator" aria-hidden="true" />
        <button disabled={selection.length === 0} aria-label="Editar nombre" title={selection.length > 1 ? "Renombrar todos los elementos seleccionados" : "Renombrar selección"} onClick={beginRename}><Pencil size={15} /></button>
        <button className="educad-origin-tree-button" disabled={!selectedObject || selectedObject.locked} aria-label={editingOriginObjectId === selectedObject?.id ? "Finalizar edición del origen" : "Editar origen"} title={editingOriginObjectId === selectedObject?.id ? "Finalizar edición del origen" : "Editar origen"} aria-pressed={Boolean(selectedObject && editingOriginObjectId === selectedObject.id)} onClick={() => selectedObject && onToggleOriginEdit(selectedObject.id)}><Crosshair size={16} /></button>
        <span className="educad-tree-toolbar-separator" aria-hidden="true" />
        <button className="danger" disabled={selection.length === 0} aria-label="Eliminar selección" title={selection.length > 1 ? `Eliminar ${selection.length} elementos` : selectionKind === "feature" ? "Eliminar operación" : "Eliminar objeto"} onClick={onDeleteSelection}><Trash2 size={16} /></button>
      </div> : null}

      {mode === "normal" ? <section className="educad-sidebar-editor">
        {revolveDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label="Revolución temporal">
            <div className="educad-feature-card"><h3>{revolveDraft.editing ? "Editar revolución" : "Nueva revolución"}</h3><label><span>Tipo</span><select value={revolveDraft.operation} onChange={(event) => onRevolveDraftChange({ operation: event.target.value as typeof revolveDraft.operation })}><option value="add">Añadir</option><option value="cut">Hueco</option><option value="intersect">Común</option></select></label><label><span>Eje</span><select value={revolveDraft.axis} onChange={(event) => onRevolveDraftChange({ axis: event.target.value as typeof revolveDraft.axis })}><option value="x">X local</option><option value="y">Y local</option><option value="z">Z local</option><option value="edge" disabled={revolveDraft.edgeCount !== 1}>Arista seleccionada</option></select></label><BoundedNumberField label="Ángulo" value={revolveDraft.angle} min={-360} max={360} step={1} unit="°" onChange={(angle) => onRevolveDraftChange({ angle: Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle })} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelRevolve}>Cancelar</button><button type="button" className="primary" disabled={revolveDraft.faceCount !== 1 || (revolveDraft.axis === "edge" && revolveDraft.edgeCount !== 1)} onClick={onAcceptRevolve}>Aceptar</button></div><p className="educad-topology-selection-count">cara / eje: {revolveDraft.faceCount} / {revolveDraft.edgeCount}</p>
          </div>
        ) : shellDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label="Vaciado temporal">
            <div className="educad-feature-card"><h3>{shellDraft.editing ? "Editar vaciado" : "Nuevo vaciado"}</h3><BoundedNumberField label="Espesor" value={shellDraft.thickness} min={0.01} max={50} onChange={onShellDraftChange} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelShell}>Cancelar</button><button type="button" className="primary" disabled={shellDraft.faceCount === 0} onClick={onAcceptShell}>Aceptar</button></div>
            <p className="educad-topology-selection-count">caras abiertas: {shellDraft.faceCount}</p>
          </div>
        ) : faceExtrudeDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label="Extrusión temporal de cara">
            <div className="educad-feature-card"><h3>{faceExtrudeDraft.editing ? "Editar operación" : "Nueva operación"}</h3><label><span>Tipo</span><select value={faceExtrudeDraft.operation} onChange={(event) => onFaceExtrudeDraftChange({ operation: event.target.value as "add" | "cut" })}><option value="add">Añadir</option><option value="cut">Hueco</option></select></label><BoundedNumberField label="Longitud" value={faceExtrudeDraft.distance} min={0.01} max={200} onChange={(distance) => onFaceExtrudeDraftChange({ distance })} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelFaceExtrude}>Cancelar</button><button type="button" className="primary" disabled={faceExtrudeDraft.faceCount !== 1} onClick={onAcceptFaceExtrude}>Aceptar</button></div>
          </div>
        ) : edgeTreatmentDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label="Selección temporal de caras y aristas">
            <div className="educad-feature-card"><h3>{edgeTreatmentDraft.editing ? "Editar operación" : "Nueva operación"}</h3><label><span>Tipo</span><select value={edgeTreatmentDraft.treatment} onChange={(event) => onEdgeTreatmentDraftChange({ treatment: event.target.value as "fillet" | "chamfer" })}><option value="fillet">Redondeo</option><option value="chamfer">Chaflán</option></select></label><BoundedNumberField label={edgeTreatmentDraft.treatment === "chamfer" ? "Distancia" : "Radio"} value={edgeTreatmentDraft.radius} min={0.01} max={50} onChange={(radius) => onEdgeTreatmentDraftChange({ radius })} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelEdgeTreatment}>Cancelar</button><button type="button" className="primary" disabled={edgeTreatmentDraft.faceCount + edgeTreatmentDraft.edgeCount === 0} onClick={onAcceptEdgeTreatment}>Aceptar</button></div>
            <p className="educad-topology-selection-count">caras / aristas: {edgeTreatmentDraft.faceCount} / {edgeTreatmentDraft.edgeCount}</p>
          </div>
        ) : selection.length > 1 ? (
          <div className="educad-no-selection educad-multi-selection"><Layers3 size={28} /><strong>{selection.length} elementos seleccionados</strong><span>{selection.filter((item) => item.kind === "object").length} objetos · {selection.filter((item) => item.kind === "feature").length} operaciones</span><small>Usa Ctrl/Cmd para alternar elementos o Shift para seleccionar un rango.</small></div>
        ) : selectedObject ? (
          <ParametricObjectInspector object={selectedObject} onUpdate={(update) => onUpdateObject(selectedObject.id, update)} />
        ) : selectedFeature ? (
          <ParametricFeatureInspector
            document={document}
            feature={selectedFeature}
            onUpdateFeature={onUpdateFeature}
          onEditSelection={onEditFeatureSelection}
          onEditSketch={onEditSketch}
            onEditFaceExtrudeSelection={onEditFaceExtrudeSelection}
            onEditShellSelection={onEditShellSelection}
            onEditRevolveFace={onEditRevolveFace}
            onEditRevolveAxis={onEditRevolveAxis}
          />
        ) : (
          <div className="educad-no-selection"><Layers3 size={28} /><strong>Selecciona un objeto u operación</strong></div>
        )}
      </section> : null}
    </aside>
    {renameOpen ? (
      <div className="educad-dialog-backdrop" role="presentation" onPointerDown={closeRename}>
        <form className="educad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-rename-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
          <header><strong id="educad-rename-title">{selection.length > 1 ? `Renombrar ${selection.length} elementos` : "Renombrar selección"}</strong><button type="button" aria-label="Cancelar" onClick={closeRename}><X size={18} /></button></header>
          <label><span>{selection.length > 1 ? "Nombre común" : "Nombre"}</span><input autoFocus value={renameDraft} maxLength={80} placeholder={selection.length > 1 ? "Aplicar el mismo nombre a todos" : undefined} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") closeRename(); }} /></label>
          <footer><button type="button" onClick={closeRename}>Cancelar</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>OK</button></footer>
        </form>
      </div>
    ) : null}
    </></NumericStepContext.Provider>
  );
}

function FeatureIcon({ document, feature }: { document: ParametricDocument; feature: ParametricFeature }) {
  if (feature.kind === "sketch") return <DraftingCompass className="sketch" size={16} />;
  if (feature.kind === "extrude") {
    const sketch = sketchForExtrude(document, feature);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    const label = feature.operation === "cut" ? "Hueco" : feature.operation === "intersect" ? "Común" : "Añadir";
    const generatedText = sketch?.profile.shape === "drawn" && sketch.profile.geometry.generator?.kind === "text";
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${generatedText ? "Texto" : sketch?.profile.shape === "circle" ? "Cilindro" : "Caja"}: ${label}`}>{generatedText ? <Type size={17} /> : sketch?.profile.shape === "circle" ? <CircleDot size={17} /> : <Box size={17} />}<small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "primitive") {
    const definition = parametricOperationDefinition(feature.primitive);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${definition.name}: ${definition.roles[feature.operation].label}`}><Circle size={17} /><small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "importedStep") return <FileBox className="imported-step" size={16} />;
  if (feature.kind === "hole") return <CircleDot className="drill-hole" size={16} />;
  if (feature.kind === "faceExtrude") return <span className={`educad-operation-icon ${feature.operation === "cut" ? "hole" : "add"}`} role="img" aria-label={feature.operation === "cut" ? "Hueco desde cara" : "Extrusión desde cara"}><Box size={17} /><small aria-hidden="true">{feature.operation === "cut" ? "−" : "+"}</small></span>;
  if (feature.kind === "shell") return <img className="educad-operation-asset-icon" src="/assets/educad/operations/shell.svg" alt="Vaciado" />;
  if (feature.kind === "revolve") return <img className="educad-operation-asset-icon" src="/assets/educad/operations/revolve.svg" alt="Revolución" />;
  if (feature.kind === "mirror") return <FlipHorizontal2 className="mirror" size={16} />;
  if (feature.kind === "linearPattern") return <Rows3 className="linear-pattern" size={16} />;
  if (feature.kind === "polarPattern") return <RotateCw className="polar-pattern" size={16} />;
  if (feature.kind === "objectBoolean") return <Combine className="object-boolean" size={16} />;
  return feature.treatment === "chamfer" ? <Triangle className="chamfer" size={16} /> : <Radius className="fillet" size={16} />;
}

function operationClass(feature: ParametricFeature) {
  if (feature.kind !== "extrude" && feature.kind !== "primitive") return `operation-${feature.kind}`;
  return `operation-${feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add"}`;
}

function ParametricObjectInspector({
  object,
  onUpdate,
}: {
  object: ParametricObject;
  onUpdate: (update: (object: ParametricObject) => void) => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colorOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !colorPanelRef.current?.contains(event.target)) setColorOpen(false);
    };
    window.document.addEventListener("pointerdown", closeOutside);
    return () => window.document.removeEventListener("pointerdown", closeOutside);
  }, [colorOpen]);
  return (
    <div className="educad-feature-inspector educad-object-inspector">
      {object.referenceMesh ? <div className="educad-feature-card"><h3>Referencia</h3><ReadOnlyField label="Archivo" value={object.referenceMesh.sourceName} /><ReadOnlyField label="Formato" value={object.referenceMesh.format.toUpperCase()} /><label><span>Opacidad</span><input type="range" min={0.05} max={1} step={0.05} value={object.referenceMesh.opacity} onChange={(event) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.opacity = Number(event.target.value); })} /></label><label><span>Visualización</span><select value={object.referenceMesh.displayMode} onChange={(event) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.displayMode = event.target.value as typeof draft.referenceMesh.displayMode; })}><option value="solidEdges">Sólido y aristas</option><option value="solid">Sólido</option><option value="wireframe">Alámbrico</option></select></label><label><span>Seleccionable</span><input type="checkbox" checked={object.referenceMesh.pickable} onChange={(event) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.pickable = event.target.checked; })} /></label></div> : null}
      <TransformSection>
        <TransformGroup label="Posición" values={object.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.position[axis] = value; })} />
        <TransformGroup label="Rotación" values={object.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.rotation[axis] = value; })} />
        <TransformGroup label="Escala" values={object.transform.scale} unit="×" min={0.01} onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.scale[axis] = Math.max(0.01, value); })} />
      </TransformSection>
      <div ref={colorPanelRef} className="educad-feature-card educad-object-appearance">
        <button className="educad-color-trigger" aria-expanded={colorOpen} onClick={() => setColorOpen((value) => !value)}>
          <span>Color</span><span className="educad-color-preview" style={{ "--object-color": object.color } as CSSProperties} /><strong>{object.color.toUpperCase()}</strong><ChevronDown size={15} />
        </button>
        {colorOpen ? <div className="educad-color-palette" role="group" aria-label="Color del objeto">
          {OBJECT_COLOR_PALETTE.map((color) => <button key={color} className={object.color.toLowerCase() === color ? "selected" : ""} aria-label={`Color ${color}`} title={color.toUpperCase()} style={{ "--object-color": color } as CSSProperties} onClick={() => { onUpdate((draft) => { draft.color = color; }); setColorOpen(false); }} />)}
          <label className="educad-custom-color" title="Color personalizado"><input type="color" value={object.color} onChange={(event) => onUpdate((draft) => { draft.color = event.target.value; })} /><span>+</span></label>
        </div> : null}
      </div>
    </div>
  );
}

function TransformSection({ children, description = "Posición · rotación · escala" }: { children: ReactNode; description?: string }) {
  return (
    <details className="educad-transform-section">
      <summary><ChevronRight size={16} /><span>Transformación</span><small>{description}</small></summary>
      <div>{children}</div>
    </details>
  );
}

function TransformGroup({
  label,
  values,
  unit,
  min,
  onUpdate,
}: {
  label: string;
  values: { x: number; y: number; z: number };
  unit: string;
  min?: number;
  onUpdate: (axis: "x" | "y" | "z", value: number) => void;
}) {
  const { input: inputStep } = useContext(NumericStepContext);
  return (
    <div className="educad-feature-card educad-transform-card">
      <h3>{label}</h3>
      {(["x", "y", "z"] as const).map((axis) => (
        <label key={axis}>
          <span className={`educad-axis-label ${axis}`}>{axis.toUpperCase()}</span>
          <DeferredNumberInput value={values[axis]} min={min} step={inputStep} unit={unit} onCommit={(value) => onUpdate(axis, value)} />
        </label>
      ))}
    </div>
  );
}

function ParametricFeatureInspector({
  document,
  feature,
  onUpdateFeature,
  onEditSelection,
  onEditSketch,
  onEditFaceExtrudeSelection,
  onEditShellSelection,
  onEditRevolveFace,
  onEditRevolveAxis,
}: {
  document: ParametricDocument;
  feature: ParametricFeature;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
  onEditSelection: (featureId: string) => void;
  onEditSketch: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
  onEditShellSelection: (featureId: string) => void;
  onEditRevolveFace: (featureId: string) => void;
  onEditRevolveAxis: (featureId: string) => void;
}) {
  const onUpdate = (update: (feature: ParametricFeature) => void) => onUpdateFeature(feature.id, update);
  const primitiveSketch = feature.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  const textGenerator = primitiveSketch?.profile.shape === "drawn" && primitiveSketch.profile.geometry.generator?.kind === "text" ? primitiveSketch.profile.geometry.generator : null;
  const scribbleGenerator = primitiveSketch?.profile.shape === "drawn" && primitiveSketch.profile.geometry.generator?.kind === "scribble" ? primitiveSketch.profile.geometry.generator : null;
  const revolveSketch = feature.kind === "revolve" && feature.source === "sketch" ? document.features.find((candidate): candidate is Extract<ParametricFeature, { kind: "sketch" }> => candidate.kind === "sketch" && candidate.id === feature.sketchId) ?? null : null;
  const linearPatternSources = feature.kind === "linearPattern"
    ? document.features.slice(0, document.features.findIndex((candidate) => candidate.id === feature.id)).filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch")
    : [];
  const polarPatternSources = feature.kind === "polarPattern"
    ? document.features.slice(0, document.features.findIndex((candidate) => candidate.id === feature.id)).filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch")
    : [];
  const treatmentReferences = feature.kind === "fillet"
    ? (feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? []).map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter(Boolean)
    : [];
  const treatmentFaceCount = treatmentReferences.filter((reference) => reference?.reference.hint.entityType === "face").length;
  const treatmentEdgeCount = treatmentReferences.filter((reference) => reference?.reference.hint.entityType === "edge").length;
  return (
    <div className="educad-feature-inspector" aria-label={`Propiedades de ${feature.name}`}>

      {feature.kind === "sketch" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><ReadOnlyField label="Tipo" value="Boceto" /></div>
          {feature.profile.shape === "drawn" ? <>
            <button className="educad-edit-topology-selection" type="button" onClick={() => onEditSketch(feature.id)}>Editar boceto</button>
          </> : <div className="educad-feature-card">
            <h3>Parámetros de la forma</h3>
            <ReadOnlyField label="Perfil" value={feature.profile.shape === "rectangle" ? "Rectángulo" : "Círculo"} />
            {feature.profile.shape === "rectangle" ? <><NumberField label="Anchura" value={feature.profile.width} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><NumberField label="Profundidad" value={feature.profile.depth} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <NumberField label="Diámetro" value={feature.profile.diameter} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />}
          </div>}
          <TransformSection>
            <TransformGroup label="Posición" values={{ x: feature.x, y: feature.y, z: feature.offset }} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind !== "sketch") return; if (axis === "x") draft.x = value; else if (axis === "y") draft.y = value; else draft.offset = value; })} />
            <TransformGroup label="Rotación" values={feature.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "extrude" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "extrude") draft.operation = operation; })} />
          </div>
          <div className="educad-feature-card">
            <h3>Parámetros de la forma</h3>
            {textGenerator && primitiveSketch ? <>
              <label><span>Texto</span><DeferredTextInput value={textGenerator.text} maxLength={40} onCommit={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { text: value }); })} /></label>
              <label><span>Fuente web</span><select value={textGenerator.font ?? "Sans"} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { font: event.target.value as typeof textGenerator.font }); })}>{parametricTextFontNames.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              <BoundedNumberField label="Tamaño" value={textGenerator.size} min={1} max={200} unit="mm" onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { size: value }); })} />
              <BoundedNumberField label="Espaciado" value={textGenerator.spacing} min={0} max={100} unit="mm" onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { spacing: value }); })} />
              <label><span>Alineación</span><select value={textGenerator.align} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { align: event.target.value as typeof textGenerator.align }); })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>
              <label><span>Alineación vertical</span><select value={textGenerator.verticalAlign ?? "center"} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { verticalAlign: event.target.value as typeof textGenerator.verticalAlign }); })}><option value="bottom">Inferior</option><option value="center">Centro</option><option value="top">Superior</option></select></label>
            </> : scribbleGenerator && primitiveSketch ? <button className="educad-edit-topology-selection" type="button" onClick={() => onEditSketch(primitiveSketch.id)}>Editar dibujo libre</button> : primitiveSketch?.profile.shape === "rectangle" ? (
              <>
                <BoundedNumberField label="Anchura" value={primitiveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} />
                <BoundedNumberField label="Profundidad" value={primitiveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} />
              </>
            ) : primitiveSketch?.profile.shape === "circle" ? (
              <BoundedNumberField label="Radio" value={primitiveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value * 2); })} />
            ) : null}
            <BoundedNumberField label="Altura" value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.distance = Math.max(0.01, value); })} />
          </div>
          <TransformSection description="Posición · rotación">
            <TransformGroup label="Posición" values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.position[axis] = value; })} />
            <TransformGroup label="Rotación" values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "primitive" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "primitive") draft.operation = operation; })} />
          </div>
          <div className="educad-feature-card">
            <h3>Parámetros de la forma</h3>
            {parametricOperationDefinition(feature.primitive).parameters.map((parameter) => (
              <BoundedNumberField
                key={parameter.key}
                label={parameter.label}
                value={parameter.key === "radius" || parameter.key === "baseRadius" || parameter.key === "outerRadius"
                  ? feature.width / 2
                  : parameter.key === "majorRadius"
                    ? feature.majorRadius ?? 12
                  : parameter.key === "tubeRadius"
                      ? feature.tubeRadius ?? 4
                    : parameter.key === "cornerRadius"
                      ? feature.cornerRadius ?? 3
                    : parameter.key === "sides"
                      ? feature.sides ?? 6
                    : parameter.key === "teeth"
                      ? feature.teeth ?? 12
                    : parameter.key === "toothDepth"
                      ? feature.toothDepth ?? 2.5
                    : parameter.key === "boreRadius"
                      ? feature.boreRadius ?? 3
                  : parameter.key === "topRadius"
                    ? feature.topRadius ?? 0
                    : parameter.key === "innerRadius"
                      ? feature.innerRadius ?? 6
                    : feature[parameter.key as "width" | "depth" | "height"]}
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                unit={parameter.unit}
                onChange={(value) => onUpdate((draft) => {
                  if (draft.kind !== "primitive") return;
                  if (parameter.key === "radius") {
                    draft.width = value * 2;
                    draft.depth = value * 2;
                    if (draft.primitive === "sphere") draft.height = value * 2;
                  } else if (parameter.key === "baseRadius") {
                    draft.width = value * 2;
                    draft.depth = value * 2;
                  } else if (parameter.key === "topRadius") {
                    draft.topRadius = Math.max(0, value);
                  } else if (parameter.key === "outerRadius") {
                    const radius = draft.primitive === "gear"
                      ? Math.max((draft.toothDepth ?? 2.5) + (draft.boreRadius ?? 3) + 0.1, value)
                      : Math.max((draft.innerRadius ?? 0) + 0.1, value);
                    draft.width = radius * 2;
                    draft.depth = radius * 2;
                  } else if (parameter.key === "innerRadius") {
                    draft.innerRadius = Math.min(draft.width / 2 - 0.1, Math.max(0.1, value));
                  } else if (parameter.key === "majorRadius") {
                    draft.majorRadius = Math.max((draft.tubeRadius ?? 4) + 0.1, value);
                    draft.width = (draft.majorRadius + (draft.tubeRadius ?? 4)) * 2;
                    draft.depth = draft.width;
                  } else if (parameter.key === "tubeRadius") {
                    draft.tubeRadius = Math.min((draft.majorRadius ?? 12) - 0.1, Math.max(0.1, value));
                    draft.width = ((draft.majorRadius ?? 12) + draft.tubeRadius) * 2;
                    draft.depth = draft.width;
                    draft.height = draft.tubeRadius * 2;
                  } else if (parameter.key === "cornerRadius") {
                    draft.cornerRadius = Math.min(draft.width / 2 - 0.1, draft.depth / 2 - 0.1, Math.max(0.1, value));
                  } else if ((parameter.key === "width" || parameter.key === "depth") && draft.primitive === "roundedBox") {
                    draft[parameter.key] = Math.max(parameter.min, value);
                    draft.cornerRadius = Math.min(draft.cornerRadius ?? 3, draft.width / 2 - 0.1, draft.depth / 2 - 0.1);
                  } else if (parameter.key === "sides") {
                    draft.sides = Math.min(32, Math.max(3, Math.round(value)));
                  } else if (parameter.key === "teeth") {
                    draft.teeth = Math.min(64, Math.max(6, Math.round(value)));
                  } else if (parameter.key === "toothDepth") {
                    draft.toothDepth = Math.min(draft.width / 2 - 0.2, Math.max(0.2, value));
                  } else if (parameter.key === "boreRadius") {
                    draft.boreRadius = Math.max(0, Math.min(draft.width / 2 - (draft.toothDepth ?? 2.5) - 0.1, Math.max(0, value)));
                  } else if (parameter.key !== "diameter") draft[parameter.key] = Math.max(parameter.min, value);
                })}
              />
            ))}
          </div>
          <TransformSection description="Posición · rotación">
            <TransformGroup label="Posición" values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.transform.position[axis] = value; })} />
            <TransformGroup label="Rotación" values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "importedStep" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><ReadOnlyField label="Tipo" value="STEP importado" /><ReadOnlyField label="Archivo" value={feature.sourceName} /><ReadOnlyField label="Geometría" value="B-Rep exacto" /></div>
          <TransformSection description="Transformación del objeto contenedor"><p className="educad-transform-empty">Esta es la geometría base. Las operaciones posteriores permanecen editables en el historial.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "hole" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><ReadOnlyField label="Tipo" value="Taladro" /><label><span>Final</span><select value={feature.termination} onChange={(event) => onUpdate((draft) => { if (draft.kind === "hole") draft.termination = event.target.value as typeof draft.termination; })}><option value="through-all">Pasante</option><option value="blind">Ciego</option></select></label></div>
          <div className="educad-feature-card"><h3>Parámetros de la forma</h3><BoundedNumberField label="Diámetro" value={feature.diameter} min={0.01} max={100} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.diameter = Math.max(0.01, value); })} />{feature.termination === "blind" ? <BoundedNumberField label="Profundidad" value={feature.depth} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.depth = Math.max(0.01, value); })} /> : null}</div>
          <TransformSection description="Posición">
            <div className="educad-feature-card educad-transform-card"><h3>Posición</h3><NumberField label="X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.x = value; })} /><NumberField label="Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.y = value; })} /></div>
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "fillet" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><label><span>Tipo</span><select value={feature.treatment} onChange={(event) => onUpdate((draft) => { if (draft.kind === "fillet") draft.treatment = event.target.value as typeof draft.treatment; })}><option value="fillet">Redondeo</option><option value="chamfer">Chaflán</option></select></label><BoundedNumberField label={feature.treatment === "chamfer" ? "Distancia" : "Radio"} value={feature.radius} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "fillet") draft.radius = Math.max(0.01, value); })} />{!(feature.selectionReferenceIds?.length ?? feature.edgeReferenceIds?.length) ? <label><span>Aristas</span><select value={feature.edges} onChange={(event) => onUpdate((draft) => { if (draft.kind === "fillet") draft.edges = event.target.value as typeof draft.edges; })}><option value="vertical">Verticales</option><option value="all">Todas</option></select></label> : null}</div>
          {(feature.selectionReferenceIds?.length ?? feature.edgeReferenceIds?.length) ? <><button className="educad-edit-topology-selection" type="button" onClick={() => onEditSelection(feature.id)}>Editar caras y aristas</button><div className="educad-feature-card educad-topology-selection-summary"><ReadOnlyField label="Caras seleccionadas" value={String(treatmentFaceCount)} /><ReadOnlyField label="Aristas seleccionadas" value={String(treatmentEdgeCount)} /></div></> : null}
          <TransformSection description="Sin transformación propia"><p className="educad-transform-empty">Esta operación actúa sobre el resultado anterior del objeto.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "faceExtrude" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><OperationModeButtons value={feature.operation} includeCommon={false} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "faceExtrude" && operation !== "intersect") draft.operation = operation; })} /><BoundedNumberField label="Longitud" value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "faceExtrude") draft.distance = Math.max(0.01, value); })} /></div>
          <button className="educad-edit-topology-selection" type="button" onClick={() => onEditFaceExtrudeSelection(feature.id)}>Editar cara</button>
          <TransformSection description="Dirección normal a la cara"><p className="educad-transform-empty">La longitud se aplica perpendicularmente a la cara seleccionada.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "shell" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><ReadOnlyField label="Tipo" value="Vaciado" /><BoundedNumberField label="Espesor" value={feature.thickness} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "shell") draft.thickness = Math.max(0.01, value); })} /></div>
          <button className="educad-edit-topology-selection" type="button" onClick={() => onEditShellSelection(feature.id)}>Editar caras abiertas</button>
          <TransformSection description="Sin transformación propia"><p className="educad-transform-empty">El vaciado desplaza las paredes hacia el interior y elimina las caras seleccionadas.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "revolve" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "revolve") draft.operation = operation; })} /><label><span>Eje</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "revolve") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">X local</option><option value="y">Y local</option><option value="z">Z local</option>{feature.axis === "edge" ? <option value="edge">Arista seleccionada</option> : null}</select></label><BoundedNumberField label="Ángulo" value={feature.angle} min={-360} max={360} step={1} unit="°" onChange={(value) => onUpdate((draft) => { if (draft.kind === "revolve") draft.angle = Math.abs(value) < 1 ? (value < 0 ? -1 : 1) : Math.min(360, Math.max(-360, value)); })} /></div>
          {revolveSketch && revolveSketch.profile.shape !== "drawn" ? <div className="educad-feature-card"><h3>Perfil de boceto</h3><ReadOnlyField label="Forma" value={revolveSketch.profile.shape === "rectangle" ? "Rectángulo" : "Círculo"} />{revolveSketch.profile.shape === "rectangle" ? <><BoundedNumberField label="Anchura" value={revolveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><BoundedNumberField label="Profundidad" value={revolveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <BoundedNumberField label="Radio" value={revolveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value * 2); })} />}</div> : null}
          {feature.source === "face" ? <div className="educad-topology-selection-actions"><button className="educad-edit-topology-selection" type="button" onClick={() => onEditRevolveFace(feature.id)}>Editar cara</button><button className="educad-edit-topology-selection" type="button" onClick={() => onEditRevolveAxis(feature.id)}>Editar eje</button></div> : <button className="educad-edit-topology-selection" type="button" onClick={() => onEditRevolveAxis(feature.id)}>Editar eje</button>}
          <TransformSection description="Eje local del objeto"><p className="educad-transform-empty">La cara gira alrededor del eje local seleccionado que pasa por el origen del objeto.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "mirror" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <label><span>Plano</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "mirror") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">YZ (eje X)</option><option value="y">XZ (eje Y)</option><option value="z">XY (eje Z)</option></select></label>
            <label><span>Resultado</span><select value={feature.duplicate ? "duplicate" : "transform"} onChange={(event) => onUpdate((draft) => { if (draft.kind === "mirror") draft.duplicate = event.target.value === "duplicate"; })}><option value="duplicate">Duplicar</option><option value="transform">Sólo transformar</option></select></label>
          </div>
          <TransformSection description="Plano local del objeto"><p className="educad-transform-empty">El resultado anterior se refleja respecto al plano local que pasa por el origen.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "linearPattern" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <label><span>Origen</span><select value={feature.source === "feature" ? feature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onUpdate((draft) => {
              if (draft.kind !== "linearPattern") return;
              if (event.target.value === "body") {
                draft.source = "body";
                draft.sourceFeatureId = undefined;
                draft.dependencies = undefined;
              } else {
                draft.source = "feature";
                draft.sourceFeatureId = event.target.value;
                draft.dependencies = [{ type: "feature", id: event.target.value }];
              }
            })}><option value="body">Cuerpo completo</option>{linearPatternSources.map((source) => <option key={source.id} value={source.id}>Operación · {source.name}</option>)}</select></label>
            <label><span>Eje</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">X local</option><option value="y">Y local</option><option value="z">Z local</option></select></label>
          </div>
          <div className="educad-feature-card">
            <h3>Parámetros</h3>
            <BoundedNumberField label="Cantidad" value={feature.count} min={2} max={50} step={1} onChange={(value) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.count = Math.min(50, Math.max(2, Math.round(value))); })} />
            <BoundedNumberField label="Separación" value={feature.spacing} min={-1000} max={1000} unit="mm" onChange={(value) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.spacing = Math.abs(value) < 0.01 ? (value < 0 ? -0.01 : 0.01) : value; })} />
          </div>
          <TransformSection description="Dirección local del objeto"><p className="educad-transform-empty">La cantidad incluye el original. Puede repetirse el cuerpo acumulado o la contribución de una operación anterior.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "polarPattern" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <label><span>Origen</span><select value={feature.source === "feature" ? feature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onUpdate((draft) => {
              if (draft.kind !== "polarPattern") return;
              if (event.target.value === "body") {
                draft.source = "body";
                draft.sourceFeatureId = undefined;
                draft.dependencies = undefined;
              } else {
                draft.source = "feature";
                draft.sourceFeatureId = event.target.value;
                draft.dependencies = [{ type: "feature", id: event.target.value }];
              }
            })}><option value="body">Cuerpo completo</option>{polarPatternSources.map((source) => <option key={source.id} value={source.id}>Operación · {source.name}</option>)}</select></label>
            <label><span>Eje</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">X local</option><option value="y">Y local</option><option value="z">Z local</option></select></label>
            <label><span>Distribución uniforme</span><input type="checkbox" checked={feature.equalSpacing} onChange={(event) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.equalSpacing = event.target.checked; })} /></label>
          </div>
          <div className="educad-feature-card">
            <h3>Parámetros</h3>
            <BoundedNumberField label="Cantidad" value={feature.count} min={2} max={50} step={1} onChange={(value) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.count = Math.min(50, Math.max(2, Math.round(value))); })} />
            <BoundedNumberField label={feature.equalSpacing ? "Ángulo total" : "Paso angular"} value={feature.angle} min={-360} max={360} step={1} unit="°" onChange={(value) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.angle = Math.abs(value) < 0.1 ? (value < 0 ? -0.1 : 0.1) : value; })} />
          </div>
          <TransformSection description="Rotación alrededor del origen local"><p className="educad-transform-empty">La cantidad incluye el original. El signo del ángulo determina el sentido de giro.</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "objectBoolean" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "objectBoolean") draft.operation = operation; })} />
            <label><span>Objeto</span><select value={feature.sourceObjectId} onChange={(event) => onUpdate((draft) => { if (draft.kind !== "objectBoolean") return; draft.sourceObjectId = event.target.value; draft.dependencies = [{ type: "object", id: event.target.value }]; })}>{document.objects.filter((object) => object.id !== feature.objectId).map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
          </div>
          <TransformSection description="Referencia entre objetos"><p className="educad-transform-empty">La geometría se actualiza con el objeto de referencia. Puedes ocultarlo en el árbol sin romper esta operación.</p></TransformSection>
        </>
      ) : null}

    </div>
  );

  function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
    const { input: inputStep } = useContext(NumericStepContext);
    return <label><span>{label}</span><DeferredNumberInput value={value} min={min} step={inputStep} unit="mm" onCommit={onChange} /></label>;
  }
}

function OperationModeButtons({ value, includeCommon = true, onChange }: { value: "add" | "cut" | "intersect"; includeCommon?: boolean; onChange: (value: "add" | "cut" | "intersect") => void }) {
  const modes = includeCommon ? (["add", "cut", "intersect"] as const) : (["add", "cut"] as const);
  return <div className="educad-operation-mode-property">
    <span>Modo</span>
    <div className="educad-operation-mode-buttons">
      {modes.map((mode) => {
        const label = mode === "add" ? "Añadir" : mode === "cut" ? "Hueco" : "Común";
        return <button key={mode} type="button" className={`mode-${mode} ${value === mode ? "active" : ""}`} title={label} aria-label={label} aria-pressed={value === mode} onClick={() => onChange(mode)}><ToolbarBooleanModeIcon mode={mode === "cut" ? "hole" : mode === "intersect" ? "common" : "add"} /></button>;
      })}
    </div>
  </div>;
}

function DeferredTextInput({ value, maxLength, onCommit }: { value: string; maxLength: number; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [editing, value]);
  const commit = () => {
    const next = draft.trim() || value;
    setDraft(next);
    setEditing(false);
    if (next !== value) onCommit(next);
  };
  return <input value={draft} maxLength={maxLength} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); } }} />;
}

function DeferredNumberInput({ value, min, max, step, unit, onCommit }: { value: number; min?: number; max?: number; step: number; unit?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [editing, value]);
  const steppedValue = (direction: 1 | -1) => {
    const parsed = Number(draft.replace(",", "."));
    const base = Number.isFinite(parsed) ? parsed : value;
    const next = Math.round((base + direction * step) * 1e10) / 1e10;
    return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next));
  };
  const nudge = (direction: 1 | -1) => {
    setEditing(true);
    setDraft(String(steppedValue(direction)));
    inputRef.current?.focus();
  };
  const commit = () => {
    setEditing(false);
    const parsed = Number(draft.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    else if (event.key === "Escape") {
      setDraft(String(value));
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      nudge(event.key === "ArrowUp" ? 1 : -1);
    }
  };
  return <span className="educad-number-input" onWheel={(event) => { event.preventDefault(); nudge(event.deltaY < 0 ? 1 : -1); }}><input ref={inputRef} type="text" inputMode="decimal" value={draft} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={handleKeyDown} />{unit ? <small>{unit}</small> : null}<span className="educad-number-steppers"><button type="button" tabIndex={-1} aria-label="Aumentar valor" title="Aumentar" onPointerDown={(event) => { event.preventDefault(); nudge(1); }}>▲</button><button type="button" tabIndex={-1} aria-label="Disminuir valor" title="Disminuir" onPointerDown={(event) => { event.preventDefault(); nudge(-1); }}>▼</button></span></span>;
}

function BoundedNumberField({ label, value, min, max, unit = "mm", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const steps = useContext(NumericStepContext);
  const clampedValue = Math.min(max, Math.max(min, value));
  const [draft, setDraft] = useState(clampedValue);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setDraft(clampedValue);
  }, [clampedValue, dragging]);
  const percent = ((draft - min) / Math.max(Number.EPSILON, max - min)) * 100;
  const commit = () => {
    setDragging(false);
    const next = Math.min(max, Math.max(min, draft));
    setDraft(next);
    if (next !== value) onChange(next);
  };
  return (
    <label className="educad-range-property" style={{ "--slider-pos": `${percent}%` } as CSSProperties}>
      <span className="educad-range-header"><span>{label}</span><DeferredNumberInput value={draft} min={min} max={max} step={steps.input} unit={unit} onCommit={(next) => { setDraft(next); if (next !== value) onChange(next); }} /></span>
      <span className="educad-range-control"><input type="range" aria-label={label} value={draft} min={min} max={max} step={steps.slider} onPointerDown={() => setDragging(true)} onPointerUp={commit} onPointerCancel={commit} onChange={(event) => setDraft(Number(event.target.value))} onBlur={commit} /></span>
    </label>
  );
}

function ReadOnlyField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <label><span>{label}</span><output className={compact ? "compact" : ""}>{value}</output></label>;
}
