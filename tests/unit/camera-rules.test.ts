import { describe, expect, it } from "vitest";
import {
  CameraRulesEngine,
  estimateHeadPoseFromLandmarks,
  extractYawPitchFromMatrix,
  type LandmarkPoint,
} from "@/lib/proctor/camera-rules";

/** Feeds frontal frames until the engine has learned the neutral pose. */
function calibrate(engine: CameraRulesEngine, yawDeg = 0, pitchDeg = 0, until = 3000) {
  for (let t = 0; t <= until; t += 500) {
    engine.update({ t, faces: 1, yawDeg, pitchDeg });
  }
  expect(engine.calibrated).toBe(true);
}

describe("CameraRulesEngine (Layer 2 AI proctoring state machine)", () => {
  it("debounces CAMERA_NO_FACE for 3s and enforces a 15s cooldown", () => {
    const engine = new CameraRulesEngine();

    // Transient drop for 2s -> no event
    expect(engine.update({ t: 0, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    expect(engine.update({ t: 2000, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    // Face returns -> resets timer
    expect(engine.update({ t: 2500, faces: 1, yawDeg: 0, pitchDeg: 0 })).toHaveLength(0);

    // Sustained 3s absence -> fires once
    expect(engine.update({ t: 3000, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    expect(engine.update({ t: 5500, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    const fired = engine.update({ t: 6100, faces: 0, yawDeg: null, pitchDeg: null });
    expect(fired).toHaveLength(1);
    expect(fired[0]?.type).toBe("CAMERA_NO_FACE");
    expect(fired[0]?.durationMs).toBeGreaterThanOrEqual(3000);

    // Within cooldown -> does not re-fire
    expect(engine.update({ t: 15000, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);

    // After cooldown -> fires again
    const refired = engine.update({ t: 21200, faces: 0, yawDeg: null, pitchDeg: null });
    expect(refired).toHaveLength(1);
    expect(refired[0]?.type).toBe("CAMERA_NO_FACE");
  });

  it("detects CAMERA_MULTI_FACE after 1.5s sustained", () => {
    const engine = new CameraRulesEngine();
    expect(engine.update({ t: 1000, faces: 2, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    expect(engine.update({ t: 2000, faces: 2, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    const evs = engine.update({ t: 2600, faces: 2, yawDeg: null, pitchDeg: null });
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("CAMERA_MULTI_FACE");
    expect(evs[0]?.meta.faces).toBe(2);
  });

  it("does not flag looking away before the neutral pose is calibrated", () => {
    const engine = new CameraRulesEngine();
    // turned away from the very start: never accepted as calibration, never fired
    for (let t = 0; t <= 6000; t += 500) {
      expect(engine.update({ t, faces: 1, yawDeg: 50, pitchDeg: 0 })).toHaveLength(0);
    }
    expect(engine.calibrated).toBe(false);
  });

  it("detects CAMERA_LOOK_AWAY when the head turns > 25° from the calibrated pose for 2.5s", () => {
    const engine = new CameraRulesEngine();
    calibrate(engine);
    expect(engine.update({ t: 4000, faces: 1, yawDeg: 32, pitchDeg: 2 })).toHaveLength(0);
    expect(engine.update({ t: 6000, faces: 1, yawDeg: 34, pitchDeg: 2 })).toHaveLength(0);
    const evs = engine.update({ t: 6600, faces: 1, yawDeg: 35, pitchDeg: 2 });
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("CAMERA_LOOK_AWAY");
    expect(evs[0]?.meta.yawDeg).toBe(35);
  });

  it("judges head angles relative to the student's own neutral pose", () => {
    // camera mounted above the screen: looking at the screen reads as pitch ~ +18°
    const engine = new CameraRulesEngine();
    calibrate(engine, 4, 18);
    expect(engine.deviation(4, 18)).toEqual({ yawDeg: 0, pitchDeg: 0 });
    // normal screen use for a long time -> nothing recorded
    for (let t = 3500; t <= 12000; t += 500) {
      expect(engine.update({ t, faces: 1, yawDeg: 6, pitchDeg: 22 })).toHaveLength(0);
    }
    // looking down at a phone in the lap (pitch +45 => +27 from neutral)
    engine.update({ t: 12500, faces: 1, yawDeg: 4, pitchDeg: 45 });
    const evs = engine.update({ t: 15100, faces: 1, yawDeg: 4, pitchDeg: 45 });
    expect(evs.map((e) => e.type)).toEqual(["CAMERA_LOOK_AWAY"]);
  });

  it("requires 2 consecutive object-detection hits for CAMERA_PHONE (threshold 0.35)", () => {
    const engine = new CameraRulesEngine();
    // Single hit then miss -> no event
    expect(
      engine.update({ t: 0, faces: 1, yawDeg: 0, pitchDeg: 0, phoneScore: 0.42, objectChecked: true })
    ).toHaveLength(0);
    expect(
      engine.update({ t: 700, faces: 1, yawDeg: 0, pitchDeg: 0, phoneScore: 0.1, objectChecked: true })
    ).toHaveLength(0);

    // Two consecutive hits -> fires CAMERA_PHONE
    expect(
      engine.update({ t: 1400, faces: 1, yawDeg: 0, pitchDeg: 0, phoneScore: 0.38, objectChecked: true })
    ).toHaveLength(0);
    // Intermediate face-only frame without objectChecked should NOT reset streak
    expect(
      engine.update({ t: 1800, faces: 1, yawDeg: 0, pitchDeg: 0, objectChecked: false })
    ).toHaveLength(0);
    const evs = engine.update({
      t: 2100,
      faces: 1,
      yawDeg: 0,
      pitchDeg: 0,
      phoneScore: 0.81,
      objectChecked: true,
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("CAMERA_PHONE");
    expect(evs[0]?.meta.phoneScore).toBe(0.81);
  });

  it("extracts yaw & pitch angles from 4x4 transformation matrix", () => {
    // Identity matrix -> 0 deg yaw, 0 deg pitch
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(extractYawPitchFromMatrix(id)).toEqual({ yawDeg: 0, pitchDeg: 0 });

    // 45-deg Y-axis rotation: r00=cos(45), r20=-sin(45) -> yaw = +45 deg
    const rad = Math.PI / 4;
    const rotY = [
      Math.cos(rad), 0, Math.sin(rad), 0,
      0, 1, 0, 0,
      -Math.sin(rad), 0, Math.cos(rad), 0,
      0, 0, 0, 1,
    ];
    const angles = extractYawPitchFromMatrix(rotY);
    expect(angles?.yawDeg).toBeCloseTo(45, 0);
    expect(angles?.pitchDeg).toBeCloseTo(0, 0);
  });
});

describe("estimateHeadPoseFromLandmarks", () => {
  /** Minimal 478-point face: only the five points the estimator reads are meaningful. */
  function face(noseX: number, noseY: number): LandmarkPoint[] {
    const pts: LandmarkPoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    pts[234] = { x: 0.4, y: 0.5 }; // left face edge
    pts[454] = { x: 0.6, y: 0.5 }; // right face edge
    pts[10] = { x: 0.5, y: 0.3 }; // forehead
    pts[152] = { x: 0.5, y: 0.7 }; // chin
    pts[1] = { x: noseX, y: noseY }; // nose tip
    return pts;
  }

  it("is ~0/0 for a frontal face", () => {
    expect(estimateHeadPoseFromLandmarks(face(0.5, 0.52))).toEqual({ yawDeg: 0, pitchDeg: 0 });
  });

  it("reports a large yaw when the nose moves toward a face edge (head turned)", () => {
    const right = estimateHeadPoseFromLandmarks(face(0.58, 0.52))!;
    const left = estimateHeadPoseFromLandmarks(face(0.42, 0.52))!;
    expect(right.yawDeg).toBeGreaterThan(40);
    expect(left.yawDeg).toBeLessThan(-40);
  });

  it("reports pitch when the nose moves toward the chin (looking down)", () => {
    expect(estimateHeadPoseFromLandmarks(face(0.5, 0.6))!.pitchDeg).toBeGreaterThan(25);
  });

  it("returns null without enough landmarks", () => {
    expect(estimateHeadPoseFromLandmarks([])).toBeNull();
    expect(estimateHeadPoseFromLandmarks(null)).toBeNull();
  });
});
