import { describe, expect, it } from "vitest";
import { AdaptiveViewportResolution, viewportPerformanceOptions, viewportRenderProfile } from "@/lib/viewportPerformance";

function frames(controller: AdaptiveViewportResolution, start: number, milliseconds: number, count = 4) {
  controller.recordFrame(start);
  for (let index = 1; index <= count; index += 1) controller.recordFrame(start + milliseconds * index);
}

describe("adaptive viewport resolution", () => {
  it("keeps antialiasing in normal mode and caps fill cost in optimized mode", () => {
    expect(viewportRenderProfile("normal")).toMatchObject({ antialias: true, shadowMapSize: 1024, shadowMapAutoUpdate: false, physicallyBasedMaterials: true });
    expect(viewportRenderProfile("optimized")).toMatchObject({ antialias: false, shadowMapSize: 512, shadowMapAutoUpdate: false, physicallyBasedMaterials: false });
    expect(new AdaptiveViewportResolution(2, viewportPerformanceOptions("normal")).pixelRatio).toBe(1.5);
    expect(new AdaptiveViewportResolution(2, viewportPerformanceOptions("optimized")).pixelRatio).toBe(1);
  });

  it("keeps an explicitly selected render mode stable during slow interaction", () => {
    const normal = new AdaptiveViewportResolution(2, { ...viewportPerformanceOptions("normal"), sampleFrames: 4 });
    const optimized = new AdaptiveViewportResolution(2, { ...viewportPerformanceOptions("optimized"), sampleFrames: 4 });
    frames(normal, 0, 80);
    frames(optimized, 0, 80);
    expect(normal.pixelRatio).toBe(1.5);
    expect(optimized.pixelRatio).toBe(1);
  });

  it("starts below excessive Retina resolution", () => {
    expect(new AdaptiveViewportResolution(3).pixelRatio).toBe(1.5);
    expect(new AdaptiveViewportResolution(1).pixelRatio).toBe(1);
  });

  it("reduces GPU fill cost aggressively when interaction falls below 20 FPS", () => {
    const controller = new AdaptiveViewportResolution(2, { sampleFrames: 4 });
    frames(controller, 0, 80);
    expect(controller.pixelRatio).toBe(1);
  });

  it("recovers visual resolution after sustained fluid frames", () => {
    const controller = new AdaptiveViewportResolution(2, { sampleFrames: 4 });
    frames(controller, 0, 80);
    frames(controller, 600, 16);
    expect(controller.pixelRatio).toBe(1.125);
  });

  it("does not interpret an idle demand-driven viewport as poor performance", () => {
    const controller = new AdaptiveViewportResolution(2, { sampleFrames: 4 });
    controller.recordFrame(0);
    controller.recordFrame(2000);
    expect(controller.pixelRatio).toBe(1.5);
  });
});
