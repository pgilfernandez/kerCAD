import { describe, expect, it } from "vitest";
import { parametricOperationCatalog, parametricOperationDefinition } from "@/lib/parametricOperationCatalog";

describe("parametric operation catalog", () => {
  it("defines every primitive once with three visually distinct boolean roles", () => {
    expect(new Set(parametricOperationCatalog.map((definition) => definition.kind)).size).toBe(parametricOperationCatalog.length);
    for (const definition of parametricOperationCatalog) {
      const roles = Object.values(definition.roles);
      expect(new Set(roles.map((role) => role.iconId)).size).toBe(3);
      expect(new Set(roles.map((role) => role.color)).size).toBe(3);
    }
  });

  it("provides bounded editable dimensions for the exact sphere or ellipsoid", () => {
    const definition = parametricOperationDefinition("sphere");

    expect(definition.parameters.map((parameter) => parameter.key)).toEqual(["radius"]);
    for (const parameter of definition.parameters) {
      expect(parameter.min).toBeLessThan(parameter.defaultValue);
      expect(parameter.defaultValue).toBeLessThan(parameter.max);
      expect(parameter.step).toBeGreaterThan(0);
    }
  });

  it("defines an exact cone that can also become a frustum", () => {
    const definition = parametricOperationDefinition("cone");

    expect(definition.parameters.map((parameter) => parameter.key)).toEqual(["baseRadius", "topRadius", "height"]);
    expect(definition.parameters.find((parameter) => parameter.key === "topRadius")).toMatchObject({ min: 0, defaultValue: 0 });
  });

  it("defines an exact tube by its two radii and height", () => {
    const definition = parametricOperationDefinition("tube");

    expect(definition.parameters.map((parameter) => parameter.key)).toEqual(["outerRadius", "innerRadius", "height"]);
    expect(definition.parameters.find((parameter) => parameter.key === "innerRadius")?.defaultValue)
      .toBeLessThan(definition.parameters.find((parameter) => parameter.key === "outerRadius")!.defaultValue);
  });

  it("defines a half sphere with independent radius and height", () => {
    const definition = parametricOperationDefinition("halfSphere");

    expect(definition.parameters.map((parameter) => parameter.key)).toEqual(["radius", "height"]);
    expect(definition.parameters.map((parameter) => parameter.defaultValue)).toEqual([10, 10]);
  });

  it("defines an exact torus by its major and tube radii", () => {
    const definition = parametricOperationDefinition("torus");

    expect(definition.parameters.map((parameter) => parameter.key)).toEqual(["majorRadius", "tubeRadius"]);
    expect(definition.parameters.map((parameter) => parameter.defaultValue)).toEqual([12, 4]);
    expect(definition.parameters.map((parameter) => parameter.label)).toEqual(["Radio", "Espesor"]);
  });

  it.each([
    ["pyramid", ["width", "depth", "height"]],
    ["wedge", ["width", "depth", "height"]],
    ["roof", ["width", "depth", "height"]],
    ["roundRoof", ["width", "depth", "height"]],
  ] as const)("defines the remaining exact %s primitive", (kind, keys) => {
    const parameters = parametricOperationDefinition(kind).parameters;
    expect(parameters.map((parameter) => parameter.key)).toEqual(keys);
    expect(parameters.map((parameter) => parameter.label)).toEqual(["Ancho", "Largo", "Altura"]);
  });
});
