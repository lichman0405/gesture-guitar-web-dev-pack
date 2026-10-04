/**
 * Copies the MediaPipe vision WASM runtime from the npm package into
 * public/vendor/mediapipe-wasm so the app never needs a CDN at runtime.
 * Runs on postinstall; safe to re-run.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
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
console.log(`[copy-mediapipe-wasm] copied ${src} -> ${dest}`);
