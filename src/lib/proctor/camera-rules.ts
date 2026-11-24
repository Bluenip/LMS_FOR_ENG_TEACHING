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
}

export const DEFAULT_CAMERA_RULE_CONFIG: CameraRuleConfig = {
  noFaceDurationMs: 5_000,
  multiFaceDurationMs: 2_000,
  lookAwayDurationMs: 4_000,
  maxYawDeg: 35,
  maxPitchDeg: 25,
  phoneScoreThreshold: 0.5,
  phoneConsecutiveFrames: 2,
  cooldownMs: 30_000,
};

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

  private canFire(type: EmittedCameraEvent["type"], now: number): boolean {
    const prev = this.lastFired.get(type);
    return prev === undefined || now - prev >= this.cfg.cooldownMs;
  }

  public update(obs: CameraFrameObservation): EmittedCameraEvent[] {
    const events: EmittedCameraEvent[] = [];
    const { t, faces, yawDeg, pitchDeg } = obs;

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

    // 3. Looking away / head turned or tilted down (only when exactly 1 face is present)
    const isLookingAway =
      faces === 1 &&
      ((yawDeg !== null && Math.abs(yawDeg) > this.cfg.maxYawDeg) ||
        (pitchDeg !== null && Math.abs(pitchDeg) > this.cfg.maxPitchDeg));

    if (isLookingAway) {
      if (this.lookAwaySince === null) this.lookAwaySince = t;
      const dur = t - this.lookAwaySince;
      if (dur >= this.cfg.lookAwayDurationMs && this.canFire("CAMERA_LOOK_AWAY", t)) {
        this.lastFired.set("CAMERA_LOOK_AWAY", t);
        events.push({
          type: "CAMERA_LOOK_AWAY",
          durationMs: Math.round(dur),
          meta: { faces, yawDeg, pitchDeg },
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
