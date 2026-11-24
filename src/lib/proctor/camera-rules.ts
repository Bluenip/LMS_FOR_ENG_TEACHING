import type { ProctorEventType } from "@prisma/client";

export interface CameraFrameObservation {
  /** Timestamp in ms (monotonic or Date.now()). */
  t: number;
  /** Number of detected faces in the frame. */
  faces: number;
  /** Horizontal head rotation in degrees (0 = straight ahead, >0 / <0 = left/right). */
  yawDeg: number | null;
  /** Vertical head tilt in degrees (0 = level, >0 / <0 = looking down/up). */
  pitchDeg: number | null;
  /** Highest confidence score for `cell phone` in this frame (0 when not checked / not seen). */
  phoneScore?: number;
  /** Whether object detection actually ran on this frame (so phone streak only updates on OD frames). */
  objectChecked?: boolean;
}

export interface CameraRuleConfig {
  noFaceDurationMs: number;
  multiFaceDurationMs: number;
  lookAwayDurationMs: number;
  maxYawDeg: number;
  maxPitchDeg: number;
  phoneScoreThreshold: number;
  phoneConsecutiveFrames: number;
  cooldownMs: number;
  /**
   * How long (ms of single-face frames) to learn the student's own "looking at the screen" pose.
   * Head angles are then judged relative to that baseline, so a camera mounted above/beside the
   * screen does not count as looking away. 0 disables calibration (absolute angles).
   */
  calibrationMs: number;
}

export const DEFAULT_CAMERA_RULE_CONFIG: CameraRuleConfig = {
  noFaceDurationMs: 3_000,
  multiFaceDurationMs: 1_500,
  lookAwayDurationMs: 2_500,
  maxYawDeg: 25,
  maxPitchDeg: 20,
  phoneScoreThreshold: 0.35,
  phoneConsecutiveFrames: 2,
  cooldownMs: 15_000,
  calibrationMs: 3_000,
};

/** Calibration accepts poses up to this angle (webcams are often beside or above the screen). */
const CALIBRATION_MAX_ABS_DEG = 45;

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Rough fallback when no transformation matrix is available: estimates head yaw (left/right) and
 * pitch (up/down) in degrees from the 478 FaceLandmarker points,
 * using where the nose tip sits between the face edges (yaw) and between forehead and chin (pitch).
 * Independent of the transformation-matrix memory layout; ~0/0 when facing the camera.
 */
export function estimateHeadPoseFromLandmarks(
  lm: ArrayLike<LandmarkPoint> | null | undefined
): { yawDeg: number; pitchDeg: number } | null {
  if (!lm || lm.length < 455) return null;
  const nose = lm[1];
  const left = lm[234];
  const right = lm[454];
  const top = lm[10];
  const chin = lm[152];
  if (!nose || !left || !right || !top || !chin) return null;

  const width = right.x - left.x;
  const height = chin.y - top.y;
  if (Math.abs(width) < 1e-4 || Math.abs(height) < 1e-4) return null;

  // 0.5 = nose centred between the face edges; 0 / 1 = full profile
  const hr = (nose.x - left.x) / width;
  // nose tip sits slightly below the face's vertical middle when looking straight ahead
  const vr = (nose.y - top.y) / height;

  const yawDeg = Math.round(toDeg(Math.asin(clamp1((hr - 0.5) * 2))) * 10) / 10;
  const pitchDeg = Math.round(toDeg(Math.asin(clamp1((vr - 0.55) * 2.5))) * 10) / 10;
  if (!Number.isFinite(yawDeg) || !Number.isFinite(pitchDeg)) return null;
  return { yawDeg: yawDeg || 0, pitchDeg: pitchDeg || 0 };
}

export interface EmittedCameraEvent {
  type: Extract<
    ProctorEventType,
    "CAMERA_NO_FACE" | "CAMERA_MULTI_FACE" | "CAMERA_LOOK_AWAY" | "CAMERA_PHONE"
  >;
  durationMs: number;
  meta: {
    faces: number;
    yawDeg?: number | null;
    pitchDeg?: number | null;
    phoneScore?: number;
  };
}

