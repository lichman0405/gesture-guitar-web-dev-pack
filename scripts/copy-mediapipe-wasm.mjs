/**
 * Copies the MediaPipe vision WASM runtime from the npm package into
 * public/vendor/mediapipe-wasm so the app never needs a CDN at runtime.
 * Runs on postinstall; safe to re-run.
 *
 * COMPAT PATCH: the Emscripten loader files are UMD scripts with no ES
 * exports. When tasks-vision's FilesetResolver runs inside an ES-module
 * Web Worker (what Vite serves), importScripts is unavailable and it falls
 * back to dynamic import() — which yields no exports, so the resolver's
 * `self.ModuleFactory` check fails with "ModuleFactory not set." Appending
 * an explicit global assignment to each copied loader fixes the module
 * worker path without touching the classic-worker/script-tag paths.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "vendor", "mediapipe-wasm");

if (!existsSync(src)) {
  console.warn(`[copy-mediapipe-wasm] wasm folder not found at ${src}; skipping.`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

const PATCH = `
;self.ModuleFactory = ModuleFactory;
// The Emscripten loader declares \`function custom_dbg\` inside a nested
// block and calls it outside that block — valid in sloppy mode (script tag,
// importScripts), a ReferenceError in strict ES modules (module workers).
// Pre-defining the global makes the loader's typeof check take the safe path.
if (typeof self.custom_dbg === "undefined") {
  self.custom_dbg = function (text) { console.warn(text); };
}
`;
for (const file of [
  "vision_wasm_internal.js",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_module_internal.js",
]) {
  const target = join(dest, file);
  if (!existsSync(target)) continue;
  if (!readFileSync(target, "utf8").includes("self.ModuleFactory = ModuleFactory")) {
    appendFileSync(target, PATCH);
    console.log(`[copy-mediapipe-wasm] patched ${file} for module-worker loading`);
  }
}
console.log(`[copy-mediapipe-wasm] copied ${src} -> ${dest}`);
