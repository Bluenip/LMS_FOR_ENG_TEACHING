import { describe, expect, it } from "vitest";
import {
  CAMERA_SENSITIVITY_PRESETS,
  CameraRulesEngine,
  estimateIrisGazeFromLandmarks,
  getCameraConfigForSensitivity,
  type LandmarkPoint,
} from "@/lib/proctor/camera-rules";
import {
  computeVoiceBandRms,
  MicVoiceMonitorEngine,
  rmsToApproxDb,
} from "@/lib/proctor/mic-monitor";

function makeIrisLandmarks(opts: {
  leftInnerX?: number;
  leftOuterX?: number;
  leftIrisX?: number;
  rightInnerX?: number;
  rightOuterX?: number;
  rightIrisX?: number;
}): LandmarkPoint[] {
  const lm: LandmarkPoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  // MediaPipe indices: 33 (left outer), 133 (left inner), 468 (left iris)
  lm[33] = { x: opts.leftOuterX ?? 0.3, y: 0.4, z: 0 };
  lm[133] = { x: opts.leftInnerX ?? 0.4, y: 0.4, z: 0 };
  lm[468] = { x: opts.leftIrisX ?? 0.35, y: 0.4, z: 0 };
  // MediaPipe indices: 362 (right inner), 263 (right outer), 473 (right iris)
  lm[362] = { x: opts.rightInnerX ?? 0.6, y: 0.4, z: 0 };
  lm[263] = { x: opts.rightOuterX ?? 0.7, y: 0.4, z: 0 };
  lm[473] = { x: opts.rightIrisX ?? 0.65, y: 0.4, z: 0 };
  return lm;
}

function calibrate(engine: CameraRulesEngine, yawDeg = 0, pitchDeg = 0, until = 3000) {
  for (let t = 0; t <= until; t += 500) {
    engine.update({ t, faces: 1, yawDeg, pitchDeg, gazeXOffset: 0 });
  }
  expect(engine.calibrated).toBe(true);
}

