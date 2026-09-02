import { describe, expect, it } from "vitest";
import { createFilletFeature, createShellFeature, createStarterDocument } from "@/lib/parametricDocument";
import { parametricRebuildSuggestion } from "@/lib/parametricRebuildDiagnostics";

describe("parametric rebuild diagnostics", () => {
  it("prioritizes recovery of vanished topology references", () => {
    const document = createStarterDocument(1);
    const feature = createFilletFeature(document.objects[0].id, 1);
    expect(parametricRebuildSuggestion(feature, "Selected edge no longer exists.")).toBe("rebuild.suggestion.topology");
  });

  it("suggests a smaller thickness for shell failures", () => {
    const document = createStarterDocument(1);
    const feature = createShellFeature(document.objects[0].id, 1);
    expect(parametricRebuildSuggestion(feature, "INVALID_THICKNESS")).toBe("rebuild.suggestion.shell");
  });

  it("identifies an invalid first solid before feature-specific advice", () => {
    const feature = createStarterDocument(1).features.find((candidate) => candidate.kind === "primitive")!;
    expect(parametricRebuildSuggestion(feature, "The first operation in an object must use Add mode.")).toBe("rebuild.suggestion.base");
  });
});
