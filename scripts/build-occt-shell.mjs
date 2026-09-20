// Rebuild the pinned occt-wasm checkout with vendor/occt-wasm-shell/sharp-shell.patch
// already applied. Requires Emscripten 5.0.3 on PATH, CMake and Ninja.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const source = resolve(process.argv[2] ?? ".");
const linkOnly = process.argv.includes("--link-only");
const jobs = process.env.EDUCAD_BUILD_JOBS ?? "4";
const prebuiltLibDir = process.env.EDUCAD_OCCT_LIB_DIR;
function run(command, args, cwd = source) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const flags = "-fwasm-exceptions -O3 -msimd128 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS";
if (!linkOnly) run("emcmake", ["cmake", "-S", "occt", "-B", "occt/build", "-G", "Ninja",
  "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_LIBRARY_TYPE=Static",
  ...["FoundationClasses", "ModelingData", "ModelingAlgorithms", "DataExchange", "ApplicationFramework"].map((name) => `-DBUILD_MODULE_${name}=TRUE`),
  "-DBUILD_MODULE_Visualization=FALSE", "-DBUILD_MODULE_Draw=FALSE", "-DUSE_FREETYPE=OFF",
  "-DUSE_RAPIDJSON=ON", `-D3RDPARTY_RAPIDJSON_INCLUDE_DIR=${join(source, "3rdparty/rapidjson")}`,
  `-DCMAKE_C_FLAGS=${flags}`, `-DCMAKE_CXX_FLAGS=${flags}`, "-Wno-dev"]);
if (!linkOnly && !prebuiltLibDir) run("cmake", ["--build", "occt/build", "--parallel", jobs]);
mkdirSync(join(source, "build"), { recursive: true });
mkdirSync(join(source, "dist"), { recursive: true });
const objects = [];
for (const folder of ["src", "generated"]) {
  for (const name of readdirSync(join(source, "facade", folder)).sort()) {
    if (!name.endsWith(".cpp") || name.startsWith("wasi_")) continue;
    const output = `build/${folder}_${name}.o`;
    if (!linkOnly) run("em++", ["-std=c++17", ...flags.split(" "), "-Ifacade/include", "-Iocct/build/include/opencascade", "-w", "-c", `facade/${folder}/${name}`, "-o", output]);
    objects.push(output);
  }
}
// Match the upstream npm build's library exclusions and legacy exception ABI.
const excluded = new Set(["TKDEIGES", "TKStd", "TKStdL", "TKBin", "TKBinL", "TKBinXCAF", "TKBinTObj", "TKXml", "TKXmlL", "TKXmlXCAF", "TKXmlTObj", "TKTObj", "TKDEVRML", "TKDEOBJ", "TKDEPLY", "TKDECascade", "TKXMesh", "TKFeat", "TKHelix"].map((name) => `lib${name}.a`));
const libDir = prebuiltLibDir ?? join(source, "occt/build/lin32/clang/lib");
const libs = readdirSync(libDir).filter((name) => name.endsWith(".a") && !excluded.has(name)).sort().map((name) => join(libDir, name));
run("em++", ["-lembind", "-fwasm-exceptions", "-msimd128", "-mtail-call", "-O3", "-flto",
  "-sINITIAL_MEMORY=134217728", "-sMAXIMUM_MEMORY=4294967296", "-sALLOW_MEMORY_GROWTH=1",
  "-sEXPORT_ES6=1", "-sEVAL_CTORS=2", "-sWASM_BIGINT", "-sMODULARIZE=1", "-sEXPORT_NAME=createOcctWasm",
  '-sEXPORTED_RUNTIME_METHODS=["FS","HEAP32","HEAPF32","HEAPU32"]', "-sEXPORT_EXCEPTION_HANDLING_HELPERS=1",
  "--no-entry", "--post-js=scripts/symbol_dispose.js", ...objects, ...libs, "-o", "dist/occt-wasm.js"]);
