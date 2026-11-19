import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParametricViewport } from "@/components/ParametricViewport";
import { createLinearPatternFeature, createPolarPatternFeature, createParametricObject } from "@/lib/parametricDocument";
import { patternHandlePlacement } from "@/lib/parametricPatternHandles";

describe("Pattern parameter controls", () => {
  it.each([createLinearPatternFeature(1), createPolarPatternFeature(1)])("shows integer repetitions for $kind", (feature) => {
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      mesh: null, color: "#ffffff", view: { name: "home", token: 0 }, locale: "es", floatingFeature: feature,
    }));
    expect(markup).toContain('aria-label="Repeticiones"');
    expect(markup).toContain('aria-label="Aumentar valor"');
    expect(markup).toContain('aria-label="Disminuir valor"');
    expect(markup).toContain("×");
    if (feature.kind === "linearPattern") expect(markup).not.toContain('aria-label="Eje X"');
  });

  it("shows the polar axis and source without offering unrelated operations", () => {
    const feature = createPolarPatternFeature(1);
    feature.axis = "y";
    feature.source = "feature";
    feature.sourceFeatureId = "source";
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      mesh: null, color: "#ffffff", view: { name: "home", token: 0 }, locale: "es", floatingFeature: feature,
      patternSources: [{ id: "source", name: "Box" }],
    }));
    for (const axis of ["X", "Y", "Z"]) expect(markup).toContain(`aria-label="Eje ${axis}"`);
    expect(markup).toContain('title="Eje Y" aria-pressed="true"');
    expect(markup).toContain('aria-label="Fuente"');
    expect(markup).toContain('<option value="source" selected="">Box</option>');
    expect(markup).toContain('<option value="body">Cuerpo completo</option>');
  });

  it("keeps local distances and axes correct on a moved, rotated and scaled object", () => {
    const object = createParametricObject(1);
    object.transform.position = { x: 12, y: -7, z: 4 };
    object.transform.rotation.z = 90;
    object.transform.scale = { x: 2, y: 3, z: 4 };
    const placement = patternHandlePlacement(object, "x");
    expect(placement.origin).toEqual({ x: 12, y: -7, z: 4 });
    expect(placement.direction.x).toBeCloseTo(0);
    expect(placement.direction.y).toBeCloseTo(1);
    expect(placement.direction.z).toBeCloseTo(0);
    expect(placement.valueScale).toBeCloseTo(2);
    expect(patternHandlePlacement(object, "z").valueScale).toBeCloseTo(4);
  });
});
