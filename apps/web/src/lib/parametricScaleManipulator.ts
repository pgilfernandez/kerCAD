import * as THREE from "three";
import { applyParametricSelectionWorldDelta } from "@/lib/parametricObjects";
import { gearOutlinePoints } from "@/lib/parametricGearProfile";
import { torusSweepAngle } from "@/lib/parametricTorus";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import { tubeMinimumCurvatureRadius } from "@/lib/tubeGeometry";
import type { ExtrudeFeature, ParametricDocument, PrimitiveFeature, SketchFeature } from "@/types/parametric";

export type ScaleAxis = "x" | "y" | "z";
type TargetItem = { id: string; origin: THREE.Vector3 };
export type ParametricScaleTarget = { matrix: THREE.Matrix4; bounds: THREE.Box3; minimum: THREE.Vector3; linkedXY: boolean; items: TargetItem[]; objectId?: string };
type Selection = { id: string; kind: "object" | "feature" };
type ScaleFeature = ExtrudeFeature | PrimitiveFeature;
const axes = ["x", "y", "z"] as const;

function editableProfile(document: ParametricDocument, feature: ExtrudeFeature) {
  if (feature.pathSketchId || feature.endSketchId || Math.abs(feature.distance) < 0.1) return null;
  const sketch = document.features.find((entry): entry is SketchFeature => entry.id === feature.sketchId && entry.kind === "sketch");
  if (!sketch || sketch.profile.shape === "drawn" || sketch.generatedPath) return null;
  // A profile shared with another operation must not change as a side effect.
  if (document.features.some((entry) => entry.id !== feature.id && (
    ("sketchId" in entry && entry.sketchId === sketch.id) ||
    (entry.kind === "extrude" && (entry.pathSketchId === sketch.id || entry.endSketchId === sketch.id))
  ))) return null;
  return sketch;
}

function itemGeometry(document: ParametricDocument, feature: ScaleFeature) {
  const frame = parametricTransformMatrix(feature.transform);
  let x: number, y: number, z: number, base = 0, linkedXY = false;
  let outline: [number, number][] | undefined;
  let minimum = new THREE.Vector3(0.1, 0.1, 0.1);
  if (feature.kind === "extrude") {
    const sketch = editableProfile(document, feature);
    if (!sketch || sketch.profile.shape === "drawn") return null;
    frame.multiply(parametricTransformMatrix({ position: { x: sketch.x, y: sketch.y, z: sketch.offset }, rotation: sketch.rotation }));
    if (sketch.profile.shape === "rectangle") {
      x = sketch.profile.width;
      y = sketch.profile.depth;
    } else {
      x = sketch.profile.diameter;
      y = sketch.profile.elliptical ? (sketch.profile.radius2 ?? x / 2) * 2 : x;
      linkedXY = !sketch.profile.elliptical;
    }
    z = Math.abs(feature.distance);
    base = feature.symmetric ? -z / 2 : Math.min(0, feature.distance);
  } else {
    if (feature.primitive === "platonic" || (feature.primitive === "torus" && torusSweepAngle(feature.angle) !== 360)) return null;
    ({ width: x, depth: y, height: z } = feature);
    if (feature.primitive === "sphere" || feature.primitive === "torus") base = -z / 2;
    if (feature.primitive === "cone") {
      x = y = Math.max(x, (feature.topRadius ?? 0) * 2);
      linkedXY = true;
    }
    if (feature.primitive === "tube") {
      if (!feature.ellipsoidal) { y = x; linkedXY = true; }
      minimum = new THREE.Vector3(.2, .2, .1);
    }
    if (feature.primitive === "torus") {
      linkedXY = true;
      minimum = new THREE.Vector3(.4, .4, .2);
    }
    if (feature.primitive === "polygon") {
      const sides = Math.min(32, Math.max(3, Math.round(feature.sides ?? 6)));
      outline = Array.from({ length: sides }, (_, i) => [Math.cos(i * 2 * Math.PI / sides) * x / 2, Math.sin(i * 2 * Math.PI / sides) * x / 2]);
      linkedXY = true;
    }
    if (feature.primitive === "gear") {
      outline = gearOutlinePoints(x, y, feature.toothDepth ?? 2.5, feature.teeth ?? 12).map(([px, py]) => [px, py]);
      linkedXY = true;
    }
    if (feature.primitive === "roundedBox") {
      const diameter = (feature.cornerRadius ?? 3) * 2 + .2;
      minimum.x = minimum.y = diameter;
    }
  }
  if (![x, y, z].every((value) => Number.isFinite(value) && value > 1e-6)) return null;
  // Minimum ratios refer to the editable dimensions, not to the (possibly
  // smaller) enclosing box of a polygon or gear.
  minimum.divide(new THREE.Vector3(x, y, z));
  const bounds = new THREE.Box3(new THREE.Vector3(-x / 2, -y / 2, base), new THREE.Vector3(x / 2, y / 2, base + z));
  if (outline?.length) {
    bounds.makeEmpty();
    for (const [px, py] of outline) bounds.expandByPoint(new THREE.Vector3(px, py, base));
    bounds.max.z = base + z;
  }
  return { frame, bounds, minimum, linkedXY };
}

