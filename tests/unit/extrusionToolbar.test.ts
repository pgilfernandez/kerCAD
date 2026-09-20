import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParametricViewport } from "@/components/ParametricViewport";
import { createExtrudeFeature } from "@/lib/parametricDocument";

const base = { mesh: null, color: "#ffffff", view: { name: "home" as const, token: 0 }, locale: "es" as const };

describe("extrusion context toolbar", () => {
  it("offers signed depth, both modes and confirmation while creating a face extrusion", () => {
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      ...base,
      faceExtrudeDraft: { operation: "cut", distance: 12 },
      onFaceExtrudeAccept: () => {},
      onFaceExtrudeCancel: () => {},
      faceExtrudeCanAccept: true,
    }));
    for (const label of ["Añadir", "Hueco", "Profundidad", "Aceptar", "Cancelar"]) {
      expect(markup).toContain(`aria-label="${label}"`);
    }
    expect(markup).toContain('value="-12"');
    expect(markup).not.toContain('aria-label="Común"');
    expect(markup).not.toContain('class="accept" disabled=""');
  });

  it("disables confirmation until a face is selected", () => {
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      ...base,
      faceExtrudeDraft: { operation: "add", distance: 10 },
      onFaceExtrudeAccept: () => {},
      onFaceExtrudeCancel: () => {},
      faceExtrudeCanAccept: false,
    }));
    expect(markup).toContain('class="accept" disabled=""');
  });

  it("shows the depth of an extrusion from a previous sketch", () => {
    const feature = createExtrudeFeature("sketch", 1, false);
    feature.distance = -24;
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, { ...base, floatingFeature: feature }));
    expect(markup).toContain('aria-label="Profundidad"');
    expect(markup).toContain('value="-24"');
  });
});