describe("Phase 18 Unit: Camera Sensitivity, Iris Gaze & Mic Voice Monitor", () => {
  it("provides LOW/MEDIUM/HIGH sensitivity presets ordered by strictness", () => {
    expect(CAMERA_SENSITIVITY_PRESETS.LOW.maxYawDeg).toBe(35);
    expect(CAMERA_SENSITIVITY_PRESETS.MEDIUM.maxYawDeg).toBe(25);
    expect(CAMERA_SENSITIVITY_PRESETS.HIGH.maxYawDeg).toBe(18);

    const low = getCameraConfigForSensitivity("LOW");
    const med = getCameraConfigForSensitivity("MEDIUM");
    const high = getCameraConfigForSensitivity("HIGH");

    expect(low.maxYawDeg).toBeGreaterThan(med.maxYawDeg);
    expect(med.maxYawDeg).toBeGreaterThan(high.maxYawDeg);
    expect(low.gazeDeviationThreshold).toBeGreaterThan(high.gazeDeviationThreshold);
    expect(low.phoneScoreThreshold).toBeGreaterThan(high.phoneScoreThreshold);
    expect(high.gazeDurationMs).toBe(2000);
  });

  it("estimateIrisGazeFromLandmarks returns null without iris landmarks and tracks centered/shifted eyes", () => {
    expect(estimateIrisGazeFromLandmarks(Array(468).fill({ x: 0.5, y: 0.5 }))).toBeNull();

    const centered = estimateIrisGazeFromLandmarks(makeIrisLandmarks({}));
    expect(centered).not.toBeNull();
    expect(Math.abs(centered!.gazeXOffset)).toBeLessThan(0.01);

    // Iris shifted toward the higher-X edge (+0.45) on both eyes
    const shiftedRight = estimateIrisGazeFromLandmarks(
      makeIrisLandmarks({ leftIrisX: 0.39, rightIrisX: 0.69 })
    );
    expect(shiftedRight).not.toBeNull();
    expect(shiftedRight!.gazeXOffset).toBeCloseTo(0.4, 2);

    // Iris shifted toward the lower-X edge (-0.4)
    const shiftedLeft = estimateIrisGazeFromLandmarks(
      makeIrisLandmarks({ leftIrisX: 0.31, rightIrisX: 0.61 })
    );
    expect(shiftedLeft).not.toBeNull();
    expect(shiftedLeft!.gazeXOffset).toBeCloseTo(-0.4, 2);
  });

  it("emits CAMERA_GAZE_AWAY after sustained gaze offset without duplicating CAMERA_LOOK_AWAY", () => {
    const engine = new CameraRulesEngine(getCameraConfigForSensitivity("HIGH"));
    calibrate(engine);

    // Sustained iris gaze away while head stays straight (0 deg)
    expect(engine.update({ t: 4000, faces: 1, yawDeg: 0, pitchDeg: 0, gazeXOffset: 0.25 })).toHaveLength(0);
    expect(engine.update({ t: 5500, faces: 1, yawDeg: 0, pitchDeg: 0, gazeXOffset: 0.26 })).toHaveLength(0);
    const evs = engine.update({ t: 6200, faces: 1, yawDeg: 0, pitchDeg: 0, gazeXOffset: 0.28 });
    expect(evs.map((e) => e.type)).toEqual(["CAMERA_GAZE_AWAY"]);

    // Within cooldown -> skipped
    expect(engine.update({ t: 10000, faces: 1, yawDeg: 0, pitchDeg: 0, gazeXOffset: 0.3 })).toHaveLength(0);

    // When head IS already turned beyond maxYawDeg (HIGH: 18 deg), CAMERA_LOOK_AWAY takes precedence (no duplicate CAMERA_GAZE_AWAY)
    engine.update({ t: 30000, faces: 1, yawDeg: 25, pitchDeg: 0, gazeXOffset: 0.35 });
    const lookAwayOnly = engine.update({ t: 32500, faces: 1, yawDeg: 25, pitchDeg: 0, gazeXOffset: 0.35 });
    expect(lookAwayOnly.map((e) => e.type)).toEqual(["CAMERA_LOOK_AWAY"]);
  });

  it("computes voice-band RMS strictly across 300-3400Hz bins and debounces MIC_VOICE in MicVoiceMonitorEngine", () => {
    const fftSize = 1024;
    const sampleRate = 48000;
    const bins = new Uint8Array(fftSize / 2);
    // Low hum below 300Hz (bin 1 ~ 46.9Hz) + high hiss above 3400Hz (bin 150 ~ 7031Hz) should yield 0
    bins[1] = 255;
    bins[150] = 255;
    expect(computeVoiceBandRms(bins, sampleRate, fftSize)).toBe(0);
    expect(rmsToApproxDb(0)).toBe(-60);

    // Put speech energy across ~900-1100Hz harmonic bins -> yields RMS well above 0.08
    bins.fill(0);
    bins[20] = 200;
    bins[21] = 220;
    bins[22] = 200;
    const midRms = computeVoiceBandRms(bins, sampleRate, fftSize);
    expect(midRms).toBeGreaterThan(0.08);
    expect(rmsToApproxDb(midRms)).toBeGreaterThan(-60);

    const micEngine = new MicVoiceMonitorEngine({
      rmsThreshold: 0.08,
      sustainMs: 2500,
      cooldownMs: 20000,
    });

    // Brief 1s speech -> reset on silence
    expect(micEngine.update({ t: 0, rmsVoiceBand: 0.15 }).fired).toBe(false);
    expect(micEngine.update({ t: 1000, rmsVoiceBand: 0.15 }).fired).toBe(false);
    expect(micEngine.update({ t: 1200, rmsVoiceBand: 0.01 }).speaking).toBe(false);

    // Sustained 2.5s speech -> fires once
    expect(micEngine.update({ t: 2000, rmsVoiceBand: 0.2 }).fired).toBe(false);
    expect(micEngine.update({ t: 4000, rmsVoiceBand: 0.22 }).fired).toBe(false);
    const hit = micEngine.update({ t: 4600, rmsVoiceBand: 0.25 });
    expect(hit.fired).toBe(true);
    expect(hit.durationMs).toBeGreaterThanOrEqual(2500);
    expect(hit.peakRms).toBeCloseTo(0.25, 2);

    // Cooldown suppresses immediate second firing
    expect(micEngine.update({ t: 10000, rmsVoiceBand: 0.3 }).fired).toBe(false);
    expect(micEngine.update({ t: 25000, rmsVoiceBand: 0.3 }).fired).toBe(true);
  });
});
