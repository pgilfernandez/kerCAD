import { describe, expect, it } from "vitest";
import { captureChallengeParameters } from "@/lib/challengeParameterCapture";
import { createEmptyDocument, createParametricObject, createPrimitiveFeature, createSketchFeature, createExtrudeFeature, createShellFeature, createFilletFeature, createPolarPatternFeature } from "@/lib/parametricDocument";

function cylinder() {
  const document = createEmptyDocument();
  const object = createParametricObject(1);
  const sketch = createSketchFeature("circle", 1);
  sketch.objectId = object.id;
  sketch.profile = { shape: "circle", diameter: 18 };
  const extrude = createExtrudeFeature(sketch.id, 1, false);
  extrude.objectId = object.id;
  extrude.distance = 32;
  document.objects = [object];
  document.features = [sketch, extrude];
  return { document, object, sketch, extrude };
}

describe("challenge parameter capture", () => {
  it("captures a cylinder's radius and height, without zero transforms or internal profile duplicates", () => {
    const { document, object, extrude } = cylinder();
    const expected = [{ label: "Radius", value: "9 mm" }, { label: "Height", value: "32 mm" }];
    expect(captureChallengeParameters(document, { kind: "object", id: object.id }, "en")).toEqual(expected);
    expect(captureChallengeParameters(document, { kind: "feature", id: extrude.id }, "en")).toEqual(expected);
  });

  it("captures only nonzero transform components and distinguishes object and operation placement", () => {
    const { document, object, extrude } = cylinder();
    object.transform.position.x = -10;
    object.transform.rotation.z = 45;
    extrude.transform.position.y = 7;
    extrude.transform.rotation.x = 12.5;
    const objectValues = captureChallengeParameters(document, { kind: "object", id: object.id }, "en");
    expect(objectValues.slice(2)).toEqual([
      { label: `${extrude.name} · Position Y`, value: "7 mm" },
      { label: `${extrude.name} · Rotation X`, value: "12.5 °" },
      { label: "Position X", value: "-10 mm" },
      { label: "Rotation Z", value: "45 °" },
    ]);
    expect(captureChallengeParameters(document, { kind: "feature", id: extrude.id }, "en").slice(2)).toEqual([
      { label: "Position Y", value: "7 mm" }, { label: "Rotation X", value: "12.5 °" },
    ]);
  });

  it("captures tube wall thickness and meaningful primitive parameters rather than raw storage fields", () => {
    const document = createEmptyDocument();
    const tube = createPrimitiveFeature("tube", 1);
    tube.width = 30;
    tube.innerRadius = 11;
    tube.height = 25;
    document.features = [tube];
    expect(captureChallengeParameters(document, { kind: "feature", id: tube.id }, "en")).toEqual([
      { label: "Radius", value: "15 mm" }, { label: "Thickness", value: "4 mm" }, { label: "Height", value: "25 mm" },
    ]);
    const gear = createPrimitiveFeature("gear", 1);
    document.features = [gear];
    const gearValues = captureChallengeParameters(document, { kind: "feature", id: gear.id }, "en");
    expect(gearValues.find(value => value.label === "Teeth")?.value).toBe("12");
    expect(gearValues.find(value => value.label === "Bore radius")?.value).toBe("3 mm");
  });

  it("captures operation-specific dimensions and distinguishes operations of a compound object", () => {
    const { document, object, extrude } = cylinder();
    const shell = createShellFeature(1);
    shell.objectId = object.id;
    shell.thickness = 1.5;
    const chamfer = createFilletFeature(1, "chamfer");
    chamfer.objectId = object.id;
    chamfer.radius = 2;
    document.features.push(shell, chamfer);
    const values = captureChallengeParameters(document, { kind: "object", id: object.id }, "en");
    expect(values).toContainEqual({ label: `${extrude.name} · Radius`, value: "9 mm" });
    expect(values).toContainEqual({ label: `${shell.name} · Thickness`, value: "1.5 mm" });
    expect(values).toContainEqual({ label: `${chamfer.name} · Distance`, value: "2 mm" });
    expect(captureChallengeParameters(document, { kind: "feature", id: shell.id }, "en")).toEqual([{ label: "Thickness", value: "1.5 mm" }]);
  });

  it("uses display units and locale for lengths but keeps angles and counts in their own units", () => {
    const { document, object } = cylinder();
    document.displayUnit = "cm";
    object.transform.rotation.z = 22.5;
    const before = structuredClone(document);
    expect(captureChallengeParameters(document, { kind: "object", id: object.id }, "es")).toEqual([
      { label: "Radio", value: "0,9 cm" }, { label: "Altura", value: "3,2 cm" }, { label: "Rotación Z", value: "22,5 °" },
    ]);
    expect(document).toEqual(before);
    const pattern = createPolarPatternFeature(1);
    pattern.center = { x: 15, y: 0, z: 0 };
    document.features.push(pattern);
    expect(captureChallengeParameters(document, { kind: "feature", id: pattern.id }, "en")).toContainEqual({ label: "Rotation center X", value: "1.5 cm" });
  });

  it("handles missing selections, suppressed operations and numerical noise without capturing invalid values", () => {
    const { document, object, extrude } = cylinder();
    expect(captureChallengeParameters(document, null, "en")).toEqual([]);
    expect(captureChallengeParameters(document, { kind: "object", id: "missing" }, "en")).toEqual([]);
    extrude.suppressed = true;
    expect(captureChallengeParameters(document, { kind: "feature", id: extrude.id }, "en")).toEqual([]);
    extrude.suppressed = false;
    object.transform.position.z = 1e-12;
    object.transform.rotation.x = NaN;
    expect(captureChallengeParameters(document, { kind: "object", id: object.id }, "en")).toHaveLength(2);
  });
});
