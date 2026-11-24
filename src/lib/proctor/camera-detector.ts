"use client";

import type { FaceLandmarker, ObjectDetector } from "@mediapipe/tasks-vision";
import { extractYawPitchFromMatrix, type CameraFrameObservation } from "./camera-rules";

export interface MockCameraObservation {
  faces: number;
  yawDeg?: number | null;
  pitchDeg?: number | null;
  phoneScore?: number;
  objectChecked?: boolean;
}

declare global {
  interface Window {
    /** Optional E2E test hook to inject deterministic camera observations without GPU/webcam models. */
    __engclassCameraMock?: {
      nextObservation?: () => MockCameraObservation | null;
      observation?: MockCameraObservation | null;
    };
  }
}

const LOCAL_WASM_PATH = "/mediapipe/wasm";
const LOCAL_FACE_MODEL = "/mediapipe/models/face_landmarker.task";
const LOCAL_OBJECT_MODEL = "/mediapipe/models/efficientdet_lite0.tflite";
const FALLBACK_FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const FALLBACK_OBJECT_MODEL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";

async function resolveModelPath(localUrl: string, fallbackUrl: string): Promise<string> {
  try {
    const res = await fetch(localUrl, { method: "HEAD" });
    if (res.ok) return localUrl;
  } catch {
    // ignore
  }
  return fallbackUrl;
}

export class BrowserCameraDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private objectDetector: ObjectDetector | null = null;
  private initialized = false;
  private lastObjectCheckAt = 0;

  public async init(): Promise<void> {
    if (this.initialized) return;

    // Allow deterministic mock mode for automated Playwright tests
    if (typeof window !== "undefined" && window.__engclassCameraMock) {
      this.initialized = true;
      return;
    }

    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);

    const [faceModel, objModel] = await Promise.all([
      resolveModelPath(LOCAL_FACE_MODEL, FALLBACK_FACE_MODEL),
      resolveModelPath(LOCAL_OBJECT_MODEL, FALLBACK_OBJECT_MODEL),
    ]);

    // Prefer GPU delegate, automatically fall back to CPU if WebGL fails
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: faceModel, delegate },
          runningMode: "VIDEO",
          numFaces: 3,
          outputFacialTransformationMatrixes: true,
        });
        break;
      } catch {
        this.faceLandmarker = null;
      }
    }

    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        this.objectDetector = await vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: objModel, delegate },
          runningMode: "VIDEO",
          scoreThreshold: 0.45,
          maxResults: 5,
          categoryAllowlist: ["cell phone", "book", "laptop"],
        });
        break;
      } catch {
        this.objectDetector = null;
      }
    }

    if (!this.faceLandmarker) {
      throw new Error("Could not initialize MediaPipe FaceLandmarker.");
    }

    this.initialized = true;
  }

  public detect(video: HTMLVideoElement, nowMs: number): CameraFrameObservation | null {
    // Test mock hook
    if (typeof window !== "undefined" && window.__engclassCameraMock) {
      const m = window.__engclassCameraMock;
      const obs = m.nextObservation ? m.nextObservation() : m.observation ?? null;
      if (!obs) return null;
      return {
        t: nowMs,
        faces: obs.faces,
        yawDeg: obs.yawDeg ?? 0,
        pitchDeg: obs.pitchDeg ?? 0,
        phoneScore: obs.phoneScore ?? 0,
        objectChecked: obs.objectChecked ?? obs.phoneScore !== undefined,
      };
    }

    if (!this.initialized || !this.faceLandmarker) return null;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const faceRes = this.faceLandmarker.detectForVideo(video, nowMs);
    const faces = faceRes.faceLandmarks?.length ?? 0;

    let yawDeg: number | null = null;
    let pitchDeg: number | null = null;
    if (faces === 1 && faceRes.facialTransformationMatrixes?.[0]?.data) {
      const angles = extractYawPitchFromMatrix(faceRes.facialTransformationMatrixes[0].data);
      if (angles) {
        yawDeg = angles.yawDeg;
        pitchDeg = angles.pitchDeg;
      }
    }

    // Run object detector at a lower cadence (~1.5s) to reduce CPU/GPU usage
    let phoneScore = 0;
    let objectChecked = false;
    if (this.objectDetector && nowMs - this.lastObjectCheckAt >= 1500) {
      this.lastObjectCheckAt = nowMs;
      objectChecked = true;
      try {
        const objRes = this.objectDetector.detectForVideo(video, nowMs);
        for (const det of objRes.detections ?? []) {
          for (const cat of det.categories ?? []) {
            if (cat.categoryName?.toLowerCase() === "cell phone") {
              phoneScore = Math.max(phoneScore, cat.score ?? 0);
            }
          }
        }
      } catch {
        // ignore intermittent detector frame errors
      }
    }

    return {
      t: nowMs,
      faces,
      yawDeg,
      pitchDeg,
      phoneScore,
      objectChecked,
    };
  }

  public dispose(): void {
    try {
      this.faceLandmarker?.close();
    } catch {
      // ignore
    }
    try {
      this.objectDetector?.close();
    } catch {
      // ignore
    }
    this.faceLandmarker = null;
    this.objectDetector = null;
    this.initialized = false;
  }
}
