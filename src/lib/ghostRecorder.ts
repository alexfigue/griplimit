import type { TrackId } from '@/types/types';

/**
 * Grabador y Reproductor 0-GC del Coche Fantasma (Ghost Replay) a 20 Hz.
 * Cada muestra ocupa 4 floats: [elapsedMs, distanceM, lateralOffsetM, driftYawRad].
 */

const SAMPLE_INTERVAL_MS = 50; // 20 Hz
const MAX_SAMPLES_PER_LAP = 1800; // Hasta 90 segundos de vuelta
const FLOATS_PER_SAMPLE = 4;
const GHOST_STORAGE_PREFIX = 'griplimit_ghost_v1_';

export interface SavedGhostLap {
  readonly trackId: TrackId;
  readonly lapTimeMs: number;
  readonly modelPath: string;
  readonly modelYawOffsetRad: number;
  readonly sampleCount: number;
  /** Buffer plano [t0, d0, lat0, yaw0, t1, d1, lat1, yaw1, ...] */
  readonly data: Float32Array;
}

export interface InterpolatedGhostPose {
  distanceM: number;
  lateralOffsetM: number;
  driftYawRad: number;
}

/**
 * Reloj compartido de alta frecuencia (0-GC) entre PhysicsCar y GhostCar
 * para interpolar la posición del fantasma a 60-144 FPS sin pasar por React state.
 */
export const liveLapClock = {
  elapsedMs: 0,
  active: false,
};

const bestGhostMemoryCache: Partial<Record<TrackId, SavedGhostLap>> = {};

/**
 * Buffer de trabajo pre-alojado para grabar la vuelta en curso sin crear arrays en useFrame.
 */
export class ActiveLapGhostBuffer {
  private readonly buffer = new Float32Array(
    MAX_SAMPLES_PER_LAP * FLOATS_PER_SAMPLE
  );
  private count = 0;
  private lastSampleTimeMs = -999;

  public reset(): void {
    this.count = 0;
    this.lastSampleTimeMs = -999;
  }

  public recordSampleIfDue(
    elapsedMs: number,
    distanceM: number,
    lateralOffsetM: number,
    driftYawRad: number
  ): void {
    if (
      this.count >= MAX_SAMPLES_PER_LAP ||
      elapsedMs - this.lastSampleTimeMs < SAMPLE_INTERVAL_MS
    ) {
      return;
    }

    const base = this.count * FLOATS_PER_SAMPLE;
    this.buffer[base] = elapsedMs;
    this.buffer[base + 1] = distanceM;
    this.buffer[base + 2] = lateralOffsetM;
    this.buffer[base + 3] = driftYawRad;

    this.count += 1;
    this.lastSampleTimeMs = elapsedMs;
  }

  public exportSnapshot(
    trackId: TrackId,
    finalLapTimeMs: number,
    distanceAtFinishM: number,
    lateralOffsetM: number,
    modelPath: string,
    modelYawOffsetRad: number
  ): SavedGhostLap {
    // Añadimos muestra exacta de cruce de meta
    if (this.count < MAX_SAMPLES_PER_LAP) {
      const base = this.count * FLOATS_PER_SAMPLE;
      this.buffer[base] = finalLapTimeMs;
      this.buffer[base + 1] = distanceAtFinishM;
      this.buffer[base + 2] = lateralOffsetM;
      this.buffer[base + 3] = 0;
      this.count += 1;
    }

    const copy = new Float32Array(this.count * FLOATS_PER_SAMPLE);
    copy.set(this.buffer.subarray(0, this.count * FLOATS_PER_SAMPLE));

    return {
      trackId,
      lapTimeMs: finalLapTimeMs,
      modelPath,
      modelYawOffsetRad,
      sampleCount: this.count,
      data: copy,
    };
  }
}

