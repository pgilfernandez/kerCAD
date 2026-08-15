"use client";

import { Box, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Focus, Grid3X3, Home, Magnet, Maximize2, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParametricModelSidebar, type ModelSidebarMode, type ModelTreeSelection } from "@/components/ParametricModelSidebar";
import { ParametricViewport, type CameraOrientation, type CameraProjection, type CameraView } from "@/components/ParametricViewport";
import {
  ToolbarAlignIcon,
  ToolbarChamferIcon,
  ToolbarCopyIcon,
  ToolbarDropToWorkplaneIcon,
  ToolbarDuplicateIcon,
  ToolbarFilletIcon,
  ToolbarHomeIcon,
  ToolbarImportIcon,
  ToolbarMirrorIcon,
  ToolbarPasteIcon,
  ToolbarRedoIcon,
  ToolbarSettingsIcon,
  ToolbarShapeAddIcon,
  ToolbarSnapGridIcon,
  ToolbarTrashIcon,
  ToolbarUndoIcon,
  ToolbarVectorExportIcon,
} from "@/components/icons";
import { cloneDocument, createFilletFeature, createStarterDocument, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { assertValidParametricDependencies } from "@/lib/parametricDependencyGraph";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint } from "@/lib/parametricBuildState";
import { buildParametricModel, buildParametricOperationContext, exportParametricStep } from "@/lib/parametricKernel";
import { binaryStlFromRenderMeshes } from "@/lib/stlExport";
import {
  beginHistoryTransaction,
  cancelHistoryTransaction,
  commitHistoryDocument,
  createParametricHistory,
  currentHistoryDocument,
  finishHistoryTransaction,
  redoParametricHistory,
  undoParametricHistory,
  type ParametricHistoryState,
} from "@/lib/parametricHistory";
import {
  addPrimitiveToSelection,
  applyOperationWorldPosition,
  applyOperationWorldRotation,
  applyWorkplanePatch,
  deleteParametricObject,
  deleteParametricFeature,
  deleteParametricSelection,
  duplicateParametricObject,
  lastOperationForObject,
  objectIdForFeature,
  resizeParametricSelection,
  resizeParametricHeight,
  viewportSelectionForFeature,
  viewportSelectionForObject,
  workplaneShapeForObject,
  type SupportedPrimitive,
} from "@/lib/parametricObjects";
import { toolbarShapeAssets } from "@/lib/shapeCatalog";
import type { BuildResult, ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";
import type { WorkplaneShape } from "@/types/sketchforge";

const STORAGE_KEY = "educad.parametric.document.v1";
type Notice = { type: "ok" | "info" | "error"; text: string } | null;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(value: string) {
  return value.trim().replace(/\.(?:educad\.json|json|step|stp|stl)$/i, "").toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "") || "modelo";
}

