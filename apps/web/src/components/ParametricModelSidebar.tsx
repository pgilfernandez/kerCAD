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
  RotateCcw,
  RotateCw,
  Combine,
  Triangle,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { createContext, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { canReorderParametricSelection, canResetParametricFeature, OBJECT_COLOR_PALETTE, parametricObjectTree, sketchForExtrude, updateParametricTreeSelection, type ParametricTreeSelection } from "@/lib/parametricObjects";
import { localizedParametricOperationDefinition, parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import { parametricTextFontNames, updateParametricTextSketch } from "@/lib/parametricText";
import { ToolbarBooleanModeIcon, ToolbarChamferIcon, ToolbarFilletIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { displayLengthToMillimeters, displayUnitLabel, millimetersToDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { educadTranslate, type EducadLocale, type EducadTranslationKey } from "@/lib/educadI18n";
import type { ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";

export type ModelSelectionKind = "object" | "feature";
export type ModelSidebarMode = "normal" | "simplified";
export type ModelTreeSelection = ParametricTreeSelection;

const NumericStepContext = createContext({ input: 0.5, slider: 0.1, displayUnit: "mm" as ParametricDisplayUnit });
const LocaleContext = createContext<EducadLocale>("en");
const useSidebarTranslation = () => {
  const locale = useContext(LocaleContext);
  return (key: EducadTranslationKey) => educadTranslate(locale, key);
};

const englishSidebarLiterals: Record<string, string> = {
  "Posición": "Position", "Rotación": "Rotation", "Escala": "Scale", "Posición · rotación": "Position · rotation",
  "Posición · rotación · escala": "Position · rotation · scale", "Anchura": "Width", "Profundidad": "Depth",
  "Diámetro": "Diameter", "Radio": "Radius", "Altura": "Height", "Tamaño": "Size", "Espaciado": "Spacing",
  "Perfil": "Profile", "Forma": "Shape", "Caras seleccionadas": "Selected faces", "Aristas seleccionadas": "Selected edges",
  "Transformación del objeto contenedor": "Container object transform", "Sin transformación propia": "No independent transform",
  "Dirección normal a la cara": "Direction normal to face", "Eje local del objeto": "Object local axis",
  "Plano local del objeto": "Object local plane", "Dirección local del objeto": "Object local direction",
  "Rotación alrededor del origen local": "Rotation around local origin", "Referencia entre objetos": "Object reference",
  "Texto": "Text", "Fuente web": "Web font", "Alineación": "Alignment", "Alineación vertical": "Vertical alignment",
  "Final": "Termination", "Aristas": "Edges", "Plano": "Plane", "Resultado": "Result", "Origen": "Source",
  "Eje": "Axis", "Distribución uniforme": "Uniform distribution", "Objeto": "Object", "Formato": "Format",
  "Opacidad": "Opacity", "Visualización": "Display", "Seleccionable": "Selectable", "Color": "Color",
};

function localizedSidebarLiteral(locale: EducadLocale, text: string) {
  return locale === "en" ? englishSidebarLiterals[text] ?? text : text;
}

function useLocalizedSidebarLiteral(text: string) {
  return localizedSidebarLiteral(useContext(LocaleContext), text);
}

type Props = {
  document: ParametricDocument;
  selection: ModelTreeSelection[];
  mode: ModelSidebarMode;
  editingOriginObjectId: string | null;
  failedFeatureId?: string | null;
  gridStep: number;
  displayUnit?: ParametricDisplayUnit;
  locale?: EducadLocale;
  onSelectionChange: (selection: ModelTreeSelection[]) => void;
  onReorderSelection: (direction: "up" | "down") => void;
  onRenameSelection: (name: string) => void;
  onResetFeature: (featureId: string) => void;
  onDeleteSelection: () => void;
  onToggleOriginEdit: (objectId: string) => void;
  onEditFeatureSelection: (featureId: string) => void;
  onEditSketch: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
  onEditShellSelection: (featureId: string) => void;
  onEditRevolveFace: (featureId: string) => void;
  onEditRevolveAxis: (featureId: string) => void;
  onEditMirrorPlane: (featureId: string) => void;
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
  failedFeatureId = null,
  gridStep,
  displayUnit = "mm",
  locale = "es",
  onSelectionChange,
  onReorderSelection,
  onRenameSelection,
  onResetFeature,
  onDeleteSelection,
  onToggleOriginEdit,
  onEditFeatureSelection,
  onEditSketch,
  onEditFaceExtrudeSelection,
  onEditShellSelection,
  onEditRevolveFace,
  onEditRevolveAxis,
  onEditMirrorPlane,
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
  const renameInputRef = useRef<HTMLInputElement>(null);
  const objectListRef = useRef<HTMLDivElement>(null);
  const rangeAnchorRef = useRef<ModelTreeSelection | null>(null);
  const primarySelection = selection.at(-1) ?? null;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";
  const t = (key: EducadTranslationKey) => educadTranslate(locale, key);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      objectListRef.current?.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [document.objects, selectedId, selectionKind, selection.length]);

  useEffect(() => {
    if (!renameOpen) return;
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renameOpen]);

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
  const renameDialogRef = useAccessibleDialog<HTMLFormElement>(renameOpen, closeRename, renameInputRef);

  return (
    <LocaleContext.Provider value={locale}><NumericStepContext.Provider value={{ input: Math.max(0.0001, gridStep / 2), slider: Math.max(0.0001, gridStep / 10), displayUnit }}><>
    <aside className={`educad-model-sidebar ${mode}`} aria-label={educadTranslate(locale, "model.label")}>
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
                      aria-label={`${isExpanded ? t("model.collapse") : t("model.expand")} ${object.name}`}
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
                      <button aria-label={`${object.object.visible ? t("model.hide") : t("model.show")} ${object.name}`} title={object.object.visible ? t("model.hide") : t("model.show")} aria-pressed={!object.object.visible} onClick={() => onUpdateObject(object.id, (draft) => { draft.visible = !draft.visible; })}>{object.object.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                      <button aria-label={`${object.object.locked ? t("model.unlock") : t("model.lock")} ${object.name}`} title={object.object.locked ? t("model.unlock") : t("model.lock")} aria-pressed={object.object.locked} onClick={() => onUpdateObject(object.id, (draft) => { draft.locked = !draft.locked; })}>{object.object.locked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}</button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="educad-operation-list" role="group" aria-label={`${t("model.operationsFor")} ${object.name}`}>
                      {object.operations.map((feature) => (
                        <div key={feature.id} aria-invalid={feature.id === failedFeatureId || undefined} className={`educad-operation-row ${selection.some((candidate) => candidate.kind === "feature" && candidate.id === feature.id) ? "selected" : ""} ${feature.id === failedFeatureId ? "rebuild-failed" : ""} ${feature.suppressed ? "suppressed" : ""} ${feature.kind === "sketch" && !feature.visible ? "hidden" : ""} ${operationClass(feature)}`}>
                          <button className="educad-operation-select" title={feature.name} onClick={(event) => selectNode({ id: feature.id, kind: "feature" }, event)}>
                            <span className="educad-tree-branch" aria-hidden="true" />
                            <FeatureIcon document={document} feature={feature} />
                            <span className="educad-operation-name"><strong>{feature.name}</strong></span>
                          </button>
                          <div className="educad-tree-actions">
                            {feature.kind === "sketch" ? <button aria-label={`${feature.visible ? t("model.hide") : t("model.show")} ${feature.name}`} title={feature.visible ? t("model.hideSketch") : t("model.showSketch")} aria-pressed={!feature.visible} onClick={() => onUpdateFeature(feature.id, (draft) => { if (draft.kind === "sketch") draft.visible = !draft.visible; })}>{feature.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button> : null}
                            <button aria-label={`${feature.suppressed ? t("model.activate") : t("model.suppress")} ${feature.name}`} title={feature.suppressed ? t("model.activate") : t("model.suppress")} aria-pressed={feature.suppressed} onClick={() => onUpdateFeature(feature.id, (draft) => { draft.suppressed = !draft.suppressed; })}><CircleOff size={15} /></button>
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

      {mode === "normal" ? <div className="educad-tree-toolbar" role="toolbar" aria-label={t("model.treeActions")}>
        <button disabled={!canReorderParametricSelection(document, selection, "up")} aria-label={t("model.moveUp")} title={t("model.moveUp")} onClick={() => onReorderSelection("up")}><ArrowUp size={16} /></button>
        <button disabled={!canReorderParametricSelection(document, selection, "down")} aria-label={t("model.moveDown")} title={t("model.moveDown")} onClick={() => onReorderSelection("down")}><ArrowDown size={16} /></button>
        <span className="educad-tree-toolbar-separator" aria-hidden="true" />
        <button disabled={selection.length === 0} aria-label={t("common.rename")} title={t("common.rename")} onClick={beginRename}><Pencil size={15} /></button>
        <button disabled={!selectedFeature || !canResetParametricFeature(selectedFeature)} aria-label={t("operation.reset")} title={t("operation.reset")} onClick={() => selectedFeature && onResetFeature(selectedFeature.id)}><RotateCcw size={16} /></button>
        <button className="educad-origin-tree-button" disabled={!selectedObject || selectedObject.locked} aria-label={t("model.editOrigin")} title={t("model.editOrigin")} aria-pressed={Boolean(selectedObject && editingOriginObjectId === selectedObject.id)} onClick={() => selectedObject && onToggleOriginEdit(selectedObject.id)}><Crosshair size={16} /></button>
        <span className="educad-tree-toolbar-separator" aria-hidden="true" />
        <button className="danger" disabled={selection.length === 0} aria-label={t("common.delete")} title={t("common.delete")} onClick={onDeleteSelection}><Trash2 size={16} /></button>
      </div> : null}

      {mode === "normal" ? <section className="educad-sidebar-editor">
        {revolveDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label={t("operation.previewRevolve")}>
            <div className="educad-feature-card"><h3>{revolveDraft.editing ? t("operation.edit") : t("operation.new")}</h3><label><span>{t("property.type")}</span><select value={revolveDraft.operation} onChange={(event) => onRevolveDraftChange({ operation: event.target.value as typeof revolveDraft.operation })}><option value="add">{t("model.add")}</option><option value="cut">{t("model.hole")}</option><option value="intersect">{t("model.common")}</option></select></label><label><span>{t("property.axis")}</span><select value={revolveDraft.axis} onChange={(event) => onRevolveDraftChange({ axis: event.target.value as typeof revolveDraft.axis })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option><option value="edge" disabled={revolveDraft.edgeCount !== 1}>{t("operation.selectedEdge")}</option></select></label><BoundedNumberField label={t("property.angle")} value={revolveDraft.angle} min={-360} max={360} step={1} unit="°" onChange={(angle) => onRevolveDraftChange({ angle: Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle })} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelRevolve}>{t("common.cancel")}</button><button type="button" className="primary" disabled={revolveDraft.faceCount !== 1 || (revolveDraft.axis === "edge" && revolveDraft.edgeCount !== 1)} onClick={onAcceptRevolve}>{t("common.accept")}</button></div><p className="educad-topology-selection-count">{t("operation.faceAxis")}: {revolveDraft.faceCount} / {revolveDraft.edgeCount}</p>
          </div>
        ) : shellDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label={t("operation.previewShell")}>
            <div className="educad-feature-card"><h3>{shellDraft.editing ? t("operation.edit") : t("operation.new")}</h3><BoundedNumberField label={t("property.thickness")} value={shellDraft.thickness} min={0.01} max={50} onChange={onShellDraftChange} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelShell}>{t("common.cancel")}</button><button type="button" className="primary" disabled={shellDraft.faceCount === 0} onClick={onAcceptShell}>{t("common.accept")}</button></div>
            <p className="educad-topology-selection-count">{t("operation.openFaces")}: {shellDraft.faceCount}</p>
          </div>
        ) : faceExtrudeDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label={t("operation.previewFaceExtrude")}>
            <div className="educad-feature-card"><h3>{faceExtrudeDraft.editing ? t("operation.edit") : t("operation.new")}</h3><label><span>{t("property.type")}</span><select value={faceExtrudeDraft.operation} onChange={(event) => onFaceExtrudeDraftChange({ operation: event.target.value as "add" | "cut" })}><option value="add">{t("model.add")}</option><option value="cut">{t("model.hole")}</option></select></label><BoundedNumberField label={t("property.length")} value={faceExtrudeDraft.distance} min={0.01} max={200} onChange={(distance) => onFaceExtrudeDraftChange({ distance })} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelFaceExtrude}>{t("common.cancel")}</button><button type="button" className="primary" disabled={faceExtrudeDraft.faceCount !== 1} onClick={onAcceptFaceExtrude}>{t("common.accept")}</button></div>
          </div>
        ) : edgeTreatmentDraft ? (
          <div className="educad-feature-inspector educad-edge-treatment-draft" aria-label={t("operation.previewTopology")}>
            <div className="educad-feature-card"><h3>{edgeTreatmentDraft.editing ? t("operation.edit") : t("operation.new")}</h3><EdgeTreatmentButtons value={edgeTreatmentDraft.treatment} onChange={(treatment) => onEdgeTreatmentDraftChange({ treatment })} /><BoundedNumberField label={edgeTreatmentDraft.treatment === "chamfer" ? t("property.distance") : t("property.radius")} value={edgeTreatmentDraft.radius} min={0.01} max={50} onChange={(radius) => onEdgeTreatmentDraftChange({ radius })} /></div>
            <div className="educad-topology-selection-actions"><button type="button" onClick={onCancelEdgeTreatment}>{t("common.cancel")}</button><button type="button" className="primary" disabled={edgeTreatmentDraft.faceCount + edgeTreatmentDraft.edgeCount === 0} onClick={onAcceptEdgeTreatment}>{t("common.accept")}</button></div>
            <p className="educad-topology-selection-count">{t("operation.facesEdges")}: {edgeTreatmentDraft.faceCount} / {edgeTreatmentDraft.edgeCount}</p>
          </div>
        ) : selection.length > 1 ? (
          <div className="educad-no-selection educad-multi-selection"><Layers3 size={28} /><strong>{selection.length} {t("model.selected")}</strong><span>{selection.filter((item) => item.kind === "object").length} {t("model.objects")} · {selection.filter((item) => item.kind === "feature").length} {t("model.operations")}</span><small>{t("model.multiSelectionHint")}</small></div>
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
            onEditMirrorPlane={onEditMirrorPlane}
          />
        ) : (
          <div className="educad-no-selection"><Layers3 size={28} /><strong>{t("model.noSelection")}</strong><span>{t("model.noSelectionHint")}</span></div>
        )}
      </section> : null}
    </aside>
    {renameOpen ? (
      <div className="educad-dialog-backdrop" role="presentation" onPointerDown={closeRename}>
        <form ref={renameDialogRef} className="educad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-rename-title" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
          <header><strong id="educad-rename-title">{t("model.renameTitle")}</strong><button type="button" aria-label={t("common.cancel")} onClick={closeRename}><X size={18} /></button></header>
          <label><span>{selection.length > 1 ? t("model.commonName") : t("model.name")}</span><input ref={renameInputRef} autoFocus value={renameDraft} maxLength={80} placeholder={selection.length > 1 ? t("model.applyCommonName") : undefined} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") closeRename(); }} /></label>
          <footer><button type="button" onClick={closeRename}>{t("common.cancel")}</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>{t("common.accept")}</button></footer>
        </form>
      </div>
    ) : null}
    </></NumericStepContext.Provider></LocaleContext.Provider>
  );
}

function FeatureIcon({ document, feature }: { document: ParametricDocument; feature: ParametricFeature }) {
  const locale = useContext(LocaleContext);
  const t = (key: EducadTranslationKey) => educadTranslate(locale, key);
  if (feature.kind === "sketch") return <DraftingCompass className="sketch" size={16} role="img" aria-label={t("operation.sketch")} />;
  if (feature.kind === "extrude") {
    const sketch = sketchForExtrude(document, feature);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    const label = feature.operation === "cut" ? t("model.hole") : feature.operation === "intersect" ? t("model.common") : t("model.add");
    const generatedText = sketch?.profile.shape === "drawn" && sketch.profile.geometry.generator?.kind === "text";
    const shapeName = generatedText ? t("sketch.text") : localizedParametricOperationDefinition(sketch?.profile.shape === "circle" ? "cylinder" : "box", locale).name;
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${shapeName}: ${label}`}>{generatedText ? <Type size={17} /> : sketch?.profile.shape === "circle" ? <CircleDot size={17} /> : <Box size={17} />}<small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "primitive") {
    const definition = localizedParametricOperationDefinition(feature.primitive, locale);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${definition.name}: ${definition.roles[feature.operation].label}`}><Circle size={17} /><small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "importedStep") return <FileBox className="imported-step" size={16} role="img" aria-label={t("operation.importedStep")} />;
  if (feature.kind === "hole") return <CircleDot className="drill-hole" size={16} role="img" aria-label={t("operation.hole")} />;
  if (feature.kind === "faceExtrude") return <span className={`educad-operation-icon ${feature.operation === "cut" ? "hole" : "add"}`} role="img" aria-label={feature.operation === "cut" ? t("operation.facePocket") : t("operation.faceExtrude")}><Box size={17} /><small aria-hidden="true">{feature.operation === "cut" ? "−" : "+"}</small></span>;
  if (feature.kind === "shell") return <img className="educad-operation-asset-icon" src="/assets/educad/operations/shell.svg" alt={t("toolbar.shell")} />;
  if (feature.kind === "revolve") return <img className="educad-operation-asset-icon" src="/assets/educad/operations/revolve.svg" alt={t("operation.revolve")} />;
  if (feature.kind === "mirror") return <FlipHorizontal2 className="mirror" size={16} role="img" aria-label={t("operation.mirror")} />;
  if (feature.kind === "linearPattern") return <Rows3 className="linear-pattern" size={16} role="img" aria-label={t("operation.linearPattern")} />;
  if (feature.kind === "polarPattern") return <RotateCw className="polar-pattern" size={16} role="img" aria-label={t("operation.polarPattern")} />;
  if (feature.kind === "objectBoolean") return <Combine className="object-boolean" size={16} role="img" aria-label={t("toolbar.objectBoolean")} />;
  return feature.treatment === "chamfer" ? <Triangle className="chamfer" size={16} role="img" aria-label={t("operation.chamfer")} /> : <Radius className="fillet" size={16} role="img" aria-label={t("operation.fillet")} />;
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
  const t = useSidebarTranslation();
  const locale = useContext(LocaleContext);
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
      {object.referenceMesh ? <div className="educad-feature-card"><h3>{t("property.reference")}</h3><ReadOnlyField label={t("property.file")} value={object.referenceMesh.sourceName} /><ReadOnlyField label={t("property.format")} value={object.referenceMesh.format.toUpperCase()} /><label><span>{t("property.opacity")}</span><input type="range" min={0.05} max={1} step={0.05} value={object.referenceMesh.opacity} onChange={(event) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.opacity = Number(event.target.value); })} /></label><label><span>{t("property.display")}</span><select value={object.referenceMesh.displayMode} onChange={(event) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.displayMode = event.target.value as typeof draft.referenceMesh.displayMode; })}><option value="solidEdges">{t("display.solidEdges")}</option><option value="solid">{t("display.solid")}</option><option value="wireframe">{t("display.wireframe")}</option></select></label><label><span>{t("property.pickable")}</span><input type="checkbox" checked={object.referenceMesh.pickable} onChange={(event) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.pickable = event.target.checked; })} /></label></div> : null}
      <div ref={colorPanelRef} className="educad-feature-card educad-object-appearance">
        <button className="educad-color-trigger" aria-expanded={colorOpen} onClick={() => setColorOpen((value) => !value)}>
          <span>{t("property.color")}</span><span className="educad-color-preview" style={{ "--object-color": object.color } as CSSProperties} /><strong>{object.color.toUpperCase()}</strong><ChevronDown size={15} />
        </button>
        {colorOpen ? <div className="educad-color-palette" role="group" aria-label={`${t("property.color")} ${locale === "en" ? "of object" : "del objeto"}`}>
          {OBJECT_COLOR_PALETTE.map((color) => <button key={color} className={object.color.toLowerCase() === color ? "selected" : ""} aria-label={`${t("property.color")} ${color}`} title={color.toUpperCase()} style={{ "--object-color": color } as CSSProperties} onClick={() => { onUpdate((draft) => { draft.color = color; }); setColorOpen(false); }} />)}
          <label className="educad-custom-color" title="Color personalizado"><input type="color" value={object.color} onChange={(event) => onUpdate((draft) => { draft.color = event.target.value; })} /><span>+</span></label>
        </div> : null}
      </div>
      <TransformSection>
        <TransformGroup label={t("property.position")} values={object.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.position[axis] = value; })} />
        <TransformGroup label={t("property.rotation")} values={object.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.rotation[axis] = value; })} />
        <TransformGroup label={t("property.scale")} values={object.transform.scale} unit="×" min={0.01} onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.scale[axis] = Math.max(0.01, value); })} />
      </TransformSection>
    </div>
  );
}

