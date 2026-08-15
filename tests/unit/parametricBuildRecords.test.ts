import { describe, expect, it } from "vitest";
import { parametricObjectRenderId } from "@/lib/parametricKernel";

describe("parametric object build records", () => {
  it("assigns a stable selectable render id without changing the document id", () => {
    expect(parametricObjectRenderId("object-42")).toBe("object:object-42");
    expect(parametricObjectRenderId("object-42")).toBe(parametricObjectRenderId("object-42"));
    expect(parametricObjectRenderId("object-43")).not.toBe(parametricObjectRenderId("object-42"));
  });
});