/**
 * Extracts approximate head yaw (left/right) and pitch (up/down) in degrees
 * from MediaPipe's 4x4 facial transformation matrix (row-major or column-major 3x3 rotation block).
 */
export function extractYawPitchFromMatrix(
  matrix: ArrayLike<number> | null | undefined
): { yawDeg: number; pitchDeg: number } | null {
  if (!matrix || matrix.length < 16) return null;
  // MediaPipe FaceLandmarker returns a 4x4 row-major matrix:
  // [ r00 r01 r02 tx
  //   r10 r11 r12 ty
  //   r20 r21 r22 tz
  //   0   0   0   1 ]
  const r00 = matrix[0] ?? 1;
  const r10 = matrix[4] ?? 0;
  const r20 = matrix[8] ?? 0;
  const r21 = matrix[9] ?? 0;
  const r22 = matrix[10] ?? 1;

  const sy = Math.sqrt(r00 * r00 + r10 * r10);
  const radToDeg = 180 / Math.PI;

  const yawRad = Math.atan2(-r20, sy);
  const pitchRad = Math.atan2(r21, r22);

  const yawDeg = Math.round(yawRad * radToDeg * 10) / 10 || 0;
  const pitchDeg = Math.round(pitchRad * radToDeg * 10) / 10 || 0;

  if (!Number.isFinite(yawDeg) || !Number.isFinite(pitchDeg)) return null;
  return { yawDeg, pitchDeg };
}

/**
 * Pure debounce + cooldown state machine for AI camera proctoring.
 * Zero DOM / browser dependencies — fully unit-testable.
 */
export class CameraRulesEngine {
  private readonly cfg: CameraRuleConfig;
  private noFaceSince: number | null = null;
  private multiFaceSince: number | null = null;
  private lookAwaySince: number | null = null;
  private phoneStreak = 0;
  private phoneFirstSeenAt: number | null = null;
  private lastFired = new Map<EmittedCameraEvent["type"], number>();
  private calibYaw: number[] = [];
  private calibPitch: number[] = [];
  private calibStartedAt: number | null = null;
  private baseline: { yawDeg: number; pitchDeg: number } | null = null;

  constructor(config?: Partial<CameraRuleConfig>) {
    this.cfg = { ...DEFAULT_CAMERA_RULE_CONFIG, ...config };
  }

  public reset(): void {
    this.noFaceSince = null;
    this.multiFaceSince = null;
    this.lookAwaySince = null;
    this.phoneStreak = 0;
    this.phoneFirstSeenAt = null;
  }

  /** True once the student's neutral head pose has been learned (or calibration is disabled). */
  public get calibrated(): boolean {
    return this.cfg.calibrationMs <= 0 || this.baseline !== null;
  }

  /** Head angles relative to the calibrated neutral pose (raw angles when calibration is off). */
  public deviation(yawDeg: number | null, pitchDeg: number | null) {
    const b = this.baseline ?? { yawDeg: 0, pitchDeg: 0 };
    return {
      yawDeg: yawDeg === null ? null : Math.round((yawDeg - b.yawDeg) * 10) / 10,
      pitchDeg: pitchDeg === null ? null : Math.round((pitchDeg - b.pitchDeg) * 10) / 10,
    };
  }

  /** Whether this single frame already looks suspicious (for the live status badge). */
  public isSuspicious(obs: CameraFrameObservation): boolean {
    if (obs.faces !== 1) return true;
    if ((obs.phoneScore ?? 0) >= this.cfg.phoneScoreThreshold) return true;
    return this.calibrated && this.isHeadTurned(obs.yawDeg, obs.pitchDeg);
  }

  private isHeadTurned(yawDeg: number | null, pitchDeg: number | null): boolean {
    const d = this.deviation(yawDeg, pitchDeg);
    return (
      (d.yawDeg !== null && Math.abs(d.yawDeg) > this.cfg.maxYawDeg) ||
      (d.pitchDeg !== null && Math.abs(d.pitchDeg) > this.cfg.maxPitchDeg)
    );
  }

