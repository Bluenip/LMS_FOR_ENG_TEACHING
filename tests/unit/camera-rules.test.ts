import { describe, expect, it } from "vitest";
import {
  CameraRulesEngine,
  extractYawPitchFromMatrix,
} from "@/lib/proctor/camera-rules";

describe("CameraRulesEngine (Layer 2 AI proctoring state machine)", () => {
  it("debounces CAMERA_NO_FACE for 5s and enforces 30s cooldown", () => {
    const engine = new CameraRulesEngine();

    // Transient drop for 3s -> no event
    expect(engine.update({ t: 0, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    expect(engine.update({ t: 3000, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    // Face returns -> resets timer
    expect(engine.update({ t: 3500, faces: 1, yawDeg: 0, pitchDeg: 0 })).toHaveLength(0);

    // Sustained 5s absence -> fires once
    expect(engine.update({ t: 4000, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    expect(engine.update({ t: 8500, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    const fired = engine.update({ t: 9100, faces: 0, yawDeg: null, pitchDeg: null });
    expect(fired).toHaveLength(1);
    expect(fired[0]?.type).toBe("CAMERA_NO_FACE");
    expect(fired[0]?.durationMs).toBeGreaterThanOrEqual(5000);

    // Within 30s cooldown -> does not re-fire
    expect(engine.update({ t: 20000, faces: 0, yawDeg: null, pitchDeg: null })).toHaveLength(0);

    // After 30s cooldown -> fires again
    const refired = engine.update({ t: 39200, faces: 0, yawDeg: null, pitchDeg: null });
    expect(refired).toHaveLength(1);
    expect(refired[0]?.type).toBe("CAMERA_NO_FACE");
  });

  it("detects CAMERA_MULTI_FACE after 2s sustained", () => {
    const engine = new CameraRulesEngine();
    expect(engine.update({ t: 1000, faces: 2, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    expect(engine.update({ t: 2500, faces: 2, yawDeg: null, pitchDeg: null })).toHaveLength(0);
    const evs = engine.update({ t: 3100, faces: 2, yawDeg: null, pitchDeg: null });
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("CAMERA_MULTI_FACE");
    expect(evs[0]?.meta.faces).toBe(2);
  });

  it("detects CAMERA_LOOK_AWAY when yaw > 35° or pitch > 25° for 4s", () => {
    const engine = new CameraRulesEngine();
    expect(engine.update({ t: 0, faces: 1, yawDeg: 42, pitchDeg: 5 })).toHaveLength(0);
    expect(engine.update({ t: 3500, faces: 1, yawDeg: 40, pitchDeg: 5 })).toHaveLength(0);
    const evs = engine.update({ t: 4100, faces: 1, yawDeg: 45, pitchDeg: 5 });
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("CAMERA_LOOK_AWAY");
  });

  it("requires 2 consecutive object-detection hits for CAMERA_PHONE", () => {
    const engine = new CameraRulesEngine();
    // Single hit then miss -> no event
    expect(
      engine.update({ t: 0, faces: 1, yawDeg: 0, pitchDeg: 0, phoneScore: 0.72, objectChecked: true })
    ).toHaveLength(0);
    expect(
      engine.update({ t: 1500, faces: 1, yawDeg: 0, pitchDeg: 0, phoneScore: 0.1, objectChecked: true })
    ).toHaveLength(0);

    // Two consecutive hits -> fires CAMERA_PHONE
    expect(
      engine.update({ t: 3000, faces: 1, yawDeg: 0, pitchDeg: 0, phoneScore: 0.65, objectChecked: true })
    ).toHaveLength(0);
    // Intermediate face-only frame without objectChecked should NOT reset streak
    expect(
      engine.update({ t: 3400, faces: 1, yawDeg: 0, pitchDeg: 0, objectChecked: false })
    ).toHaveLength(0);
    const evs = engine.update({
      t: 4500,
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
