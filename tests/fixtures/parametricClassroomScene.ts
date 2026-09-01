import type { ExtrudeFeature, ParametricDocument, ParametricFeature, SketchFeature } from "@/types/parametric";

const CLASSROOM_COLORS = ["#d41721", "#2878b5", "#378451", "#d18b2c", "#7256aa", "#2b9a9a"];

function sketch(objectId: string, index: number, role: "base" | "hole" | "boss"): SketchFeature {
  const circle = role === "hole" || (role === "base" && index % 2 === 1);
  return {
    id: `classroom-sketch-${index}-${role}`,
    kind: "sketch",
    name: `${role} sketch ${index + 1}`,
    suppressed: false,
    objectId,
    plane: "XY",
    x: 0,
    y: 0,
    offset: 0,
    profile: circle
      ? { shape: "circle", diameter: role === "hole" ? 7 + index % 3 : 22 + index % 5 }
      : { shape: "rectangle", width: role === "boss" ? 9 : 24 + index % 6, depth: role === "boss" ? 8 : 20 + index % 4 },
  };
}

function extrusion(objectId: string, sketchId: string, index: number, role: "base" | "hole" | "boss"): ExtrudeFeature {
  return {
    id: `classroom-extrude-${index}-${role}`,
    kind: "extrude",
    name: `${role} operation ${index + 1}`,
    suppressed: false,
    objectId,
    sketchId,
    distance: role === "hole" ? 30 : role === "boss" ? 6 : 18 + index % 5,
    symmetric: false,
    operation: role === "hole" ? "cut" : "add",
    transform: {
      position: role === "boss" ? { x: 5, y: 3, z: 0 } : { x: 0, y: 0, z: role === "hole" ? -3 : 0 },
      rotation: { x: 0, y: 0, z: role === "boss" ? index * 7 % 45 : 0 },
    },
  };
}

/** A deterministic multi-object project used by CI and local performance runs. */
export function createParametricClassroomScene(objectCount = 12): ParametricDocument {
  const features: ParametricFeature[] = [];
  const objects = Array.from({ length: objectCount }, (_, index) => {
    const objectId = `classroom-object-${index}`;
    for (const role of ["base", "hole", "boss"] as const) {
      const profile = sketch(objectId, index, role);
      features.push(profile, extrusion(objectId, profile.id, index, role));
    }
    return {
      id: objectId,
      name: `Classroom object ${index + 1}`,
      color: CLASSROOM_COLORS[index % CLASSROOM_COLORS.length],
      visible: true,
      locked: false,
      transform: {
        position: { x: (index % 4) * 42 - 63, y: Math.floor(index / 4) * 42 - 42, z: 0 },
        rotation: { x: 0, y: 0, z: index % 3 * 10 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
  });

  return {
    schema: "educad-parametric/v2",
    id: "classroom-performance-scene",
    name: "Classroom performance scene",
    units: "mm",
    color: CLASSROOM_COLORS[0],
    workplane: { width: 240, depth: 180, gridStep: 5, snapSpacing: 5, snapToGrid: true },
    objects,
    features,
    topologyReferences: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}
