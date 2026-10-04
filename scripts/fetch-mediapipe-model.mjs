/**
 * Downloads the MediaPipe HandLandmarker model into public/models/ for
 * fully-local runtime use. Idempotent: skips when the file already exists.
 *
 * Model: hand_landmarker (float16), published by Google on storage.googleapis.com.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "public", "models");
const dest = join(destDir, "hand_landmarker.task");

if (existsSync(dest) && statSync(dest).size > 1_000_000) {
  console.log(`[fetch-mediapipe-model] already present: ${dest} (${statSync(dest).size} bytes)`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
console.log(`[fetch-mediapipe-model] downloading ${MODEL_URL}`);

const res = await fetch(MODEL_URL);
if (!res.ok || !res.body) {
  console.error(`[fetch-mediapipe-model] download failed: HTTP ${res.status}`);
  process.exit(1);
}

await pipeline(res.body, createWriteStream(dest));
console.log(`[fetch-mediapipe-model] saved ${dest} (${statSync(dest).size} bytes)`);
