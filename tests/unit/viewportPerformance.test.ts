import { describe, expect, it } from "vitest";
import { AdaptiveViewportResolution } from "@/lib/viewportPerformance";

function frames(controller: AdaptiveViewportResolution, start: number, milliseconds: number, count = 4) {
  controller.recordFrame(start);
  for (let index = 1; index <= count; index += 1) controller.recordFrame(start + milliseconds * index);
}

describe("adaptive viewport resolution", () => {
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
