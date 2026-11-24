import fs from "node:fs";
import path from "node:path";

const wasmSrcDir = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
const wasmDestDir = path.resolve("public/mediapipe/wasm");
const modelsDestDir = path.resolve("public/mediapipe/models");

const MODELS = [
  {
    name: "face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  {
    name: "efficientdet_lite0.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
  },
];

if (fs.existsSync(wasmSrcDir)) {
  fs.mkdirSync(wasmDestDir, { recursive: true });
  for (const file of fs.readdirSync(wasmSrcDir)) {
    const src = path.join(wasmSrcDir, file);
    const dest = path.join(wasmDestDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
  console.log("Copied MediaPipe WASM runtime to public/mediapipe/wasm/");
} else {
  console.warn("MediaPipe wasm directory not found at", wasmSrcDir);
}

async function ensureModels() {
  if (process.env.SKIP_MEDIAPIPE_MODEL_DOWNLOAD === "1") return;
  fs.mkdirSync(modelsDestDir, { recursive: true });

  for (const model of MODELS) {
    const dest = path.join(modelsDestDir, model.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100_000) {
      continue;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(model.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        console.warn(`Could not download ${model.name}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      console.log(`Downloaded MediaPipe model ${model.name} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      console.warn(
        `Skipping download of ${model.name} (offline or unreachable; client will fall back to CDN if needed):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

await ensureModels();
