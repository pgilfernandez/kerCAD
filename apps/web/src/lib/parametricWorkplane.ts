import * as THREE from "three";
import type { ParametricDocument, ParametricObject, ParametricVector3 } from "@/types/parametric";

export type ParametricWorkplane = ParametricDocument["workplane"];
export type StandardParametricPlane = "XY" | "XZ" | "YZ" | "custom";

const EPSILON = 1e-8;

function vector(value: ParametricVector3) {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function point(value: THREE.Vector3): ParametricVector3 {
  const clean = (coordinate: number) => Math.abs(coordinate) < 1e-10 ? 0 : Number(coordinate.toFixed(10));
  return { x: clean(value.x), y: clean(value.y), z: clean(value.z) };
}

function finitePoint(value: unknown, fallback: ParametricVector3) {
  if (!value || typeof value !== "object") return { ...fallback };
  const candidate = value as Partial<ParametricVector3>;
  return [candidate.x, candidate.y, candidate.z].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? { x: candidate.x as number, y: candidate.y as number, z: candidate.z as number }
    : { ...fallback };
}

export function globalParametricWorkplanePlacement() {
  return {
    origin: { x: 0, y: 0, z: 0 },
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
  };
}

export function normalizeParametricWorkplanePlacement(value: unknown) {
  const fallback = globalParametricWorkplanePlacement();
  const candidate = value && typeof value === "object" ? value as Partial<ParametricWorkplane> : {};
  const origin = finitePoint(candidate.origin, fallback.origin);
  let normal = vector(finitePoint(candidate.normal, fallback.normal));
  let xAxis = vector(finitePoint(candidate.xAxis, fallback.xAxis));
  if (normal.lengthSq() < EPSILON) normal = vector(fallback.normal);
  normal.normalize();
  xAxis.projectOnPlane(normal);
  if (xAxis.lengthSq() < EPSILON) {
    xAxis = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
      .map((axis) => axis.projectOnPlane(normal))
      .sort((a, b) => b.lengthSq() - a.lengthSq())[0];
  }
  xAxis.normalize();
  const yAxis = normal.clone().cross(xAxis).normalize();
  return { origin, xAxis: point(xAxis), yAxis: point(yAxis), normal: point(normal) };
}

export function standardParametricWorkplane(
  plane: Exclude<StandardParametricPlane, "custom">,
  origin: ParametricVector3 = { x: 0, y: 0, z: 0 },
) {
  if (plane === "XZ") return { origin: { ...origin }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 0, z: 1 }, normal: { x: 0, y: -1, z: 0 } };
  if (plane === "YZ") return { origin: { ...origin }, xAxis: { x: 0, y: 1, z: 0 }, yAxis: { x: 0, y: 0, z: 1 }, normal: { x: 1, y: 0, z: 0 } };
  return { ...globalParametricWorkplanePlacement(), origin: { ...origin } };
}

export function standardParametricPlane(workplane: Pick<ParametricWorkplane, "xAxis" | "yAxis" | "normal">): StandardParametricPlane {
  const matches = (value: ParametricVector3, expected: ParametricVector3) => Math.abs(value.x - expected.x) < 1e-6 && Math.abs(value.y - expected.y) < 1e-6 && Math.abs(value.z - expected.z) < 1e-6;
  for (const plane of ["XY", "XZ", "YZ"] as const) {
    const candidate = standardParametricWorkplane(plane);
    if (matches(workplane.xAxis, candidate.xAxis) && matches(workplane.yAxis, candidate.yAxis) && matches(workplane.normal, candidate.normal)) return plane;
  }
  return "custom";
}

export function parametricWorkplaneIsGlobal(workplane: Pick<ParametricWorkplane, "origin" | "xAxis" | "yAxis" | "normal">) {
  return standardParametricPlane(workplane) === "XY"
    && Math.abs(workplane.origin.x) < 1e-6
    && Math.abs(workplane.origin.y) < 1e-6
    && Math.abs(workplane.origin.z) < 1e-6;
}

export function parametricWorkplaneFromFace(origin: ParametricVector3, normal: ParametricVector3) {
  const normalVector = vector(normal).normalize();
  const tangentCandidates = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const xAxis = tangentCandidates
    .map((axis) => axis.projectOnPlane(normalVector))
    .sort((a, b) => b.lengthSq() - a.lengthSq())[0]
    .normalize();
  return normalizeParametricWorkplanePlacement({ origin, normal: point(normalVector), xAxis: point(xAxis) });
}

function placementMatrix(placement: Pick<ParametricWorkplane, "origin" | "xAxis" | "yAxis" | "normal">) {
  const matrix = new THREE.Matrix4().makeBasis(vector(placement.xAxis), vector(placement.yAxis), vector(placement.normal));
  matrix.setPosition(vector(placement.origin));
  return matrix;
}

export function parametricTransformMatrix(transform: {
  position: ParametricVector3;
  rotation: ParametricVector3;
  scale?: ParametricVector3;
}) {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(transform.rotation.x),
    THREE.MathUtils.degToRad(transform.rotation.y),
    THREE.MathUtils.degToRad(transform.rotation.z),
    "ZYX",
  ));
  return new THREE.Matrix4().compose(vector(transform.position), quaternion, vector(transform.scale ?? { x: 1, y: 1, z: 1 }));
}

function objectMatrix(object: ParametricObject) {
  return parametricTransformMatrix(object.transform);
}

function decomposePlacement(matrix: THREE.Matrix4) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  // OpenCascade applies our stored rotations X, then Y, then Z. ZYX is the
  // matching Euler decomposition for that matrix product (Rz * Ry * Rx).
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, "ZYX");
  return {
    position: point(position),
    rotation: {
      x: Number(THREE.MathUtils.radToDeg(rotation.x).toFixed(6)),
      y: Number(THREE.MathUtils.radToDeg(rotation.y).toFixed(6)),
      z: Number(THREE.MathUtils.radToDeg(rotation.z).toFixed(6)),
    },
  };
}

export function objectPlacementForWorkplane(workplane: ParametricWorkplane) {
  return decomposePlacement(placementMatrix(workplane));
}

export function operationPlacementForWorkplane(workplane: ParametricWorkplane, object: ParametricObject) {
  return decomposePlacement(objectMatrix(object).invert().multiply(placementMatrix(workplane)));
}
