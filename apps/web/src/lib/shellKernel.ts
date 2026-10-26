import type { Brep } from "@/lib/brepKernel";
import type { ShellCornerType } from "@/types/parametric";

type OcctKernelOwner = Parameters<Brep["OcctWasmAdapter"]["fromKernel"]>[0];

const SHARP_SHELL_KERNEL = "kercad-shell-sharp";

/** Both adapters share the same shape store; only shell joins differ. */
export function registerShellKernels(brep: Brep, kernel: OcctKernelOwner) {
  brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
  const raw = kernel.getRawKernel() as Record<string, unknown>;
  if (typeof raw.shellSharp !== "function" || typeof raw.shellSharpWithHistory !== "function") {
    throw new Error("The Shell kernel is outdated. Reinstall dependencies and run npm run copy:occt.");
  }
  const sharpRaw = new Proxy(raw, {
    get(target, property) {
      const method = property === "shell" ? "shellSharp" : property === "shellWithHistory" ? "shellSharpWithHistory" : property;
      const value = Reflect.get(target, method, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  // Retain the original owner through these closures so its WASM store lives
  // for both adapters. Native history tracking stays enabled in either mode.
  const sharpOwner = { getRawModule: () => kernel.getRawModule(), getRawKernel: () => sharpRaw };
  brep.registerKernel(SHARP_SHELL_KERNEL, brep.OcctWasmAdapter.fromKernel(sharpOwner));
}

export function shellWithCorners(brep: Brep, shape: Parameters<Brep["shell"]>[0], faces: Parameters<Brep["shell"]>[1], thickness: number, cornerType: ShellCornerType = "rounded") {
  // withKernel restores the previous adapter in finally, including failures.
  return cornerType === "sharp"
    ? brep.withKernel(SHARP_SHELL_KERNEL, () => brep.shell(shape, faces, thickness))
    : brep.shell(shape, faces, thickness);
}