  private calibrate(obs: CameraFrameObservation) {
    if (this.calibrated || obs.faces !== 1 || obs.yawDeg === null || obs.pitchDeg === null) return;
    if (Math.abs(obs.yawDeg) > CALIBRATION_MAX_ABS_DEG || Math.abs(obs.pitchDeg) > CALIBRATION_MAX_ABS_DEG) {
      return;
    }
    if (this.calibStartedAt === null) this.calibStartedAt = obs.t;
    this.calibYaw.push(obs.yawDeg);
    this.calibPitch.push(obs.pitchDeg);
    if (obs.t - this.calibStartedAt >= this.cfg.calibrationMs && this.calibYaw.length >= 3) {
      const median = (xs: number[]) => {
        const a = [...xs].sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)] ?? 0;
      };
      this.baseline = { yawDeg: median(this.calibYaw), pitchDeg: median(this.calibPitch) };
    }
  }

  private canFire(type: EmittedCameraEvent["type"], now: number): boolean {
    const prev = this.lastFired.get(type);
    return prev === undefined || now - prev >= this.cfg.cooldownMs;
  }

  public update(obs: CameraFrameObservation): EmittedCameraEvent[] {
    const events: EmittedCameraEvent[] = [];
    const { t, faces, yawDeg, pitchDeg } = obs;
    this.calibrate(obs);

    // 1. No face
    if (faces === 0) {
      if (this.noFaceSince === null) this.noFaceSince = t;
      const dur = t - this.noFaceSince;
      if (dur >= this.cfg.noFaceDurationMs && this.canFire("CAMERA_NO_FACE", t)) {
        this.lastFired.set("CAMERA_NO_FACE", t);
        events.push({
          type: "CAMERA_NO_FACE",
          durationMs: Math.round(dur),
          meta: { faces: 0 },
        });
      }
    } else {
      this.noFaceSince = null;
    }

    // 2. Multiple faces
    if (faces >= 2) {
      if (this.multiFaceSince === null) this.multiFaceSince = t;
      const dur = t - this.multiFaceSince;
      if (dur >= this.cfg.multiFaceDurationMs && this.canFire("CAMERA_MULTI_FACE", t)) {
        this.lastFired.set("CAMERA_MULTI_FACE", t);
        events.push({
          type: "CAMERA_MULTI_FACE",
          durationMs: Math.round(dur),
          meta: { faces },
        });
      }
    } else {
      this.multiFaceSince = null;
    }

    // 3. Looking away / head turned or tilted down, relative to the calibrated neutral pose
    //    (only when exactly 1 face is present and calibration has finished)
    const isLookingAway = faces === 1 && this.calibrated && this.isHeadTurned(yawDeg, pitchDeg);

    if (isLookingAway) {
      if (this.lookAwaySince === null) this.lookAwaySince = t;
      const dur = t - this.lookAwaySince;
      if (dur >= this.cfg.lookAwayDurationMs && this.canFire("CAMERA_LOOK_AWAY", t)) {
        this.lastFired.set("CAMERA_LOOK_AWAY", t);
        events.push({
          type: "CAMERA_LOOK_AWAY",
          durationMs: Math.round(dur),
          meta: { faces, ...this.deviation(yawDeg, pitchDeg) },
        });
      }
    } else {
      this.lookAwaySince = null;
    }

    // 4. Cell phone detection (requires consecutive object-detection hits)
    if (obs.objectChecked ?? obs.phoneScore !== undefined) {
      const score = obs.phoneScore ?? 0;
      if (score >= this.cfg.phoneScoreThreshold) {
        if (this.phoneStreak === 0) this.phoneFirstSeenAt = t;
        this.phoneStreak++;
        if (
          this.phoneStreak >= this.cfg.phoneConsecutiveFrames &&
          this.canFire("CAMERA_PHONE", t)
        ) {
          this.lastFired.set("CAMERA_PHONE", t);
          events.push({
            type: "CAMERA_PHONE",
            durationMs: this.phoneFirstSeenAt !== null ? Math.round(t - this.phoneFirstSeenAt) : 0,
            meta: { faces, phoneScore: Math.round(score * 100) / 100 },
          });
        }
      } else {
        this.phoneStreak = 0;
        this.phoneFirstSeenAt = null;
      }
    }

    return events;
  }
}