function TransformSection({ children, description = "Posición · rotación · escala" }: { children: ReactNode; description?: string }) {
  const t = useSidebarTranslation();
  const localizedDescription = useLocalizedSidebarLiteral(description);
  return (
    <details className="educad-transform-section">
      <summary><ChevronRight size={16} /><span>{t("model.transform")}</span><small>{localizedDescription}</small></summary>
      <div>{children}</div>
    </details>
  );
}

function ShapeParametersSection({ children }: { children: ReactNode }) {
  const t = useSidebarTranslation();
  return <details className="educad-transform-section educad-shape-parameters" open><summary><ChevronRight size={16} /><span>{t("model.shapeParameters")}</span></summary><div><div className="educad-feature-card">{children}</div></div></details>;
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
  const localizedLabel = useLocalizedSidebarLiteral(label);
  return (
    <div className="educad-feature-card educad-transform-card">
      <h3>{localizedLabel}</h3>
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
  onEditMirrorPlane,
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
  onEditMirrorPlane: (featureId: string) => void;
}) {
  const t = useSidebarTranslation();
  const locale = useContext(LocaleContext);
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
    <div className="educad-feature-inspector" aria-label={`${locale === "en" ? "Properties of" : "Propiedades de"} ${feature.name}`}>

      {feature.kind === "sketch" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("operation.sketch")} /></div>
          {feature.profile.shape === "drawn" ? <>
            <button className="educad-edit-topology-selection" type="button" onClick={() => onEditSketch(feature.id)}>{t("operation.editSketch")}</button>
          </> : <ShapeParametersSection>
            <ReadOnlyField label={t("property.profile")} value={feature.profile.shape === "rectangle" ? t("value.rectangle") : t("value.circle")} />
            {feature.profile.shape === "rectangle" ? <><NumberField label={t("property.width")} value={feature.profile.width} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><NumberField label={t("property.depth")} value={feature.profile.depth} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <NumberField label={t("property.diameter")} value={feature.profile.diameter} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />}
          </ShapeParametersSection>}
          <TransformSection>
            <TransformGroup label={t("property.position")} values={{ x: feature.x, y: feature.y, z: feature.offset }} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind !== "sketch") return; if (axis === "x") draft.x = value; else if (axis === "y") draft.y = value; else draft.offset = value; })} />
            <TransformGroup label={t("property.rotation")} values={feature.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "extrude" ? (
        <>
          <div className="educad-feature-card">
            <h3>{t("model.operation")}</h3>
            <OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "extrude") draft.operation = operation; })} />
          </div>
          <ShapeParametersSection>
            {textGenerator && primitiveSketch ? <>
              <label><span>{localizedSidebarLiteral(locale, "Texto")}</span><DeferredTextInput value={textGenerator.text} maxLength={40} onCommit={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { text: value }); })} /></label>
              <label><span>{localizedSidebarLiteral(locale, "Fuente web")}</span><select value={textGenerator.font ?? "Sans"} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { font: event.target.value as typeof textGenerator.font }); })}>{parametricTextFontNames.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              <BoundedNumberField label={t("property.size")} value={textGenerator.size} min={1} max={200} unit="mm" onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { size: value }); })} />
              <BoundedNumberField label={t("property.spacing")} value={textGenerator.spacing} min={0} max={100} unit="mm" onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { spacing: value }); })} />
              <label><span>{localizedSidebarLiteral(locale, "Alineación")}</span><select value={textGenerator.align} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { align: event.target.value as typeof textGenerator.align }); })}><option value="left">{locale === "en" ? "Left" : "Izquierda"}</option><option value="center">{locale === "en" ? "Center" : "Centro"}</option><option value="right">{locale === "en" ? "Right" : "Derecha"}</option></select></label>
              <label><span>{localizedSidebarLiteral(locale, "Alineación vertical")}</span><select value={textGenerator.verticalAlign ?? "center"} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { verticalAlign: event.target.value as typeof textGenerator.verticalAlign }); })}><option value="bottom">{locale === "en" ? "Bottom" : "Inferior"}</option><option value="center">{locale === "en" ? "Center" : "Centro"}</option><option value="top">{locale === "en" ? "Top" : "Superior"}</option></select></label>
            </> : scribbleGenerator && primitiveSketch ? <button className="educad-edit-topology-selection" type="button" onClick={() => onEditSketch(primitiveSketch.id)}>{t("operation.editScribble")}</button> : primitiveSketch?.profile.shape === "rectangle" ? (
              <>
                <BoundedNumberField label={t("property.width")} value={primitiveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} />
                <BoundedNumberField label={t("property.depth")} value={primitiveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} />
              </>
            ) : primitiveSketch?.profile.shape === "circle" ? (
              <BoundedNumberField label={t("property.radius")} value={primitiveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value * 2); })} />
            ) : null}
            <BoundedNumberField label={t("property.height")} value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.distance = Math.max(0.01, value); })} />
          </ShapeParametersSection>
          <TransformSection description="Posición · rotación">
            <TransformGroup label={t("property.position")} values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.position[axis] = value; })} />
            <TransformGroup label={t("property.rotation")} values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "primitive" ? (
        <>
          <div className="educad-feature-card">
            <h3>{t("model.operation")}</h3>
            <OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "primitive") draft.operation = operation; })} />
          </div>
          <ShapeParametersSection>
            {localizedParametricOperationDefinition(feature.primitive, locale).parameters.map((parameter) => (
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
                    : parameter.key === "thickness"
                      ? Math.max(0.1, feature.width / 2 - (feature.innerRadius ?? 6))
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
                    const thickness = Math.max(0.1, draft.width / 2 - (draft.innerRadius ?? 6));
                    draft.innerRadius = Math.max(0.1, value);
                    draft.width = (draft.innerRadius + thickness) * 2;
                    draft.depth = draft.width;
                  } else if (parameter.key === "thickness") {
                    draft.width = ((draft.innerRadius ?? 6) + Math.max(0.1, value)) * 2;
                    draft.depth = draft.width;
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
          </ShapeParametersSection>
          <TransformSection description="Posición · rotación">
            <TransformGroup label={t("property.position")} values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.transform.position[axis] = value; })} />
            <TransformGroup label={t("property.rotation")} values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "importedStep" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("operation.importedStep")} /><ReadOnlyField label={t("property.file")} value={feature.sourceName} /><ReadOnlyField label={t("property.geometry")} value={t("operation.exactBrep")} /></div>
          <TransformSection description="Transformación del objeto contenedor"><p className="educad-transform-empty">{t("help.importedBase")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "hole" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("operation.hole")} /><label><span>{t("property.termination")}</span><select value={feature.termination} onChange={(event) => onUpdate((draft) => { if (draft.kind === "hole") draft.termination = event.target.value as typeof draft.termination; })}><option value="through-all">{t("value.throughAll")}</option><option value="blind">{t("value.blind")}</option></select></label></div>
          <ShapeParametersSection><BoundedNumberField label={t("property.diameter")} value={feature.diameter} min={0.01} max={100} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.diameter = Math.max(0.01, value); })} />{feature.termination === "blind" ? <BoundedNumberField label={t("property.depth")} value={feature.depth} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.depth = Math.max(0.01, value); })} /> : null}</ShapeParametersSection>
          <TransformSection description="Posición">
            <div className="educad-feature-card educad-transform-card"><h3>{t("property.position")}</h3><NumberField label="X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.x = value; })} /><NumberField label="Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.y = value; })} /></div>
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "fillet" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><EdgeTreatmentButtons value={feature.treatment} onChange={(treatment) => onUpdate((draft) => { if (draft.kind === "fillet") draft.treatment = treatment; })} /><BoundedNumberField label={feature.treatment === "chamfer" ? t("property.distance") : t("property.radius")} value={feature.radius} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "fillet") draft.radius = Math.max(0.01, value); })} />{!(feature.selectionReferenceIds?.length ?? feature.edgeReferenceIds?.length) ? <label><span>{t("property.edges")}</span><select value={feature.edges} onChange={(event) => onUpdate((draft) => { if (draft.kind === "fillet") draft.edges = event.target.value as typeof draft.edges; })}><option value="vertical">{t("value.vertical")}</option><option value="all">{t("value.all")}</option></select></label> : null}</div>
          {(feature.selectionReferenceIds?.length ?? feature.edgeReferenceIds?.length) ? <><button className="educad-edit-topology-selection" type="button" onClick={() => onEditSelection(feature.id)}>{t("operation.editSelection")}</button></> : null}
          <TransformSection description="Sin transformación propia"><p className="educad-transform-empty">{t("help.previousResult")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "faceExtrude" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><OperationModeButtons value={feature.operation} includeCommon={false} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "faceExtrude" && operation !== "intersect") draft.operation = operation; })} /><BoundedNumberField label={t("property.length")} value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "faceExtrude") draft.distance = Math.max(0.01, value); })} /></div>
          <button className="educad-edit-topology-selection" type="button" onClick={() => onEditFaceExtrudeSelection(feature.id)}>{t("operation.editFace")}</button>
          <TransformSection description="Dirección normal a la cara"><p className="educad-transform-empty">{t("help.faceExtrude")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "shell" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("toolbar.shell")} /><BoundedNumberField label={t("property.thickness")} value={feature.thickness} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "shell") draft.thickness = Math.max(0.01, value); })} /></div>
          <button className="educad-edit-topology-selection" type="button" onClick={() => onEditShellSelection(feature.id)}>{t("operation.editOpenFaces")}</button>
          <TransformSection description="Sin transformación propia"><p className="educad-transform-empty">{t("help.shell")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "revolve" ? (
        <>
          <div className="educad-feature-card"><h3>{t("model.operation")}</h3><OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "revolve") draft.operation = operation; })} /><label><span>{t("property.axis")}</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "revolve") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option>{feature.axis === "edge" ? <option value="edge">{t("operation.selectedEdge")}</option> : null}</select></label><BoundedNumberField label={t("property.angle")} value={feature.angle} min={-360} max={360} step={1} unit="°" onChange={(value) => onUpdate((draft) => { if (draft.kind === "revolve") draft.angle = Math.abs(value) < 1 ? (value < 0 ? -1 : 1) : Math.min(360, Math.max(-360, value)); })} /></div>
          {revolveSketch && revolveSketch.profile.shape !== "drawn" ? <div className="educad-feature-card"><h3>{t("operation.sketchProfile")}</h3><ReadOnlyField label={t("property.shape")} value={revolveSketch.profile.shape === "rectangle" ? t("value.rectangle") : t("value.circle")} />{revolveSketch.profile.shape === "rectangle" ? <><BoundedNumberField label={t("property.width")} value={revolveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><BoundedNumberField label={t("property.depth")} value={revolveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <BoundedNumberField label={t("property.radius")} value={revolveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value * 2); })} />}</div> : null}
          {feature.source === "face" ? <div className="educad-topology-selection-actions"><button className="educad-edit-topology-selection" type="button" onClick={() => onEditRevolveFace(feature.id)}>{t("operation.editFace")}</button><button className="educad-edit-topology-selection" type="button" onClick={() => onEditRevolveAxis(feature.id)}>{t("operation.editAxis")}</button></div> : <button className="educad-edit-topology-selection" type="button" onClick={() => onEditRevolveAxis(feature.id)}>{t("operation.editAxis")}</button>}
          <TransformSection description="Eje local del objeto"><p className="educad-transform-empty">{t("help.revolve")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "mirror" ? (
        <>
          <div className="educad-feature-card">
            <h3>{t("model.operation")}</h3>
            <label><span>{t("property.plane")}</span><select value={feature.planeNormal ? "custom" : feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "mirror" && event.target.value !== "custom") { draft.axis = event.target.value as typeof draft.axis; draft.planeOrigin = undefined; draft.planeNormal = undefined; } })}><option value="x">YZ (X)</option><option value="y">XZ (Y)</option><option value="z">XY (Z)</option>{feature.planeNormal ? <option value="custom">{t("mirror.selectedFace")}</option> : null}</select></label>
            <label><span>{t("property.result")}</span><select value={feature.duplicate ? "duplicate" : "transform"} onChange={(event) => onUpdate((draft) => { if (draft.kind === "mirror") draft.duplicate = event.target.value === "duplicate"; })}><option value="duplicate">{t("value.duplicate")}</option><option value="transform">{t("value.transformOnly")}</option></select></label>
          </div>
          <button className="educad-edit-topology-selection" type="button" onClick={() => onEditMirrorPlane(feature.id)}>{t("mirror.choosePlane")}</button>
          <TransformSection description="Plano local del objeto"><p className="educad-transform-empty">{t("help.mirror")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "linearPattern" ? (
        <>
          <div className="educad-feature-card">
            <h3>{t("model.operation")}</h3>
            <label><span>{t("property.source")}</span><select value={feature.source === "feature" ? feature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onUpdate((draft) => {
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
            })}><option value="body">{t("value.fullBody")}</option>{linearPatternSources.map((source) => <option key={source.id} value={source.id}>{t("value.previousOperation")} · {source.name}</option>)}</select></label>
            <label><span>{t("property.axis")}</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option></select></label>
          </div>
          <div className="educad-feature-card">
            <h3>{t("operation.parameters")}</h3>
            <BoundedNumberField label={t("property.count")} value={feature.count} min={2} max={50} step={1} onChange={(value) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.count = Math.min(50, Math.max(2, Math.round(value))); })} />
            <BoundedNumberField label={t("property.spacing")} value={feature.spacing} min={-1000} max={1000} unit="mm" onChange={(value) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.spacing = Math.abs(value) < 0.01 ? (value < 0 ? -0.01 : 0.01) : value; })} />
          </div>
          <TransformSection description="Dirección local del objeto"><p className="educad-transform-empty">{t("help.linearPattern")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "polarPattern" ? (
        <>
          <div className="educad-feature-card">
            <h3>{t("model.operation")}</h3>
            <label><span>{t("property.source")}</span><select value={feature.source === "feature" ? feature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onUpdate((draft) => {
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
            })}><option value="body">{t("value.fullBody")}</option>{polarPatternSources.map((source) => <option key={source.id} value={source.id}>{t("value.previousOperation")} · {source.name}</option>)}</select></label>
            <label><span>{t("property.axis")}</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option></select></label>
            <label><span>{t("property.uniformDistribution")}</span><input type="checkbox" checked={feature.equalSpacing} onChange={(event) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.equalSpacing = event.target.checked; })} /></label>
          </div>
          <div className="educad-feature-card">
            <h3>{t("operation.parameters")}</h3>
            <BoundedNumberField label={t("property.count")} value={feature.count} min={2} max={50} step={1} onChange={(value) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.count = Math.min(50, Math.max(2, Math.round(value))); })} />
            <BoundedNumberField label={feature.equalSpacing ? t("property.totalAngle") : t("property.angularStep")} value={feature.angle} min={-360} max={360} step={1} unit="°" onChange={(value) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.angle = Math.abs(value) < 0.1 ? (value < 0 ? -0.1 : 0.1) : value; })} />
          </div>
          <TransformSection description="Rotación alrededor del origen local"><p className="educad-transform-empty">{t("help.polarPattern")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "objectBoolean" ? (
        <>
          <div className="educad-feature-card">
            <h3>{t("model.operation")}</h3>
            <OperationModeButtons value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "objectBoolean") draft.operation = operation; })} />
            <label><span>{t("property.object")}</span><select value={feature.sourceObjectId} onChange={(event) => onUpdate((draft) => { if (draft.kind !== "objectBoolean") return; draft.sourceObjectId = event.target.value; draft.dependencies = [{ type: "object", id: event.target.value }]; })}>{document.objects.filter((object) => object.id !== feature.objectId).map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
          </div>
          <TransformSection description="Referencia entre objetos"><p className="educad-transform-empty">{t("help.objectBoolean")}</p></TransformSection>
        </>
      ) : null}

    </div>
  );

  function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
    const { input: inputStep } = useContext(NumericStepContext);
    const localizedLabel = useLocalizedSidebarLiteral(label);
    return <label><span>{localizedLabel}</span><DeferredNumberInput value={value} min={min} step={inputStep} unit="mm" onCommit={onChange} /></label>;
  }
}

