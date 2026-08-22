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
  Layers3,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  Radius,
  Triangle,
  Trash2,
  X,
} from "lucide-react";
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { canReorderParametricSelection, OBJECT_COLOR_PALETTE, parametricObjectTree, sketchForExtrude, updateParametricTreeSelection, type ParametricTreeSelection } from "@/lib/parametricObjects";
import { parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import type { ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";

export type ModelSelectionKind = "object" | "feature";
export type ModelSidebarMode = "normal" | "simplified";
export type ModelTreeSelection = ParametricTreeSelection;

type Props = {
  document: ParametricDocument;
  selection: ModelTreeSelection[];
  mode: ModelSidebarMode;
  editingOriginObjectId: string | null;
  onSelectionChange: (selection: ModelTreeSelection[]) => void;
  onReorderSelection: (direction: "up" | "down") => void;
  onRenameSelection: (name: string) => void;
  onDeleteSelection: () => void;
  onToggleOriginEdit: (objectId: string) => void;
  onEditFeatureSelection: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
  edgeTreatmentDraft: { treatment: "fillet" | "chamfer"; radius: number; faceCount: number; edgeCount: number; editing: boolean } | null;
  onEdgeTreatmentDraftChange: (update: Partial<{ treatment: "fillet" | "chamfer"; radius: number }>) => void;
  onAcceptEdgeTreatment: () => void;
  onCancelEdgeTreatment: () => void;
  faceExtrudeDraft: { operation: "add" | "cut"; distance: number; faceCount: number; editing: boolean } | null;
  onFaceExtrudeDraftChange: (update: Partial<{ operation: "add" | "cut"; distance: number }>) => void;
  onAcceptFaceExtrude: () => void;
  onCancelFaceExtrude: () => void;
  onUpdateObject: (id: string, update: (object: ParametricObject) => void) => void;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
};

export function ParametricModelSidebar({
  document,
  selection,
  mode,
  editingOriginObjectId,
  onSelectionChange,
  onReorderSelection,
  onRenameSelection,
  onDeleteSelection,
  onToggleOriginEdit,
  onEditFeatureSelection,
  onEditFaceExtrudeSelection,
  edgeTreatmentDraft,
  onEdgeTreatmentDraftChange,
  onAcceptEdgeTreatment,
  onCancelEdgeTreatment,
  faceExtrudeDraft,
  onFaceExtrudeDraftChange,
  onAcceptFaceExtrude,
  onCancelFaceExtrude,
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
    <>
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
                      <Box size={17} />
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
                        <div key={feature.id} className={`educad-operation-row ${selection.some((candidate) => candidate.kind === "feature" && candidate.id === feature.id) ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""} ${operationClass(feature)}`}>
                          <button className="educad-operation-select" title={feature.name} onClick={(event) => selectNode({ id: feature.id, kind: "feature" }, event)}>
                            <span className="educad-tree-branch" aria-hidden="true" />
                            <FeatureIcon document={document} feature={feature} />
                            <span className="educad-operation-name"><strong>{feature.name}</strong></span>
                          </button>
                          <div className="educad-tree-actions">
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
        {faceExtrudeDraft ? (
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
            onEditFaceExtrudeSelection={onEditFaceExtrudeSelection}
          />
        ) : (
          <div className="educad-no-selection"><Layers3 size={28} /><strong>Selecciona un objeto u operación</strong><span>Despliega el árbol para editar el historial CAD.</span></div>
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
    </>
  );
}

function FeatureIcon({ document, feature }: { document: ParametricDocument; feature: ParametricFeature }) {
  if (feature.kind === "sketch") return <DraftingCompass className="sketch" size={16} />;
  if (feature.kind === "extrude") {
    const sketch = sketchForExtrude(document, feature);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    const label = feature.operation === "cut" ? "Hueco" : feature.operation === "intersect" ? "Común" : "Añadir";
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${sketch?.profile.shape === "circle" ? "Cilindro" : "Caja"}: ${label}`}>{sketch?.profile.shape === "circle" ? <CircleDot size={17} /> : <Box size={17} />}<small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "primitive") {
    const definition = parametricOperationDefinition(feature.primitive);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${definition.name}: ${definition.roles[feature.operation].label}`}><Circle size={17} /><small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "hole") return <CircleDot className="drill-hole" size={16} />;
  if (feature.kind === "faceExtrude") return <span className={`educad-operation-icon ${feature.operation === "cut" ? "hole" : "add"}`} role="img" aria-label={feature.operation === "cut" ? "Hueco desde cara" : "Extrusión desde cara"}><Box size={17} /><small aria-hidden="true">{feature.operation === "cut" ? "−" : "+"}</small></span>;
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
      <p className="educad-feature-note">El objeto solo transforma el resultado de sus operaciones. La geometría se edita desplegando el árbol.</p>
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
  return (
    <div className="educad-feature-card educad-transform-card">
      <h3>{label}</h3>
      {(["x", "y", "z"] as const).map((axis) => (
        <label key={axis}>
          <span className={`educad-axis-label ${axis}`}>{axis.toUpperCase()}</span>
          <span className="educad-number-input"><input type="number" value={values[axis]} min={min} step="0.01" onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) onUpdate(axis, value); }} /><small>{unit}</small></span>
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
  onEditFaceExtrudeSelection,
}: {
  document: ParametricDocument;
  feature: ParametricFeature;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
  onEditSelection: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
}) {
  const onUpdate = (update: (feature: ParametricFeature) => void) => onUpdateFeature(feature.id, update);
  const primitiveSketch = feature.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  const treatmentReferences = feature.kind === "fillet"
    ? (feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? []).map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter(Boolean)
    : [];
  const treatmentFaceCount = treatmentReferences.filter((reference) => reference?.reference.hint.entityType === "face").length;
  const treatmentEdgeCount = treatmentReferences.filter((reference) => reference?.reference.hint.entityType === "edge").length;
  const setNumber = (value: string, apply: (value: number) => void) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) apply(parsed);
  };

  return (
    <div className="educad-feature-inspector" aria-label={`Propiedades de ${feature.name}`}>

      {feature.kind === "sketch" ? (
        <>
          <div className="educad-feature-card"><h3>Operación</h3><ReadOnlyField label="Tipo" value="Boceto" /><ReadOnlyField label="Plano" value={feature.plane} /></div>
          <div className="educad-feature-card">
            <h3>Parámetros de la forma</h3>
            <ReadOnlyField label="Perfil" value={feature.profile.shape === "rectangle" ? "Rectángulo" : "Círculo"} />
            {feature.profile.shape === "rectangle" ? <><NumberField label="Anchura" value={feature.profile.width} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><NumberField label="Profundidad" value={feature.profile.depth} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <NumberField label="Diámetro" value={feature.profile.diameter} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />}
          </div>
          <TransformSection description="Posición">
            <div className="educad-feature-card educad-transform-card"><h3>Posición</h3><NumberField label="X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.x = value; })} /><NumberField label="Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.y = value; })} /><NumberField label="Z" value={feature.offset} min={0} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.offset = value; })} /></div>
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "extrude" ? (
        <>
          <div className="educad-feature-card">
            <h3>Operación</h3>
            <label><span>Modo</span><select value={feature.operation} onChange={(event) => onUpdate((draft) => { if (draft.kind === "extrude") draft.operation = event.target.value as typeof draft.operation; })}><option value="add">Añadir</option><option value="cut">Hueco</option><option value="intersect">Común</option></select></label>
          </div>
          <div className="educad-feature-card">
            <h3>Parámetros de la forma</h3>
            {primitiveSketch?.profile.shape === "rectangle" ? (
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
            <label><span>Modo</span><select value={feature.operation} onChange={(event) => onUpdate((draft) => { if (draft.kind === "primitive") draft.operation = event.target.value as typeof draft.operation; })}><option value="add">Añadir</option><option value="cut">Hueco</option><option value="intersect">Común</option></select></label>
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
          <div className="educad-feature-card"><h3>Operación</h3><label><span>Tipo</span><select value={feature.operation} onChange={(event) => onUpdate((draft) => { if (draft.kind === "faceExtrude") draft.operation = event.target.value as typeof draft.operation; })}><option value="add">Añadir</option><option value="cut">Hueco</option></select></label><BoundedNumberField label="Longitud" value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "faceExtrude") draft.distance = Math.max(0.01, value); })} /></div>
          <button className="educad-edit-topology-selection" type="button" onClick={() => onEditFaceExtrudeSelection(feature.id)}>Editar cara</button>
          <TransformSection description="Dirección normal a la cara"><p className="educad-transform-empty">La longitud se aplica perpendicularmente a la cara seleccionada.</p></TransformSection>
        </>
      ) : null}

    </div>
  );

  function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
    return <label><span>{label}</span><span className="educad-number-input"><input type="number" value={value} min={min} step="0.01" onChange={(event) => setNumber(event.target.value, onChange)} /><small>mm</small></span></label>;
  }
}

function BoundedNumberField({ label, value, min, max, step = 0.01, unit = "mm", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
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
      <span className="educad-range-header"><span>{label}</span><span className="educad-number-input"><input type="number" value={draft} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setDraft(next); }} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(clampedValue); event.currentTarget.blur(); } }} />{unit ? <small>{unit}</small> : null}</span></span>
      <span className="educad-range-control"><input type="range" aria-label={label} value={draft} min={min} max={max} step={step} onPointerDown={() => setDragging(true)} onPointerUp={commit} onPointerCancel={commit} onChange={(event) => setDraft(Number(event.target.value))} onBlur={commit} /></span>
    </label>
  );
}

function ReadOnlyField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <label><span>{label}</span><output className={compact ? "compact" : ""}>{value}</output></label>;
}