export function SketchForgeParametricEditor() {
  const initialDocument = useMemo(() => createStarterDocument(), []);
  const [history, setHistory] = useState<ParametricHistoryState>(() => createParametricHistory(initialDocument));
  const document = currentHistoryDocument(history);
  const [modelSelection, setModelSelection] = useState<ModelTreeSelection[]>(initialDocument.objects[0] ? [{ id: initialDocument.objects[0].id, kind: "object" }] : []);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, objectRecords: [], operationContext: null, completedFeatureIds: [], warning: null });
  const [operationContext, setOperationContext] = useState<BuildResult["operationContext"]>(null);
  const [kernelBusy, setKernelBusy] = useState(true);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [modelSidebarMode, setModelSidebarMode] = useState<ModelSidebarMode | "hidden">("normal");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState(document.name);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [workplaneOpen, setWorkplaneOpen] = useState(false);
  const [workplaneDraft, setWorkplaneDraft] = useState(document.workplane);
  const [view, setView] = useState<CameraView>({ name: "iso", token: 0 });
  const [projection, setProjection] = useState<CameraProjection>("orthographic");
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>({ azimuth: Math.PI / 4, polar: 1.02 });
  const [clipboardId, setClipboardId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const buildCounter = useRef(0);
  const contextBuildCounter = useRef(0);
  const geometryFingerprint = useMemo(() => parametricGeometryFingerprint(document), [document]);
  const objectColorFingerprint = useMemo(() => parametricObjectColorFingerprint(document), [document]);
  const objectColors = useMemo(() => objectColorsFromFingerprint(objectColorFingerprint), [objectColorFingerprint]);
  const buildDocumentRef = useRef(document);
  buildDocumentRef.current = document;
  const selectedOperationTimeline = useMemo(() => {
    if (modelSelection.length !== 1 || modelSelection[0]?.kind !== "feature") return null;
    const buildDocument = buildDocumentRef.current;
    const feature = buildDocument.features.find((candidate) => candidate.id === modelSelection[0]?.id);
    if (feature?.kind !== "extrude" || !feature.objectId) return null;
    const operations = buildDocument.features.filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch");
    const index = operations.findIndex((candidate) => candidate.id === feature.id);
    return index < 0 ? null : { featureId: feature.id, objectId: feature.objectId, index, count: operations.length };
  }, [geometryFingerprint, modelSelection]);
  const viewportOperationContext = useMemo(() => operationContext ? {
    ...operationContext,
    color: objectColors[operationContext.objectId] ?? operationContext.color,
    opacity: 0.4,
  } : null, [objectColors, operationContext]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (validateDocument(parsed)) {
          const normalized = normalizeParametricDocument(parsed);
          setHistory(createParametricHistory(normalized));
          setModelSelection(normalized.objects[0] ? [{ id: normalized.objects[0].id, kind: "object" }] : []);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document, hydrated]);

  useEffect(() => {
    const counter = ++buildCounter.current;
    setKernelBusy(true);
    const buildDocument = buildDocumentRef.current;
    const timeout = window.setTimeout(() => {
      buildParametricModel(buildDocument).then((result) => {
        if (counter !== buildCounter.current) return;
        setBuild(result);
        setKernelBusy(false);
      }).catch((error: unknown) => {
        if (counter !== buildCounter.current) return;
        setBuild((current) => ({ ...current, warning: error instanceof Error ? error.message : String(error) }));
        setKernelBusy(false);
      });
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [geometryFingerprint]);

  useEffect(() => {
    const counter = ++contextBuildCounter.current;
    setOperationContext(null);
    if (!selectedOperationTimeline || selectedOperationTimeline.index === selectedOperationTimeline.count - 1) return;
    const buildDocument = buildDocumentRef.current;
    const timeout = window.setTimeout(() => {
      buildParametricOperationContext(buildDocument, selectedOperationTimeline.featureId).then((result) => {
        if (counter === contextBuildCounter.current) setOperationContext(result);
      }).catch(() => {
        if (counter === contextBuildCounter.current) setOperationContext(null);
      });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [geometryFingerprint, selectedOperationTimeline]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const commit = useCallback((next: ParametricDocument) => {
    next.updatedAt = Date.now();
    setHistory((current) => commitHistoryDocument(current, next));
  }, []);

  const beginTransaction = useCallback(() => setHistory(beginHistoryTransaction), []);
  const finishTransaction = useCallback(() => setHistory((current) => finishHistoryTransaction(current)), []);
  const cancelTransaction = useCallback(() => setHistory(cancelHistoryTransaction), []);

  const mutate = useCallback((mutator: (draft: ParametricDocument) => void) => {
    const next = cloneDocument(document);
    try {
      mutator(next);
      assertValidParametricDependencies(next);
      commit(next);
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "La operación crearía una dependencia no válida." });
      return false;
    }
  }, [commit, document]);

  const primarySelection = modelSelection.at(-1) ?? null;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";
  const selectedObjectId = objectIdForFeature(document, selectedId);
  const selectedOperationId = selectionKind === "feature" && document.features.some((feature) => feature.id === selectedId && feature.kind === "extrude") ? selectedId : null;
  const selectedShape = useMemo(() => workplaneShapeForObject(document, selectedObjectId), [document, selectedObjectId]);
  const selectedBox = useMemo(() => modelSelection.length === 1 ? (selectedOperationId ? viewportSelectionForFeature(document, selectedOperationId) : viewportSelectionForObject(document, selectedObjectId)) : null, [document, modelSelection.length, selectedObjectId, selectedOperationId]);
  const snapAmount = document.workplane.snapToGrid ? document.workplane.gridStep : 0.01;

  const addShape = (kind: SupportedPrimitive) => {
    let result: ReturnType<typeof addPrimitiveToSelection> = { objectId: "", featureId: null, createdObject: false };
    mutate((draft) => {
      result = addPrimitiveToSelection(draft, selectedObjectId, kind);
    });
    if (result.featureId) {
      setModelSelection([{ id: result.featureId, kind: "feature" }]);
    }
    setShapesOpen(false);
    setNotice({ type: "ok", text: `${kind === "box" ? "Caja" : "Cilindro"} ${result.createdObject ? "creado en un objeto nuevo" : "añadido al final del objeto activo"}` });
  };

  const removeSelected = useCallback(() => {
    if (!selectedObjectId) return;
    const ids = document.objects.map((object) => object.id);
    const index = ids.indexOf(selectedObjectId);
    if (!mutate((draft) => deleteParametricObject(draft, selectedObjectId))) return;
    const nextId = ids[index - 1] ?? ids[index + 1] ?? null;
    setModelSelection(nextId ? [{ id: nextId, kind: "object" }] : []);
  }, [document, mutate, selectedObjectId]);

  const duplicateSelected = useCallback((sourceId = selectedObjectId) => {
    if (!sourceId) return;
    let nextId: string | null = null;
    mutate((draft) => { nextId = duplicateParametricObject(draft, sourceId); });
    if (nextId) {
      setModelSelection([{ id: nextId, kind: "object" }]);
    }
    setNotice({ type: "ok", text: "Forma duplicada" });
  }, [mutate, selectedObjectId]);

  const deleteFeature = useCallback((id: string) => {
    let result: ReturnType<typeof deleteParametricFeature> = { objectId: null, nextId: null };
    const deleted = mutate((draft) => {
      result = deleteParametricFeature(draft, id);
    });
    if (!deleted) return;
    const nextId = result.nextId ?? result.objectId;
    setModelSelection(nextId ? [{ id: nextId, kind: result.nextId && result.nextId !== result.objectId ? "feature" : "object" }] : []);
    setNotice({ type: "ok", text: "Operación eliminada" });
  }, [mutate]);

  const deleteCurrentSelection = useCallback(() => {
    if (modelSelection.length === 0) return;
    if (modelSelection.length === 1) {
      const item = modelSelection[0];
      if (item.kind === "feature") deleteFeature(item.id);
      else removeSelected();
      return;
    }
    if (!mutate((draft) => deleteParametricSelection(draft, modelSelection))) return;
    setModelSelection([]);
    setNotice({ type: "ok", text: `${modelSelection.length} elementos eliminados` });
  }, [deleteFeature, modelSelection, mutate, removeSelected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if (event.key === "Escape") {
        setModelSelection([]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteCurrentSelection();
        return;
      }
      if (!selectedObjectId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? snapAmount * 5 : snapAmount;
      const x = (selectedBox?.x ?? 0) + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0);
      const y = (selectedBox?.y ?? 0) + (event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0);
      mutate((draft) => {
        if (selectedOperationId) applyOperationWorldPosition(draft, selectedOperationId, x, y);
        else applyWorkplanePatch(draft, selectedObjectId, { x, z: y });
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteCurrentSelection, mutate, selectedBox?.x, selectedBox?.y, selectedId, selectedObjectId, selectedOperationId, snapAmount]);

  const updateSelected = (patch: Partial<WorkplaneShape>) => {
    if (!selectedObjectId) return;
    mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, patch));
  };

  const updateFeature = (id: string, update: (feature: ParametricFeature) => void) => {
    mutate((draft) => {
      const feature = draft.features.find((candidate) => candidate.id === id);
      if (feature) update(feature);
    });
  };

  const updateObject = (id: string, update: (object: ParametricObject) => void) => {
    mutate((draft) => {
      const object = draft.objects.find((candidate) => candidate.id === id);
      if (object) update(object);
    });
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));
  const undo = () => setHistory(undoParametricHistory);
  const redo = () => setHistory(redoParametricHistory);

  const newDocument = () => {
    const next = createStarterDocument();
    setHistory(createParametricHistory(next));
    setModelSelection(next.objects[0] ? [{ id: next.objects[0].id, kind: "object" }] : []);
    setNotice({ type: "info", text: "Nuevo diseño" });
  };

  const addFillet = () => {
    if (!selectedShape || selectedShape.hole || !selectedObjectId) return;
    let featureId = "";
    mutate((draft) => {
      const feature = createFilletFeature(draft.features.filter((candidate) => candidate.kind === "fillet").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setNotice({ type: "ok", text: "Redondeo paramétrico añadido" });
  };

  const exportProject = () => {
    downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }), `${fileName(exportFileName)}.educad.json`);
    setNotice({ type: "ok", text: "Proyecto paramétrico exportado" });
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      downloadBlob(await exportParametricStep(document), `${fileName(exportFileName)}.step`);
      setNotice({ type: "ok", text: "STEP B-Rep exportado" });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo exportar" });
    } finally {
      setExporting(false);
    }
  };

  const exportStl = () => {
    try {
      const buffer = binaryStlFromRenderMeshes(build.objectRecords.map((item) => item.mesh), exportFileName);
      downloadBlob(new Blob([buffer], { type: "model/stl" }), `${fileName(exportFileName)}.stl`);
      setNotice({ type: "ok", text: `STL binario exportado · ${build.objectRecords.length} objeto${build.objectRecords.length === 1 ? "" : "s"}` });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo exportar el STL" });
    }
  };

  const importProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateDocument(parsed)) throw new Error("Este no es un proyecto eduCAD compatible.");
      const normalized = normalizeParametricDocument(parsed);
      setHistory(createParametricHistory(normalized));
      setModelSelection(normalized.objects[0] ? [{ id: normalized.objects[0].id, kind: "object" }] : []);
      setNotice({ type: "ok", text: "Proyecto abierto" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo abrir" });
    }
  };

  if (!hydrated) {
    return <main className="educad-reference-shell"><div className="editor-loading-screen"><div className="editor-loading-toolbar" /><div className="educad-initial-loading">Preparando el espacio de trabajo…</div></div></main>;
  }

  return (
    <main className="educad-reference-shell">
      <div className="secondary-toolbar">
        <div className="toolbar-workspace-tabs">
          <button className="active">Diseño 3D</button>
          <button onClick={() => setNotice({ type: "info", text: "Selecciona una forma para editar su boceto paramétrico" })}>Boceto</button>
          <span className="educad-project-name">eduCAD · {document.name}</span>
        </div>
        <div className="toolbar-mode-content geometry">
          <ToolbarSection label="Home" className="toolbar-home-section"><Tool label="Nuevo diseño" onClick={newDocument}><ToolbarHomeIcon /></Tool></ToolbarSection>
          <div className="tool-group left">
            <ToolbarSection label="Clipboard">
              <Tool label="Copiar" enabled={Boolean(selectedObjectId)} onClick={() => { setClipboardId(selectedObjectId); setNotice({ type: "info", text: "Objeto copiado" }); }}><ToolbarCopyIcon /></Tool>
              <Tool label="Pegar" enabled={Boolean(clipboardId)} onClick={() => duplicateSelected(clipboardId)}><ToolbarPasteIcon /></Tool>
              <Tool label="Duplicar" enabled={Boolean(selectedObjectId)} onClick={() => duplicateSelected()}><ToolbarDuplicateIcon /></Tool>
              <Tool label={modelSelection.length > 1 ? "Eliminar selección" : selectionKind === "feature" ? "Eliminar operación" : "Eliminar objeto"} enabled={modelSelection.length > 0} onClick={deleteCurrentSelection}><ToolbarTrashIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="History">
              <Tool label="Deshacer" enabled={history.index > 0} onClick={undo}><ToolbarUndoIcon /></Tool>
              <Tool label="Rehacer" enabled={history.index < history.entries.length - 1} onClick={redo}><ToolbarRedoIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Shapes" className="toolbar-shapes-section">
              <button className={`shape-menu-trigger ${shapesOpen ? "active" : ""}`} aria-label="Añadir forma" onClick={() => setShapesOpen((value) => !value)}><ToolbarShapeAddIcon /></button>
              {shapesOpen && (
                <div className="shape-menu-dropdown">
                  <div className="shape-menu-title">Formas</div>
                  <div className="shape-menu-list">
                    <div className="educad-shape-target">{selectedObjectId ? `Añadir al final de ${document.objects.find((object) => object.id === selectedObjectId)?.name ?? "objeto activo"}` : "Se creará un objeto nuevo"}</div>
                    {toolbarShapeAssets.slice(0, 2).map((asset) => <button className="shape-menu-item" key={asset.id} onClick={() => addShape(asset.kind as SupportedPrimitive)}><img src={asset.menuIcon} alt="" /><span>{asset.name === "Box" ? "Caja" : "Cilindro"}<small>{selectedObjectId ? "Nueva operación en el objeto" : "Nuevo objeto con esta forma"}</small></span></button>)}
                    <div className="educad-shape-coming"><strong>Más operaciones CAD</strong><span>Revolución, cono y esfera llegarán como operaciones paramétricas.</span></div>
                  </div>
                </div>
              )}
            </ToolbarSection>
          </div>
          <div className="toolbar-spacer" />
          <div className="tool-group right">
            <ToolbarSection label="Modify">
              <Tool label="Alinear" enabled={false}><ToolbarAlignIcon /></Tool>
              <Tool label="Simetría" enabled={Boolean(selectedShape)} onClick={() => selectedObjectId && mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, { x: -(selectedShape?.x ?? 0) }))}><ToolbarMirrorIcon /></Tool>
              <Tool label="Ajustar a rejilla" enabled={Boolean(selectedShape && document.workplane.snapToGrid)} onClick={() => selectedObjectId && mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, { x: Math.round((selectedShape?.x ?? 0) / snapAmount) * snapAmount, z: Math.round((selectedShape?.z ?? 0) / snapAmount) * snapAmount }))}><ToolbarSnapGridIcon /></Tool>
              <Tool label="Chaflán" enabled={false}><ToolbarChamferIcon /></Tool>
              <Tool label="Redondeo" enabled={Boolean(selectedShape && !selectedShape.hole)} onClick={addFillet}><ToolbarFilletIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Arrange">
              <Tool label="Bajar al plano" enabled={Boolean(selectedShape)} onClick={() => updateSelected({ elevation: 0 })}><ToolbarDropToWorkplaneIcon /></Tool>
            </ToolbarSection>
          </div>
          <ToolbarSection label="Manage" className="toolbar-actions-section">
            <div className="action-buttons">
              <button className="action-icon-button" aria-label="Importar" onClick={() => importRef.current?.click()}><ToolbarImportIcon /></button>
              <button className="action-icon-button" aria-label="Exportar" onClick={() => { if (!exportOpen) setExportFileName(document.name); setExportOpen((value) => !value); }}><ToolbarVectorExportIcon /></button>
              <button className="action-icon-button" aria-label="Ajustes" onClick={() => setSettingsOpen((value) => !value)}><ToolbarSettingsIcon /></button>
            </div>
          </ToolbarSection>
        </div>
      </div>

      <section className="educad-workplane-stage">
        <ParametricViewport
          mesh={build.mesh}
          objectRecords={build.objectRecords}
          objectColors={objectColors}
          operationContext={viewportOperationContext}
          isolatedHistoryObjectId={selectedOperationTimeline && selectedOperationTimeline.index < selectedOperationTimeline.count - 1 ? selectedOperationTimeline.objectId : null}
          color={document.color}
          workplane={document.workplane}
          view={view}
          projection={projection}
          selection={selectedBox}
          snap={snapAmount}
          onSelectionMove={(x, y) => mutate((draft) => {
            if (selectedOperationId) applyOperationWorldPosition(draft, selectedOperationId, x, y);
            else if (selectedObjectId) applyWorkplanePatch(draft, selectedObjectId, { x, z: y });
          })}
          onSelectionRotate={(rotation) => mutate((draft) => {
            if (selectedOperationId) applyOperationWorldRotation(draft, selectedOperationId, rotation);
            else if (selectedObjectId) applyWorkplanePatch(draft, selectedObjectId, { rotation });
          })}
          onSelectionResize={(x, y, width, depth) => {
            if (!selectedId) return;
            mutate((draft) => resizeParametricSelection(draft, selectedId, selectionKind, x, y, width, depth));
          }}
          onSelectionHeight={(height) => {
            if (!selectedId) return;
            mutate((draft) => resizeParametricHeight(draft, selectedId, selectionKind, height));
          }}
          onCameraOrientation={setCameraOrientation}
          onObjectSelect={(objectId) => {
            const object = document.objects.find((candidate) => candidate.id === objectId);
            if (!object || object.locked || !object.visible) return;
            const operation = lastOperationForObject(document, objectId);
            setModelSelection([{ id: operation?.id ?? objectId, kind: operation ? "feature" : "object" }]);
          }}
          onObjectsSelect={(objectIds) => {
            const selected = objectIds.flatMap<ModelTreeSelection>((objectId) => {
              const object = document.objects.find((candidate) => candidate.id === objectId);
              if (!object || object.locked || !object.visible) return [];
              const operation = lastOperationForObject(document, objectId);
              return [{ id: operation?.id ?? objectId, kind: operation ? "feature" : "object" }];
            });
            setModelSelection(selected);
          }}
          onEmptySelect={() => {
            setModelSelection([]);
          }}
        />
        <ViewCube orientation={cameraOrientation} onDirection={(direction) => setView((current) => ({ name: "custom", direction, token: current.token + 1 }))} />
        <button className={`educad-workplane-settings-button ${workplaneOpen ? "active" : ""}`} aria-label="Ajustes del plano de trabajo" title="Plano de trabajo" onClick={() => { setWorkplaneDraft(document.workplane); setWorkplaneOpen((value) => !value); }}><Grid3X3 size={22} /></button>
        <button
          className={`educad-workplane-snap-button ${document.workplane.snapToGrid ? "active" : ""}`}
          aria-label={document.workplane.snapToGrid ? "Desactivar ajuste a rejilla" : "Activar ajuste a rejilla"}
          aria-pressed={document.workplane.snapToGrid}
          title={document.workplane.snapToGrid ? "Snap to grid: activado" : "Snap to grid: desactivado"}
          onClick={() => {
            const enabled = !document.workplane.snapToGrid;
            mutate((draft) => { draft.workplane.snapToGrid = enabled; });
            setWorkplaneDraft((current) => ({ ...current, snapToGrid: enabled }));
          }}
        ><Magnet size={21} /></button>
        {workplaneOpen ? <form className="educad-workplane-popover" onSubmit={(event) => { event.preventDefault(); mutate((draft) => { draft.workplane = { ...workplaneDraft, snapToGrid: draft.workplane.snapToGrid }; }); setWorkplaneOpen(false); }}>
          <header><div><strong>Plano de trabajo</strong><span>Dimensiones y paso de la rejilla</span></div><button type="button" aria-label="Cerrar" onClick={() => setWorkplaneOpen(false)}><X size={17} /></button></header>
          <label><span>Ancho</span><span className="educad-number-input"><input type="number" min="60" max="2000" step="1" value={workplaneDraft.width} onChange={(event) => setWorkplaneDraft((current) => ({ ...current, width: Math.min(2000, Math.max(60, Number(event.target.value) || 60)) }))} /><small>mm</small></span></label>
          <label><span>Largo</span><span className="educad-number-input"><input type="number" min="60" max="2000" step="1" value={workplaneDraft.depth} onChange={(event) => setWorkplaneDraft((current) => ({ ...current, depth: Math.min(2000, Math.max(60, Number(event.target.value) || 60)) }))} /><small>mm</small></span></label>
          <label><span>Paso de líneas</span><span className="educad-number-input"><input type="number" min="0.1" max="200" step="0.1" value={workplaneDraft.gridStep} onChange={(event) => setWorkplaneDraft((current) => ({ ...current, gridStep: Math.min(200, Math.max(0.1, Number(event.target.value) || 0.1)) }))} /><small>mm</small></span></label>
          <footer><button type="button" onClick={() => setWorkplaneOpen(false)}>Cancelar</button><button className="primary" type="submit">Aplicar</button></footer>
        </form> : null}
        <button
          className={`educad-sidebar-mode-control ${modelSidebarMode}`}
          aria-label={modelSidebarMode === "normal" ? "Simplificar jerarquía" : modelSidebarMode === "simplified" ? "Ocultar jerarquía" : "Mostrar jerarquía"}
          title={modelSidebarMode === "normal" ? "Panel visible" : modelSidebarMode === "simplified" ? "Panel simplificado" : "Panel oculto"}
          onClick={() => setModelSidebarMode((current) => current === "normal" ? "simplified" : current === "simplified" ? "hidden" : "normal")}
        >
          {modelSidebarMode === "normal" ? <ChevronLeft size={23} /> : modelSidebarMode === "simplified" ? <ChevronDown size={23} /> : <ChevronRight size={23} />}
        </button>
        <div className="camera-controls" aria-label="Controles de cámara">
          <button aria-label={projection === "perspective" ? "Cambiar a vista ortográfica" : "Cambiar a perspectiva"} title={projection === "perspective" ? "Perspectiva" : "Ortográfica"} aria-pressed={projection === "orthographic"} onClick={() => setProjection((current) => current === "perspective" ? "orthographic" : "perspective")}><Box size={22} /></button>
          <button aria-label="Vista inicial" onClick={() => setCamera("home")}><Home size={24} /></button>
          <button aria-label="Encuadrar todo" title="Encuadrar todo" onClick={() => setCamera("fit")}><Maximize2 size={21} /></button>
          <button aria-label="Zoom a la selección" title="Zoom a la selección" disabled={!selectedBox} onClick={() => setCamera("selection")}><Focus size={21} /></button>
          <button aria-label="Acercar" onClick={() => setCamera("zoom-in")}><Plus size={28} /></button>
          <button aria-label="Alejar" onClick={() => setCamera("zoom-out")}><Minus size={28} /></button>
        </div>
        <div className="educad-drag-tip">Arrastra la operación para moverla · usa el tirador circular para girarla</div>
        {kernelBusy && <div className="educad-kernel-pill">Reconstruyendo OpenCascade…</div>}
        {build.warning && <div className="educad-rebuild-error"><strong>El historial se detuvo aquí</strong><span>{build.warning}</span></div>}
        {notice && <div className={`educad-reference-toast ${notice.type}`}>{notice.text}</div>}

        {modelSidebarMode !== "hidden" ? <ParametricModelSidebar
          document={document}
          selection={modelSelection}
          mode={modelSidebarMode}
          onSelectionChange={setModelSelection}
          onUpdateObject={updateObject}
          onUpdateFeature={updateFeature}
        /> : null}
      </section>

      {exportOpen && (
        <aside className="top-action-panel export-action-panel educad-export-panel">
          <header><div className="top-action-heading"><strong>Exportar</strong><span>Conserva los parámetros o fabrica la pieza</span></div><button onClick={() => setExportOpen(false)}><X /></button></header>
          <label className="educad-export-name"><span>Nombre del archivo</span><input type="text" value={exportFileName} maxLength={120} placeholder="modelo" onChange={(event) => setExportFileName(event.target.value)} /></label>
          <div className="educad-export-options">
            <button onClick={exportProject}><span className="export-format-icon">JSON</span><strong>Proyecto eduCAD</strong><small>Historial editable y parámetros</small></button>
            <button onClick={() => void exportStep()} disabled={exporting || kernelBusy || !build.mesh}><span className="export-format-icon step">STEP</span><strong>{exporting ? "Exportando…" : "Modelo STEP"}</strong><small>B-Rep exacto para fabricación</small></button>
            <button onClick={exportStl} disabled={kernelBusy || build.objectRecords.length === 0}><span className="export-format-icon">STL</span><strong>Modelo STL</strong><small>Binario, en milímetros y listo para imprimir</small></button>
          </div>
        </aside>
      )}

      {settingsOpen && (
        <aside className="top-action-panel educad-settings-panel">
          <header><strong>Ajustes del diseño</strong><button onClick={() => setSettingsOpen(false)}><X /></button></header>
          <label><span>Nombre</span><input value={document.name} onFocus={beginTransaction} onBlur={finishTransaction} onChange={(event) => mutate((draft) => { draft.name = event.target.value; })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelTransaction(); event.currentTarget.blur(); } }} /></label>
          <p>El proyecto se guarda automáticamente en este navegador.</p>
        </aside>
      )}

      <input ref={importRef} hidden type="file" accept=".json,.educad" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProject(file); event.target.value = ""; }} />
    </main>
  );
}

