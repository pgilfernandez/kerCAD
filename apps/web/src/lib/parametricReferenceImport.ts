import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { colorForNewParametricObject } from "@/lib/parametricObjects";
import { createParametricObject } from "@/lib/parametricDocument";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import type { ParametricDocument, ParametricObjectRenderRecord } from "@/types/parametric";
import { assertImportByteLimit, PARAMETRIC_IMPORT_LIMITS } from "@/lib/parametricImportLimits";

function triangleSoupFromGeometry(source: THREE.BufferGeometry) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const positions: number[] = [];
  const normals: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    positions.push(position.getX(index), position.getY(index), position.getZ(index));
    normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
  }
  geometry.dispose();
  return { positions, normals };
}

function parseReferenceMesh(sourceName: string, buffer: ArrayBuffer) {
  const format = sourceName.toLowerCase().endsWith(".obj") ? "obj" as const : "stl" as const;
  const soups: Array<{ positions: number[]; normals: number[] }> = [];
  if (format === "stl") {
    soups.push(triangleSoupFromGeometry(new STLLoader().parse(buffer)));
  } else {
    const root = new OBJLoader().parse(new TextDecoder().decode(buffer));
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) return;
      const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
      soups.push(triangleSoupFromGeometry(geometry));
      geometry.dispose();
    });
  }
  const positions = soups.flatMap((item) => item.positions);
  const normals = soups.flatMap((item) => item.normals);
  if (positions.length < 9) throw new Error(`El archivo ${format.toUpperCase()} no contiene triángulos.`);
  if (positions.length / 9 > PARAMETRIC_IMPORT_LIMITS.referenceTriangles) throw new Error(`La referencia supera el límite de ${PARAMETRIC_IMPORT_LIMITS.referenceTriangles.toLocaleString("es-ES")} triángulos.`);
  if (positions.some((value) => !Number.isFinite(value)) || normals.some((value) => !Number.isFinite(value))) throw new Error(`El archivo ${format.toUpperCase()} contiene coordenadas no válidas.`);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) throw new Error(`No se pudo calcular el tamaño del ${format.toUpperCase()}.`);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] -= centerX;
    positions[index + 1] -= centerY;
    positions[index + 2] -= bounds.min.z;
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
  const edgeAttribute = edgeGeometry.getAttribute("position");
  const edges = Array.from(edgeAttribute.array as ArrayLike<number>);
  edgeGeometry.dispose();
  geometry.dispose();
  return { format, positions, normals, edges };
}

export function importReferenceMesh(document: ParametricDocument, sourceName: string, buffer: ArrayBuffer, random = Math.random) {
  assertImportByteLimit("referencia", buffer.byteLength);
  const parsed = parseReferenceMesh(sourceName, buffer);
  const object = createParametricObject(document.objects.length + 1);
  object.name = sourceName.replace(/\.(?:stl|obj)$/i, "") || `Referencia ${parsed.format.toUpperCase()}`;
  object.color = colorForNewParametricObject(document, random);
  object.referenceMesh = { sourceName, ...parsed, opacity: 0.4, displayMode: "solidEdges", pickable: true };
  document.objects.push(object);
  return object.id;
}

export function parametricReferenceRenderRecords(document: ParametricDocument): ParametricObjectRenderRecord[] {
  return document.objects.flatMap((object) => {
    const reference = object.referenceMesh;
    if (!reference || !object.visible) return [];
    const matrix = parametricTransformMatrix(object.transform);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const positions = new Float32Array(reference.positions.length);
    const normals = new Float32Array(reference.normals.length);
    const edges = new Float32Array(reference.edges.length);
    const point = new THREE.Vector3();
    const bounds = new THREE.Box3();
    for (let index = 0; index < reference.positions.length; index += 3) {
      point.set(reference.positions[index], reference.positions[index + 1], reference.positions[index + 2]).applyMatrix4(matrix);
      positions[index] = point.x; positions[index + 1] = point.y; positions[index + 2] = point.z;
      bounds.expandByPoint(point);
      point.set(reference.normals[index], reference.normals[index + 1], reference.normals[index + 2]).applyMatrix3(normalMatrix).normalize();
      normals[index] = point.x; normals[index + 1] = point.y; normals[index + 2] = point.z;
    }
    for (let index = 0; index < reference.edges.length; index += 3) {
      point.set(reference.edges[index], reference.edges[index + 1], reference.edges[index + 2]).applyMatrix4(matrix);
      edges[index] = point.x; edges[index + 1] = point.y; edges[index + 2] = point.z;
    }
    const indices = Uint32Array.from({ length: positions.length / 3 }, (_, index) => index);
    const size = bounds.getSize(new THREE.Vector3());
    return [{
      objectId: object.id,
      renderId: `reference:${object.id}`,
      geometryFingerprint: JSON.stringify([reference.sourceName, reference.opacity, reference.displayMode, reference.pickable, object.locked, object.transform]),
      color: object.color,
      worldTransform: object.transform,
      mesh: { positions, normals, indices, edges, metrics: { width: size.x, depth: size.y, height: size.z, volume: 0 } },
      reference: { opacity: reference.opacity, displayMode: reference.displayMode, pickable: reference.pickable && !object.locked },
    }];
  });
}
