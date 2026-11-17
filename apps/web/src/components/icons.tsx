import type { CSSProperties, SVGProps } from "react";
import { operationIconPath } from "@/lib/kercadIconPaths";
import { ThemedToolbarImage } from "./ThemedToolbarImage";

type IconProps = SVGProps<SVGSVGElement>;

export function GridControlIcon({ snap = false, size = 22 }: { snap?: boolean; size?: number }) {
  const mask = `url("/assets/kercad/toolbar-vertical/${snap ? "snap-toggle" : "grid"}.svg")`;
  return <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, flexShrink: 0, backgroundColor: "currentColor", maskImage: mask, WebkitMaskImage: mask, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }} />;
}

export function HeaderToolbarIcon({ file }: { file: "documentation" | "language" | "theme-language" | "information" | "project-overview" | "square-pen" | "donate" | "github" | "menu" }) {
  const mask = `url("/assets/kercad/${file}.svg")`;
  return <span aria-hidden="true" className="kercad-header-svg-icon" data-icon={file} style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}
type SpriteRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const toolbarSprite = "assets/sketchforge/toolbar-sprite.svg?v=2";
const vectorToolbarSprite = "assets/sketchforge/vector-toolbar-icons.svg?v=1";

function ToolbarSpriteIcon({ rect, className, style }: IconProps & { rect: SpriteRect }) {
  const size = 35;
  const scale = size / rect.height;

  return (
    <span
      aria-hidden="true"
      className={["toolbar-sprite-icon", className].filter(Boolean).join(" ")}
      style={
        {
          "--sprite-x": `${-rect.x * scale}px`,
          "--sprite-y": `${-rect.y * scale}px`,
          "--sprite-width": `${260 * scale}px`,
          "--sprite-height": `${80 * scale}px`,
          width: `${rect.width * scale}px`,
          height: `${size}px`,
          backgroundImage: `url(${toolbarSprite})`,
          ...(style as CSSProperties),
        } as CSSProperties
      }
    />
  );
}

function VectorToolbarSpriteIcon({ rect, className, style }: IconProps & { rect: SpriteRect }) {
  const size = 35;
  const scale = size / rect.height;

  return (
    <span
      aria-hidden="true"
      className={["vector-toolbar-sprite-icon", className].filter(Boolean).join(" ")}
      style={
        {
          "--vector-sprite-x": `${-rect.x * scale}px`,
          "--vector-sprite-y": `${-rect.y * scale}px`,
          "--vector-sprite-width": `${165 * scale}px`,
          "--vector-sprite-height": `${27 * scale}px`,
          width: `${rect.width * scale}px`,
          height: `${size}px`,
          backgroundImage: `url(${vectorToolbarSprite})`,
          ...(style as CSSProperties),
        } as CSSProperties
      }
    />
  );
}

type ToolbarCommandImageProps = { file: string; className?: string };

function ToolbarCommandImage({ file, className }: ToolbarCommandImageProps) {
  const assetClassName = `toolbar-art-${file.replace(/\.png$/i, "")}`;
  return <img aria-hidden="true" className={["toolbar-command-icon", assetClassName, className].filter(Boolean).join(" ")} src={"/assets/sketchforge/" + file} alt="" draggable={false} />;
}

type KercadOperationImageProps = { file: string; className?: string };

function KercadOperationImage({ file, className }: KercadOperationImageProps) {
  return <ThemedToolbarImage aria-hidden="true" className={["toolbar-command-icon", "kercad-toolbar-operation-icon", className].filter(Boolean).join(" ")} src={operationIconPath(file)} alt="" draggable={false} />;
}

export function SketchToolbarIcon({ file }: { file: string }) {
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon kercad-sketch-toolbar-icon" src={`/assets/kercad/toolbar-sketch/${file}.svg`} alt="" draggable={false} />;
}

export function ViewToolbarIcon({ file }: { file: string }) {
  if (["toggle-lengths", "toggle-dimensions", "toggle-constraints"].includes(file)) {
    const mask = `url("/assets/kercad/toolbar-vertical/${file}.svg")`;
    return <span aria-hidden="true" className="toolbar-command-icon kercad-sketch-toolbar-icon kercad-sketch-visibility-icon" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
  }
  return <img aria-hidden="true" className="toolbar-command-icon kercad-sketch-toolbar-icon" src={`/assets/kercad/${file === "inverse" ? "toolbar-horizontal" : "toolbar-vertical"}/${file}.svg`} alt="" draggable={false} />;
}

export function SketchConstraintIcon({ file }: { file: string }) {
  const mask = `url("/assets/kercad/toolbar-vertical/constraints/${file}.svg")`;
  return <span aria-hidden="true" className="kercad-sketch-constraint-icon" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}

export function ToolbarHomeIcon() {
  // return <ToolbarCommandImage file="toolbar-home.png" className="toolbar-user-art-icon" />;
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/document_new.svg" alt="" draggable={false} />;
}

export function ToolbarCopyIcon() {
  return <KercadOperationImage file="file-copy.svg" />;
}

export function ToolbarPasteIcon() {
  return <KercadOperationImage file="file-paste.svg" />;
}

export function ToolbarDuplicateIcon() {
  return <KercadOperationImage file="file-duplicate.svg" />;
}

export function ToolbarTrashIcon() {
  return <KercadOperationImage file="file-delete.svg" />;
}

export function ToolbarUndoIcon() {
  return <KercadOperationImage file="undo.svg" />;
}

export function ToolbarRedoIcon() {
  return <KercadOperationImage file="redo.svg" />;
}