function ToolbarSection({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`toolbar-section ${className}`}><div className="toolbar-section-label">{label}</div><div className="toolbar-section-tools">{children}</div></div>;
}

function Tool({ label, enabled = true, active = false, onClick, children }: { label: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`toolbar-icon ${enabled ? "" : "disabled"} ${active ? "active" : ""}`} aria-label={label} title={label} disabled={!enabled} onClick={onClick}>{children}</button>;
}

function ViewCube({ orientation, onDirection }: { orientation: CameraOrientation; onDirection: (direction: [number, number, number]) => void }) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; azimuth: number; polar: number } | null>(null);
  const draggedRef = useRef(false);
  const cubeTransform = `rotateX(${orientation.polar * 180 / Math.PI - 90}deg) rotateY(${-orientation.azimuth * 180 / Math.PI}deg)`;
  const chooseDirection = (direction: [number, number, number]) => {
    if (!draggedRef.current) onDirection(direction);
    draggedRef.current = false;
  };
  return <div
    className="view-cube"
    aria-label="Cubo de vistas interactivo"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, azimuth: orientation.azimuth, polar: orientation.polar };
      draggedRef.current = false;
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      draggedRef.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      const azimuth = drag.azimuth - dx * 0.012;
      const polar = Math.min(Math.PI - 0.03, Math.max(0.03, drag.polar - dy * 0.012));
      onDirection([Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)]);
    }}
    onPointerUp={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      window.setTimeout(() => { draggedRef.current = false; }, 0);
    }}
    onPointerCancel={() => { dragRef.current = null; draggedRef.current = false; }}
  ><div className="view-cube-inner" style={{ transform: cubeTransform }}><button type="button" className="cube-face cube-top" aria-label="Vista inferior" onClick={() => chooseDirection([0, -1, 0.001])}>BOTTOM</button><button type="button" className="cube-face cube-bottom" aria-label="Vista superior" onClick={() => chooseDirection([0, 1, 0.001])}>TOP</button><button type="button" className="cube-face cube-front" aria-label="Vista frontal" onClick={() => chooseDirection([0, 0.001, 1])}>FRONT</button><button type="button" className="cube-face cube-back" aria-label="Vista trasera" onClick={() => chooseDirection([0, 0.001, -1])}>BACK</button><button type="button" className="cube-face cube-right" aria-label="Vista derecha" onClick={() => chooseDirection([1, 0.001, 0])}>RIGHT</button><button type="button" className="cube-face cube-left" aria-label="Vista izquierda" onClick={() => chooseDirection([-1, 0.001, 0])}>LEFT</button></div></div>;
}
