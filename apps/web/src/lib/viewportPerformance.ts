export type ViewportPerformanceOptions = {
  maximumPixelRatio?: number;
  minimumPixelRatio?: number;
  sampleFrames?: number;
};

export type ViewportRenderQuality = "normal" | "optimized";

export type ViewportRenderProfile = {
  antialias: boolean;
  maximumPixelRatio: number;
  shadowMapSize: number;
  shadowMapAutoUpdate: boolean;
  physicallyBasedMaterials: boolean;
};

export function viewportRenderProfile(quality: ViewportRenderQuality): ViewportRenderProfile {
  return quality === "optimized"
    ? { antialias: false, maximumPixelRatio: 1, shadowMapSize: 512, shadowMapAutoUpdate: false, physicallyBasedMaterials: false }
    : { antialias: true, maximumPixelRatio: 1.5, shadowMapSize: 1024, shadowMapAutoUpdate: false, physicallyBasedMaterials: true };
}

export function viewportPerformanceOptions(quality: ViewportRenderQuality): ViewportPerformanceOptions {
  const profile = viewportRenderProfile(quality);
  return {
    maximumPixelRatio: profile.maximumPixelRatio,
    // Explicit render modes must not visibly change resolution when camera
    // interaction begins. The selected mode owns a fixed pixel-density target.
    minimumPixelRatio: profile.maximumPixelRatio,
  };
}

export class AdaptiveViewportResolution {
  readonly maximumPixelRatio: number;
  readonly minimumPixelRatio: number;
  readonly sampleFrames: number;
  pixelRatio: number;
  private previousFrame: number | null = null;
  private sampledFrames = 0;
  private sampledTime = 0;

  constructor(devicePixelRatio: number, options: ViewportPerformanceOptions = {}) {
    this.maximumPixelRatio = Math.max(1, Math.min(options.maximumPixelRatio ?? 1.5, devicePixelRatio));
    this.minimumPixelRatio = Math.min(this.maximumPixelRatio, Math.max(0.75, options.minimumPixelRatio ?? 0.75));
    this.sampleFrames = Math.max(4, options.sampleFrames ?? 20);
    this.pixelRatio = this.maximumPixelRatio;
  }

  recordFrame(now: number): number | null {
    if (this.previousFrame === null) {
      this.previousFrame = now;
      return null;
    }
    const elapsed = now - this.previousFrame;
    this.previousFrame = now;
    // A demand-driven viewport may be idle for seconds. Such gaps are not slow
    // frames and must not lower the next interaction's resolution.
    if (elapsed <= 0 || elapsed > 150) {
      this.resetSample();
      return null;
    }
    this.sampledFrames += 1;
    this.sampledTime += elapsed;
    if (this.sampledFrames < this.sampleFrames) return null;
    const fps = this.sampledFrames * 1000 / this.sampledTime;
    let next = this.pixelRatio;
    if (fps < 20) next -= 0.5;
    else if (fps < 38) next -= 0.25;
    else if (fps > 54) next += 0.125;
    next = Math.min(this.maximumPixelRatio, Math.max(this.minimumPixelRatio, next));
    this.resetSample();
    if (next === this.pixelRatio) return null;
    this.pixelRatio = next;
    return next;
  }

  private resetSample() {
    this.sampledFrames = 0;
    this.sampledTime = 0;
  }
}
