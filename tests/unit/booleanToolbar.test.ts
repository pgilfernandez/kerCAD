import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParametricViewport } from "@/components/ParametricViewport";
import { createObjectBooleanFeature } from "@/lib/parametricDocument";

describe("Boolean operation toolbar", () => {
  it("replaces visibility controls with modes and a source-object selector", () => {
    const feature = createObjectBooleanFeature(1, "tool");
    feature.objectId = "body";
    feature.operation = "cut";
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      mesh: null, color: "#ffffff", view: { name: "home", token: 0 }, locale: "es",
      floatingFeature: feature,
      booleanObjects: [{ id: "body", name: "Body" }, { id: "tool", name: "Tool" }, { id: "other", name: "Other" }],
      manipulatorControls: React.createElement("button", { "aria-label": "Visibility" }),
    }));
    for (const label of ["Añadir", "Hueco", "Común", "Objeto"]) expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).not.toContain('aria-label="Visibility"');
    expect(markup).not.toContain('<option value="body"');
    expect(markup).toContain('<option value="tool" selected="">');
    expect(markup).toContain('<option value="other">');
    expect(markup).toContain('class="mode-cut active"');
  });
});
