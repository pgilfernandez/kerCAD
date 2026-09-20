import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParametricViewport } from "@/components/ParametricViewport";

describe("revolve context toolbar", () => {
  it.each([false, true])("shows controls with confirmation enabled=%s", (canAccept) => {
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      mesh: null,
      color: "#ffffff",
      view: { name: "home", token: 0 },
      locale: "es",
      revolveDraft: { operation: "cut", angle: -180 },
      onRevolveAccept: () => {},
      onRevolveCancel: () => {},
      revolveCanAccept: canAccept,
    }));
    for (const label of ["Añadir", "Hueco", "Común", "Ángulo", "Aceptar", "Cancelar"]) {
      expect(markup).toContain(`aria-label="${label}"`);
    }
    expect(markup).toContain('value="-180"');
    expect(markup.includes('class="accept" disabled=""')).toBe(!canAccept);
    expect(markup).toContain('class="mode-cut active"');
  });
});