export function ToolbarImportIcon() {
  // return <ToolbarCommandImage file="toolbar-import.png" className="toolbar-user-art-icon" />;
  // return <KercadOperationImage file="import.svg" />;
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/import.svg" alt="" draggable={false} />;
}

export function ToolbarVectorExportIcon() {
  // return <ToolbarCommandImage file="toolbar-export.png" className="toolbar-user-art-icon" />;
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/export.svg" alt="" draggable={false} />;
}

export function ToolbarSettingsIcon() {
  return <ToolbarCommandImage file="toolbar-settings.png" className="toolbar-user-art-icon" />;
}

export function ToolbarShapeAddIcon(props: IconProps) {
  return <ThemedToolbarImage aria-hidden="true" className={["toolbar-command-icon", "kercad-toolbar-operation-icon", "kercad-add-shape-icon", props.className].filter(Boolean).join(" ")} src={operationIconPath("add-shape.svg")} alt="" draggable={false} style={props.style} />;
}

export function ToolbarSketchIcon() {
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/sketch.svg" alt="" draggable={false} />;
}

export function ToolbarPositionManipulatorIcon() {
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/manipulator-position.svg" alt="" draggable={false} />;
}

export function ToolbarRotationManipulatorIcon() {
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/manipulator-rotation.svg" alt="" draggable={false} />;
}

export function ToolbarParameterManipulatorIcon() {
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/manipulator-parameters.svg" alt="" draggable={false} />;
}

export function ToolbarBooleanModeIcon({ mode }: { mode: "add" | "hole" | "common" }) {
  return <KercadOperationImage file={`boolean-${mode}.svg`} />;
}

export function ToolbarHideSelectedIcon(props: IconProps) {
  return <VectorToolbarSpriteIcon rect={{ x: 138, y: 0, width: 27, height: 27 }} {...props} />;
}

export function ToolbarCaretDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="m16 19 8 9 8-9z" fill="currentColor" />
    </svg>
  );
}

export function ToolbarGroupIcon() {
  return <ToolbarCommandImage file="toolbar-group.png" />;
}

export function ToolbarUngroupIcon() {
  return <ToolbarCommandImage file="toolbar-ungroup.png" />;
}

export function ToolbarIntersectionIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <circle cx="19" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="29" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="4 3" />
      <path d="M24 11.99A13 13 0 0 1 24 36.01A13 13 0 0 1 24 11.99Z" fill="currentColor" opacity="0.82" />
    </svg>
  );
}

export function ToolbarAlignIcon() {
  return <KercadOperationImage file="alignment.svg" />;
}

export function ToolbarMirrorIcon() {
  return <KercadOperationImage file="mirror.svg" />;
}

export function ToolbarLinearPatternIcon() {
  return <KercadOperationImage file="linear-pattern.svg" />;
}

export function ToolbarPolarPatternIcon() {
  return <KercadOperationImage file="polar-pattern.svg" />;
}

export function ToolbarObjectBooleanIcon() {
  return <KercadOperationImage file="object-boolean.svg" />;
}

export function ToolbarChamferIcon() {
  return <KercadOperationImage file="chamfer.svg" />;
}

export function ToolbarFilletIcon() {
  return <KercadOperationImage file="fillet.svg" />;
}

export function ToolbarEditOperationIcon({ inheritColor = false }: { inheritColor?: boolean } = {}) {
  if (inheritColor) {
    const mask = `url("${operationIconPath("edit.svg")}")`;
    return <span aria-hidden="true" className="kercad-edit-theme-icon" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
  }
  const mask = `url("${operationIconPath("edit.svg")}")`;
  return <span aria-hidden="true" className="toolbar-command-icon kercad-toolbar-operation-icon kercad-edit-operation-icon" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}

export function ToolbarPreserveEdgeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="M10 35V17c0-4 3-7 7-7h18" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M10 35h25V10" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinejoin="round" />
      <path d="M17 29h13M17 25v8M30 25v8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 17a7 7 0 0 1 7-7" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ToolbarSnapGridIcon() {
  return <KercadOperationImage file="snap-grid.svg" />;
}

export function ToolbarExtrudeIcon() {
  return <KercadOperationImage file="extrude.svg" />;
}

export function ToolbarSectionViewIcon() {
  return <KercadOperationImage file="section-view.svg" />;
}

export function ToolbarRevolveIcon() {
  return <KercadOperationImage file="revolve.svg" />;
}

export function ToolbarSweepIcon() {
  return <KercadOperationImage file="extrude-along-path.svg" />;
}

export function ToolbarShellIcon() {
  return <KercadOperationImage file="shell.svg" />;
}

export function ToolbarExportIcon() {
  return <ToolbarCommandImage file="toolbar-export.png" className="toolbar-user-art-icon" />;
}

export function ToolbarWorkplaneIcon() {
  return <KercadOperationImage file="workplane.svg" />;
}

export function ToolbarResetWorkplaneIcon() {
  return <KercadOperationImage file="workplane-reset.svg" />;
}

export function ToolbarDropToWorkplaneIcon() {
  return <ThemedToolbarImage aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/kercad/toolbar-3d/drop-to-workplane.svg" alt="" draggable={false} />;
}

function ProjectionToolbarIcon({ file }: { file: "perspective" | "orthographic" }) {
  const mask = `url("/assets/kercad/toolbar-vertical/${file}.svg")`;
  return <span aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" style={{ width: 32, height: 32, backgroundColor: "currentColor", maskImage: mask, WebkitMaskImage: mask, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />;
}

export function ToolbarPerspectiveIcon() {
  return <ProjectionToolbarIcon file="perspective" />;
}

export function ToolbarOrthographicIcon() {
  return <ProjectionToolbarIcon file="orthographic" />;
}