function isScaleFeature(feature: ParametricDocument["features"][number]): feature is ScaleFeature {
  return feature.kind === "primitive" || feature.kind === "extrude";
}

function boundsInObjectFrame(positions: ArrayLike<number>, matrix: THREE.Matrix4) {
  const box = new THREE.Box3(), inverse = matrix.clone().invert(), point = new THREE.Vector3();
  for (let i = 0; i + 2 < positions.length; i += 3) box.expandByPoint(point.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(inverse));
  return box;
}

export function createParametricScaleTarget(document: ParametricDocument, selection: Selection, bodyPositions?: ArrayLike<number>): ParametricScaleTarget | null {
  const selected = selection.kind === "feature" ? document.features.find((entry) => entry.id === selection.id) : null;
  const objectId = selection.kind === "object" ? selection.id : selected?.objectId;
  const object = document.objects.find((entry) => entry.id === objectId);
  if (!object?.visible || object.locked || object.referenceMesh || !axes.every((axis) => object.transform.scale[axis] > 1e-6)) return null;
  const entries = selected ? [selected] : document.features.filter((entry) => entry.objectId === object.id && entry.kind !== "sketch" && !entry.suppressed);
  if (!entries.length || entries.some((entry) => !isScaleFeature(entry) || entry.suppressed)) return null;
  const features = entries as ScaleFeature[];
  const matrix = parametricTransformMatrix(object.transform);
  const selectedBodyId = selection.kind === "object" ? object.id : undefined;
  if (features.length === 1) {
    const geometry = itemGeometry(document, features[0]);
    if (!geometry) return null;
    matrix.multiply(geometry.frame);
    return { matrix, bounds: geometry.bounds, minimum: geometry.minimum, linkedXY: geometry.linkedXY, items: [{ id: features[0].id, origin: new THREE.Vector3() }], objectId: selectedBodyId };
  }
  if (!bodyPositions?.length) return null;
  const minimum = new THREE.Vector3(), items: TargetItem[] = [];
  let linkedXY = false;
  for (const feature of features) {
    const geometry = itemGeometry(document, feature);
    if (!geometry) return null;
    // With differently oriented operations, a non-uniform body resize would
    // introduce shear that cannot be represented by dimensions and positions.
    const rotation = new THREE.Matrix4().extractRotation(geometry.frame).elements;
    if (![0, 1, 2, 4, 5, 6, 8, 9, 10].every((i) => Math.abs(rotation[i] - (i % 5 === 0 ? 1 : 0)) < 1e-7)) return null;
    items.push({ id: feature.id, origin: new THREE.Vector3().setFromMatrixPosition(geometry.frame) });
    minimum.max(geometry.minimum);
    linkedXY ||= geometry.linkedXY;
  }
  const bounds = boundsInObjectFrame(bodyPositions, matrix);
  const size = bounds.getSize(new THREE.Vector3());
  return bounds.isEmpty() || !axes.every((axis) => Number.isFinite(size[axis]) && size[axis] > 1e-6) ? null : { matrix, bounds, minimum, linkedXY, items, objectId: selectedBodyId };
}