export function saveBestGhostForTrack(ghost: SavedGhostLap): void {
  bestGhostMemoryCache[ghost.trackId] = ghost;

  if (typeof window === 'undefined') return;
  try {
    // Guardamos solo si es una carrocería estática (los blob: URLs son efímeros de sesión, usan fallback)
    const persistedPath = ghost.modelPath.startsWith('blob:')
      ? '/cars/aero-saber.glb'
      : ghost.modelPath;
    const payload = {
      lapTimeMs: Math.round(ghost.lapTimeMs),
      modelPath: persistedPath,
      modelYawOffsetRad: ghost.modelYawOffsetRad,
      sampleCount: ghost.sampleCount,
      arr: Array.from(ghost.data, (v) => Number(v.toFixed(2))),
    };
    window.localStorage.setItem(
      `${GHOST_STORAGE_PREFIX}${ghost.trackId}`,
      JSON.stringify(payload)
    );
  } catch {
    // Ignorar límite de cuota de localStorage
  }
}

export function getBestGhostForTrack(trackId: TrackId): SavedGhostLap | null {
  const mem = bestGhostMemoryCache[trackId];
  if (mem) return mem;

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${GHOST_STORAGE_PREFIX}${trackId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      lapTimeMs: number;
      modelPath: string;
      modelYawOffsetRad?: number;
      sampleCount: number;
      arr: number[];
    };
    if (!Array.isArray(parsed.arr) || parsed.sampleCount < 2) return null;

    const hydrated: SavedGhostLap = {
      trackId,
      lapTimeMs: parsed.lapTimeMs,
      modelPath: parsed.modelPath || '/cars/aero-saber.glb',
      modelYawOffsetRad: parsed.modelYawOffsetRad ?? 0,
      sampleCount: parsed.sampleCount,
      data: new Float32Array(parsed.arr),
    };
    bestGhostMemoryCache[trackId] = hydrated;
    return hydrated;
  } catch {
    return null;
  }
}

/**
 * Interpola en O(1) la posición exacta del fantasma para el milisegundo `elapsedMs` de la vuelta.
 */
export function sampleGhostPoseAtTime(
  ghost: SavedGhostLap,
  trackLengthM: number,
  elapsedMs: number,
  out: InterpolatedGhostPose
): boolean {
  if (ghost.sampleCount < 2 || elapsedMs < 0 || elapsedMs > ghost.lapTimeMs) {
    return false;
  }

  const approxIdx = Math.min(
    ghost.sampleCount - 2,
    Math.max(0, Math.floor(elapsedMs / SAMPLE_INTERVAL_MS))
  );

  // Ajuste fino alrededor del índice estimado
  let i = approxIdx;
  while (
    i < ghost.sampleCount - 2 &&
    ghost.data[(i + 1) * FLOATS_PER_SAMPLE] < elapsedMs
  ) {
    i++;
  }
  while (i > 0 && ghost.data[i * FLOATS_PER_SAMPLE] > elapsedMs) {
    i--;
  }

  const b0 = i * FLOATS_PER_SAMPLE;
  const b1 = (i + 1) * FLOATS_PER_SAMPLE;

  const t0 = ghost.data[b0];
  const t1 = ghost.data[b1];
  const alpha = t1 > t0 ? Math.max(0, Math.min(1, (elapsedMs - t0) / (t1 - t0))) : 0;

  const d0 = ghost.data[b0 + 1];
  let d1 = ghost.data[b1 + 1];
  // Evitar salto hacia atrás al cruzar la meta
  if (d1 < d0 - trackLengthM * 0.5) {
    d1 += trackLengthM;
  }

  out.distanceM = (d0 + (d1 - d0) * alpha) % trackLengthM;
  out.lateralOffsetM =
    ghost.data[b0 + 2] + (ghost.data[b1 + 2] - ghost.data[b0 + 2]) * alpha;
  out.driftYawRad =
    ghost.data[b0 + 3] + (ghost.data[b1 + 3] - ghost.data[b0 + 3]) * alpha;

  return true;
}
