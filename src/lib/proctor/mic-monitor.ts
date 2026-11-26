export interface MicVoiceRuleConfig {
  rmsThreshold: number;
  sustainMs: number;
  cooldownMs: number;
}

export const DEFAULT_MIC_VOICE_CONFIG: MicVoiceRuleConfig = {
  rmsThreshold: 0.08,
  sustainMs: 2_500,
  cooldownMs: 20_000,
};

/**
 * Computes normalized (0..1) RMS energy strictly inside the human speech band (300–3400 Hz)
 * from AnalyserNode byte frequency bins (0..255). Pure & zero DOM/AudioContext dependencies.
 */
export function computeVoiceBandRms(
  freqByteData: ArrayLike<number>,
  sampleRate: number,
  fftSize: number
): number {
  if (!freqByteData || freqByteData.length === 0 || sampleRate <= 0 || fftSize <= 0) {
    return 0;
  }
  const hzPerBin = sampleRate / fftSize;
  const startBin = Math.max(0, Math.ceil(300 / hzPerBin));
  const endBin = Math.min(freqByteData.length - 1, Math.floor(3400 / hzPerBin));
  if (endBin < startBin) return 0;

  let sumSq = 0;
  let count = 0;
  for (let i = startBin; i <= endBin; i++) {
    const norm = Math.max(0, Math.min(1, (freqByteData[i] ?? 0) / 255));
    sumSq += norm * norm;
    count++;
  }
  if (count === 0) return 0;
  return Math.round(Math.sqrt(sumSq / count) * 1000) / 1000;
}

export function rmsToApproxDb(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0.0005) return -60;
  const db = 20 * Math.log10(Math.min(1, rms));
  return Math.max(-60, Math.min(0, Math.round(db)));
}

export interface MicVoiceUpdateResult {
  fired: boolean;
  speaking: boolean;
  durationMs: number;
  peakRms: number;
}

/**
 * Pure debounce + cooldown detector for sustained speaking over the 300–3400Hz band.
 * Audio energy stays strictly in memory — zero recording or upload ever occurs.
 */
export class MicVoiceMonitorEngine {
  private readonly cfg: MicVoiceRuleConfig;
  private speakingSince: number | null = null;
  private peakRms = 0;
  private lastFiredAt: number | null = null;

  constructor(config?: Partial<MicVoiceRuleConfig>) {
    this.cfg = { ...DEFAULT_MIC_VOICE_CONFIG, ...config };
  }

  public reset(): void {
    this.speakingSince = null;
    this.peakRms = 0;
  }

  public update(obs: { t: number; rmsVoiceBand: number }): MicVoiceUpdateResult {
    const { t, rmsVoiceBand } = obs;
    const isSpeaking = rmsVoiceBand >= this.cfg.rmsThreshold;

    if (!isSpeaking) {
      this.speakingSince = null;
      this.peakRms = 0;
      return { fired: false, speaking: false, durationMs: 0, peakRms: 0 };
    }

    if (this.speakingSince === null) {
      this.speakingSince = t;
    }
    this.peakRms = Math.max(this.peakRms, rmsVoiceBand);
    const dur = Math.max(0, t - this.speakingSince);
    const canFire =
      this.lastFiredAt === null || t - this.lastFiredAt >= this.cfg.cooldownMs;

    if (dur >= this.cfg.sustainMs && canFire) {
      this.lastFiredAt = t;
      return {
        fired: true,
        speaking: true,
        durationMs: Math.round(dur),
        peakRms: Math.round(this.peakRms * 1000) / 1000,
      };
    }

    return {
      fired: false,
      speaking: true,
      durationMs: Math.round(dur),
      peakRms: Math.round(this.peakRms * 1000) / 1000,
    };
  }
}
