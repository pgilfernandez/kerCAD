import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParametricViewport } from "@/components/ParametricViewport";

describe("shell context toolbar", () => {
  it.each([false, true])("shows thickness and confirmation enabled=%s", (canAccept) => {
    const markup = renderToStaticMarkup(React.createElement(ParametricViewport, {
      mesh: null,
      color: "#ffffff",
      view: { name: "home", token: 0 },
      locale: "es",
      shellDraft: { thickness: 2.5, cornerType: "sharp" },
      onShellAccept: () => {},
      onShellCancel: () => {},
      shellCanAccept: canAccept,
    }));
    for (const label of ["Espesor", "Aceptar", "Cancelar", "Aristas vivas", "Esquinas redondeadas"]) {
      expect(markup).toContain(`aria-label="${label}"`);
    }
    expect(markup).toContain('value="2.5"');
    expect(markup.includes('class="accept" disabled=""')).toBe(!canAccept);
    expect(markup).not.toContain('aria-label="Añadir"');
    expect(markup).toContain('/assets/kercad/toolbar-horizontal/sharp.svg');
    expect(markup).toContain('/assets/kercad/toolbar-3d/fillet.svg');
    expect(markup).toContain('aria-label="Aristas vivas" aria-pressed="true"');
  });
});