function OperationModeButtons({ value, includeCommon = true, onChange }: { value: "add" | "cut" | "intersect"; includeCommon?: boolean; onChange: (value: "add" | "cut" | "intersect") => void }) {
  const t = useSidebarTranslation();
  const modes = includeCommon ? (["add", "cut", "intersect"] as const) : (["add", "cut"] as const);
  return <div className="educad-operation-mode-property">
    <div className="educad-operation-mode-buttons">
      {modes.map((mode) => {
        const label = mode === "add" ? t("model.add") : mode === "cut" ? t("model.hole") : t("model.common");
        return <button key={mode} type="button" className={`mode-${mode} ${value === mode ? "active" : ""}`} title={label} aria-label={label} aria-pressed={value === mode} onClick={() => onChange(mode)}><ToolbarBooleanModeIcon mode={mode === "cut" ? "hole" : mode === "intersect" ? "common" : "add"} /></button>;
      })}
    </div>
  </div>;
}

function EdgeTreatmentButtons({ value, onChange }: { value: "fillet" | "chamfer"; onChange: (value: "fillet" | "chamfer") => void }) {
  const t = useSidebarTranslation();
  return <div className="educad-operation-mode-property">
    <div className="educad-operation-mode-buttons educad-edge-treatment-mode-buttons">
      <button type="button" className={`mode-fillet ${value === "fillet" ? "active" : ""}`} title={t("operation.fillet")} aria-label={t("operation.fillet")} aria-pressed={value === "fillet"} onClick={() => onChange("fillet")}><ToolbarFilletIcon /></button>
      <button type="button" className={`mode-chamfer ${value === "chamfer" ? "active" : ""}`} title={t("operation.chamfer")} aria-label={t("operation.chamfer")} aria-pressed={value === "chamfer"} onClick={() => onChange("chamfer")}><ToolbarChamferIcon /></button>
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
  const t = useSidebarTranslation();
  const { displayUnit } = useContext(NumericStepContext);
  const isLength = unit === "mm";
  const toDisplay = (next: number) => isLength ? millimetersToDisplayLength(next, displayUnit) : next;
  const toInternal = (next: number) => isLength ? displayLengthToMillimeters(next, displayUnit) : next;
  const displayValue = toDisplay(value);
  const displayMin = min === undefined ? undefined : toDisplay(min);
  const displayMax = max === undefined ? undefined : toDisplay(max);
  const displayStep = toDisplay(step);
  const [draft, setDraft] = useState(String(displayValue));
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setDraft(String(displayValue)); }, [displayUnit, displayValue, editing]);
  const steppedValue = (direction: 1 | -1) => {
    const parsed = Number(draft.replace(",", "."));
    const base = Number.isFinite(parsed) ? parsed : displayValue;
    const next = Math.round((base + direction * displayStep) * 1e10) / 1e10;
    return Math.min(displayMax ?? Number.POSITIVE_INFINITY, Math.max(displayMin ?? Number.NEGATIVE_INFINITY, next));
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
      setDraft(String(displayValue));
      return;
    }
    const nextDisplay = Math.min(displayMax ?? Number.POSITIVE_INFINITY, Math.max(displayMin ?? Number.NEGATIVE_INFINITY, parsed));
    const next = toInternal(nextDisplay);
    setDraft(String(nextDisplay));
    if (Math.abs(next - value) > 1e-10) onCommit(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    else if (event.key === "Escape") {
      setDraft(String(displayValue));
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      nudge(event.key === "ArrowUp" ? 1 : -1);
    }
  };
  const visibleUnit = isLength ? displayUnitLabel(displayUnit) : unit;
  return <span className="educad-number-input" onWheel={(event) => { event.preventDefault(); nudge(event.deltaY < 0 ? 1 : -1); }}><input ref={inputRef} type="text" inputMode="decimal" value={draft} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={handleKeyDown} />{visibleUnit ? <small>{visibleUnit}</small> : null}<span className="educad-number-steppers"><button type="button" tabIndex={-1} aria-label={t("input.increment")} title={t("input.increment")} onPointerDown={(event) => { event.preventDefault(); nudge(1); }}>▲</button><button type="button" tabIndex={-1} aria-label={t("input.decrement")} title={t("input.decrement")} onPointerDown={(event) => { event.preventDefault(); nudge(-1); }}>▼</button></span></span>;
}

function BoundedNumberField({ label, value, min, max, unit = "mm", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const steps = useContext(NumericStepContext);
  const localizedLabel = useLocalizedSidebarLiteral(label);
  const clampedValue = Math.min(max, Math.max(min, value));
  return (
    <label className="educad-compact-number-property">
      <span>{localizedLabel}</span><DeferredNumberInput value={clampedValue} min={min} max={max} step={steps.input} unit={unit} onCommit={(next) => onChange(Math.min(max, Math.max(min, next)))} />
    </label>
  );
}

function ReadOnlyField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  const localizedLabel = useLocalizedSidebarLiteral(label);
  return <label><span>{localizedLabel}</span><output className={compact ? "compact" : ""}>{value}</output></label>;
}
