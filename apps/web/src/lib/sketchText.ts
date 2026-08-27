import { createLocalId } from "@/lib/localIds";
import { parametricTextProfile } from "@/lib/parametricText";
import type { SketchProfile } from "@/types/sketchforge";

export function appendDefaultSketchText(profile: SketchProfile, position: { x: number; z: number }) {
  const id = createLocalId("sketch-text");
  const geometry = parametricTextProfile({ kind: "text", text: "eduCAD", font: "Sans", size: 10, spacing: 0.5, align: "center", verticalAlign: "center" });
  const minX = Math.min(...geometry.points.map((point) => point.x));
  const maxX = Math.max(...geometry.points.map((point) => point.x));
  const minZ = Math.min(...geometry.points.map((point) => point.z));
  const maxZ = Math.max(...geometry.points.map((point) => point.z));
  const points = geometry.points.map((point) => ({ ...point, x: point.x + position.x, z: point.z + position.z, generatedTextId: id }));
  const segments = geometry.segments.map((segment) => ({ ...segment, generatedTextId: id }));
  return {
    ...profile,
    points: [...profile.points, ...points],
    segments: [...profile.segments, ...segments],
    texts: [...(profile.texts ?? []), {
      id,
      text: "eduCAD",
      fontFamily: "sans-serif",
      x: position.x,
      z: position.z,
      height: 10,
      width: maxX - minX,
      depth: maxZ - minZ,
    }],
  };
}

export function moveSketchText(profile: SketchProfile, id: string, position: { x: number; z: number }) {
  const source = profile.texts?.find((text) => text.id === id);
  if (!source) return profile;
  const dx = position.x - source.x;
  const dz = position.z - source.z;
  return {
    ...profile,
    texts: profile.texts?.map((text) => text.id === id ? { ...text, ...position } : text),
    points: profile.points.map((point) => point.generatedTextId === id ? { ...point, x: point.x + dx, z: point.z + dz, handleIn: point.handleIn ? { x: point.handleIn.x + dx, z: point.handleIn.z + dz } : undefined, handleOut: point.handleOut ? { x: point.handleOut.x + dx, z: point.handleOut.z + dz } : undefined } : point),
  };
}

export function deleteSketchText(profile: SketchProfile, id: string) {
  const pointIds = new Set(profile.points.filter((point) => point.generatedTextId === id).map((point) => point.id));
  return {
    ...profile,
    texts: (profile.texts ?? []).filter((text) => text.id !== id),
    points: profile.points.filter((point) => !pointIds.has(point.id)),
    segments: profile.segments.filter((segment) => segment.generatedTextId !== id && !pointIds.has(segment.startId) && !pointIds.has(segment.endId)),
  };
}