function resizePrimitive(feature: PrimitiveFeature, factors: THREE.Vector3) {
  const { x, y, z } = factors, originalRadius = feature.width / 2;
  const thickness = originalRadius - (feature.innerRadius ?? 6);
  feature.width *= x;
  feature.depth *= y;
  feature.height *= z;
  if (feature.primitive === "cone" || feature.primitive === "pyramid") feature.topRadius = (feature.topRadius ?? 0) * x;
  if (feature.primitive === "gear") {
    feature.toothDepth = (feature.toothDepth ?? 2.5) * x;
    feature.boreRadius = (feature.boreRadius ?? 3) * x;
  }
  if (feature.primitive === "sphere" || feature.primitive === "halfSphere") {
    if (Math.abs(feature.width - feature.depth) > 1e-8 || (feature.primitive === "sphere" && Math.abs(feature.height - feature.width) > 1e-8)) feature.ellipsoidal = true;
  }
  if (feature.primitive === "tube") {
    const rx = feature.width / 2, ry = feature.ellipsoidal ? feature.depth / 2 : rx;
    const limit = tubeMinimumCurvatureRadius(rx, ry);
    feature.innerRadius = rx - Math.max(.00001, Math.min(thickness, limit * .99));
  }
  if (feature.primitive === "torus") {
    feature.majorRadius = (feature.majorRadius ?? 12) * x;
    feature.tubeRadius = (feature.tubeRadius ?? 4) * x;
    feature.tubeRadius2 = feature.height / 2;
    feature.ellipsoidal = Math.abs(feature.tubeRadius - feature.tubeRadius2) > 1e-8;
  }
}

export function applyParametricScale(document: ParametricDocument, target: ParametricScaleTarget, factors: THREE.Vector3, pivot: THREE.Vector3) {
  if (!axes.every((axis) => Number.isFinite(factors[axis]) && factors[axis] > 0)) return;
  const basis = new THREE.Matrix3().setFromMatrix4(target.matrix);
  const change = factors.clone().subScalar(1);
  let anchor = pivot;
  if (target.objectId) {
    const object = document.objects.find((entry) => entry.id === target.objectId);
    if (!object) return;
    anchor = new THREE.Vector3().copy(object.transform.position).applyMatrix4(target.matrix.clone().invert());
    const offset = anchor.clone().sub(pivot).multiply(change).applyMatrix3(basis);
    applyParametricSelectionWorldDelta(document, object.id, "object", offset);
  }
  for (const item of target.items) {
    const feature = document.features.find((entry) => entry.id === item.id);
    if (!feature || !isScaleFeature(feature)) continue;
    if (feature.kind === "primitive") resizePrimitive(feature, factors);
    else {
      const sketch = editableProfile(document, feature);
      if (!sketch || sketch.profile.shape === "drawn") continue;
      if (sketch.profile.shape === "rectangle") {
        sketch.profile.width *= factors.x;
        sketch.profile.depth *= factors.y;
      } else {
        if (sketch.profile.elliptical) sketch.profile.radius2 = (sketch.profile.radius2 ?? sketch.profile.diameter / 2) * factors.y;
        sketch.profile.diameter *= factors.x;
      }
      feature.distance *= factors.z;
    }
    const delta = item.origin.clone().sub(anchor).multiply(change).applyMatrix3(basis);
    applyParametricSelectionWorldDelta(document, feature.id, "feature", delta);
  }
}
