import type { CSSProperties, SVGProps } from "react";
import { operationIconPath } from "@/lib/educadIconPaths";

type IconProps = SVGProps<SVGSVGElement>;

export function GridControlIcon({ snap = false, size = 22 }: { snap?: boolean; size?: number }) {
  const mask = `url("/assets/educad/toolbar-vertical/${snap ? "snap-toggle" : "grid"}.svg")`;
  return <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, flexShrink: 0, backgroundColor: "currentColor", maskImage: mask, WebkitMaskImage: mask, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }} />;
}

export function HeaderToolbarIcon({ file }: { file: "documentation" | "language" | "information" | "project-overview" }) {
  const mask = `url("/assets/educad/${file}.svg")`;
  return <span aria-hidden="true" className="educad-header-svg-icon" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
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

type EducadOperationImageProps = { file: string; className?: string };

function EducadOperationImage({ file, className }: EducadOperationImageProps) {
  return <img aria-hidden="true" className={["toolbar-command-icon", "educad-toolbar-operation-icon", className].filter(Boolean).join(" ")} src={operationIconPath(file)} alt="" draggable={false} />;
}

export function SketchToolbarIcon({ file }: { file: string }) {
  return <img aria-hidden="true" className="toolbar-command-icon educad-sketch-toolbar-icon" src={`/assets/educad/toolbar-sketch/${file}.svg`} alt="" draggable={false} />;
}

export function ViewToolbarIcon({ file }: { file: string }) {
  return <img aria-hidden="true" className="toolbar-command-icon educad-sketch-toolbar-icon" src={`/assets/educad/${file === "inverse" ? "toolbar-horizontal" : "toolbar-vertical"}/${file}.svg`} alt="" draggable={false} />;
}

export function SketchConstraintIcon({ file }: { file: string }) {
  return <img aria-hidden="true" className="educad-sketch-constraint-icon" src={`/assets/educad/toolbar-vertical/constraints/${file}.svg`} alt="" draggable={false} />;
}

export function ToolbarHomeIcon() {
  // return <ToolbarCommandImage file="toolbar-home.png" className="toolbar-user-art-icon" />;
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/document_new.svg" alt="" draggable={false} />;
}

export function ToolbarCopyIcon() {
  return <ToolbarCommandImage file="toolbar-copy.png" className="toolbar-user-art-icon" />;
}

export function ToolbarPasteIcon() {
  return <ToolbarCommandImage file="toolbar-paste.png" className="toolbar-user-art-icon" />;
}

export function ToolbarDuplicateIcon() {
  return <ToolbarCommandImage file="toolbar-duplicate.png" className="toolbar-user-art-icon" />;
}

export function ToolbarTrashIcon() {
  return <ToolbarCommandImage file="toolbar-delete.png" className="toolbar-user-art-icon" />;
}

export function ToolbarUndoIcon() {
  return <ToolbarCommandImage file="toolbar-undo.png" className="toolbar-user-art-icon" />;
}

export function ToolbarRedoIcon() {
  return <ToolbarCommandImage file="toolbar-redo.png" className="toolbar-user-art-icon" />;
}

export function ToolbarImportIcon() {
  // return <ToolbarCommandImage file="toolbar-import.png" className="toolbar-user-art-icon" />;
  // return <EducadOperationImage file="import.svg" />;
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/import.svg" alt="" draggable={false} />;
}

export function ToolbarVectorExportIcon() {
  // return <ToolbarCommandImage file="toolbar-export.png" className="toolbar-user-art-icon" />;
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/export.svg" alt="" draggable={false} />;
}

export function ToolbarSettingsIcon() {
  return <ToolbarCommandImage file="toolbar-settings.png" className="toolbar-user-art-icon" />;
}

export function ToolbarShapeAddIcon(props: IconProps) {
  return <VectorToolbarSpriteIcon rect={{ x: 104, y: 0, width: 29, height: 27 }} {...props} />;
}

export function ToolbarSketchIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/sketch.svg" alt="" draggable={false} />;
}

export function ToolbarPositionManipulatorIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/manipulator-position.svg" alt="" draggable={false} />;
}

export function ToolbarRotationManipulatorIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/manipulator-rotation.svg" alt="" draggable={false} />;
}

export function ToolbarParameterManipulatorIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/manipulator-parameters.svg" alt="" draggable={false} />;
}

export function ToolbarBooleanModeIcon({ mode }: { mode: "add" | "hole" | "common" }) {
  return <EducadOperationImage file={`boolean-${mode}.svg`} />;
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
  return <EducadOperationImage file="alignment.svg" />;
}

export function ToolbarMirrorIcon() {
  return <EducadOperationImage file="mirror.svg" />;
}

export function ToolbarLinearPatternIcon() {
  return <EducadOperationImage file="linear-pattern.svg" />;
}

export function ToolbarPolarPatternIcon() {
  return <EducadOperationImage file="polar-pattern.svg" />;
}

export function ToolbarObjectBooleanIcon() {
  return <EducadOperationImage file="object-boolean.svg" />;
}

export function ToolbarChamferIcon() {
  return <EducadOperationImage file="chamfer.svg" />;
}

export function ToolbarFilletIcon() {
  return <EducadOperationImage file="fillet.svg" />;
}

export function ToolbarEditOperationIcon() {
  return <EducadOperationImage file="edit.svg" />;
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
  return <EducadOperationImage file="snap-grid.svg" />;
}

export function ToolbarExtrudeIcon() {
  return <EducadOperationImage file="extrude.svg" />;
}

export function ToolbarSectionViewIcon() {
  return <EducadOperationImage file="section-view.svg" />;
}

export function ToolbarRevolveIcon() {
  return <EducadOperationImage file="revolve.svg" />;
}

export function ToolbarShellIcon() {
  return <EducadOperationImage file="shell.svg" />;
}

export function ToolbarExportIcon() {
  return <ToolbarCommandImage file="toolbar-export.png" className="toolbar-user-art-icon" />;
}

export function ToolbarWorkplaneIcon() {
  return <EducadOperationImage file="workplane.svg" />;
}

export function ToolbarResetWorkplaneIcon() {
  return <EducadOperationImage file="workplane-reset.svg" />;
}

export function ToolbarDropToWorkplaneIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-3d/drop-to-workplane.svg" alt="" draggable={false} />;
}

export function ToolbarPerspectiveIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-vertical/perspective.svg" alt="" draggable={false} />;
}

export function ToolbarOrthographicIcon() {
  return <img aria-hidden="true" className="toolbar-command-icon toolbar-user-art-icon" src="/assets/educad/toolbar-vertical/orthographic.svg" alt="" draggable={false} />;
}
