'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CarModel, type CarVisualMotionState } from '@/components/canvas/CarModel';
import {
  computeCornerLimitSpeedMs,
  computeEffectiveLaneRadius,
  evaluateSplineKinematics,
  getLaneLateralOffsetM,
  getTrackCurve,
  getTrackLUT,
  sampleTrackLUTNode,
  type SplineKinematicsResult,
} from '@/lib/montmeloSpline';
import { soundEngine } from '@/lib/soundEngine';
import { useGarageStore, useTelemetryStore } from '@/store/store';
import type { GridStandingRow, LaneId, TrackId } from '@/types/types';

export interface BossProfile {
  readonly driverId: string;
  readonly name: string;
  readonly cupTitle: string;
  readonly defaultModelPath: string;
  readonly altModelPath: string;
  readonly defaultYawRad: number;
  readonly altYawRad: number;
  readonly maxSpeedMs: number;
  readonly accelMs2: number;
  readonly cornerAggression: number;
  readonly canOverpushUnderPressure: boolean;
}

export const CUP_BOSS_BY_TRACK: Record<TrackId, BossProfile> = {
  montmelo: {
    driverId: 'ai-1',
    name: 'Kai · Huracán GT3',
    cupTitle: 'GP Catalunya · 3 Vueltas',
    defaultModelPath: '/cars/lambo-razor-pro.glb',
    altModelPath: '/cars/lemans-apogee-pro.glb',
    defaultYawRad: 0,
    altYawRad: 0,
    maxSpeedMs: 186 / 3.6,
    accelMs2: 12.8,
    cornerAggression: 0.92,
    canOverpushUnderPressure: false,
  },
  'sierra-seca': {
    driverId: 'ai-2',
    name: 'Mako · Senna GTR',
    cupTitle: 'GP Sierra Seca · 3 Vueltas',
    defaultModelPath: '/cars/hyper-specter-pro.glb',
    altModelPath: '/cars/gt3-enduro-pro.glb',
    defaultYawRad: 0,
    altYawRad: 0,
    maxSpeedMs: 194 / 3.6,
    accelMs2: 13.8,
    cornerAggression: 0.96,
    canOverpushUnderPressure: false,
  },
  'neo-wangan': {
    driverId: 'ai-3',
    name: 'Viktor · Skyline R34',
    cupTitle: 'GP Shuto C1 · 3 Vueltas',
    defaultModelPath: '/cars/skyline-kaido-pro.glb',
    altModelPath: '/cars/f1-monoposto-pro.glb',
    defaultYawRad: 0,
    altYawRad: 0,
    maxSpeedMs: 204 / 3.6,
    accelMs2: 14.8,
    cornerAggression: 0.985,
    canOverpushUnderPressure: true,
  },
  'spa-ardennes': {
    driverId: 'ai-1',
    name: 'Thierry · LeMans LMP1',
    cupTitle: 'GP Spa-Ardennes · 3 Vueltas',
    defaultModelPath: '/cars/lemans-apogee-pro.glb',
    altModelPath: '/cars/gt3-enduro-pro.glb',
    defaultYawRad: 0,
    altYawRad: 0,
    maxSpeedMs: 202 / 3.6,
    accelMs2: 14.2,
    cornerAggression: 0.965,
    canOverpushUnderPressure: true,
  },
  'monaco-harbor': {
    driverId: 'ai-2',
    name: 'Charles · F1 Monoposto',
    cupTitle: 'GP Monaco Harbor · 3 Vueltas',
    defaultModelPath: '/cars/f1-monoposto-pro.glb',
    altModelPath: '/cars/hyper-specter-pro.glb',
    defaultYawRad: 0,
    altYawRad: 0,
    maxSpeedMs: 196 / 3.6,
    accelMs2: 14.6,
    cornerAggression: 0.975,
    canOverpushUnderPressure: true,
  },
  'suzuka-eight': {
    driverId: 'ai-3',
    name: 'Kenji · NSX Touge GT',
    cupTitle: 'GP Suzuka 8-Ring · 3 Vueltas',
    defaultModelPath: '/cars/jdm-touge-pro.glb',
    altModelPath: '/cars/skyline-kaido-pro.glb',
    defaultYawRad: 0,
    altYawRad: 0,
    maxSpeedMs: 200 / 3.6,
    accelMs2: 14.4,
    cornerAggression: 0.98,
    canOverpushUnderPressure: true,
  },
};

export const GRAND_PRIX_AI_ROSTER: readonly BossProfile[] = [
  CUP_BOSS_BY_TRACK['neo-wangan'], // P1 Pole: Viktor · Skyline R34
  CUP_BOSS_BY_TRACK['sierra-seca'], // P2: Mako · Senna GTR
  CUP_BOSS_BY_TRACK.montmelo, // P3: Kai · Huracán GT3
];

export interface LiveAiCarUnit {
  driverId: string;
  name: string;
  active: boolean;
  lane: LaneId;
  lateralOffsetM: number;
  startGridOffsetM: number;
  distanceM: number;
  lapCount: number;
  totalDistanceM: number;
  speedMs: number;
  isDerailed: boolean;
  derailTimerSec: number;
  pressureAccumulatorSec: number;
  laneSwitchCooldownSec: number;
}

/** Estado 0-GC del rival principal para compatibilidad directa */
export const liveRivalState = {
  distanceM: 0,
  lapCount: 1,
  totalDistanceM: 0,
  speedMs: 0,
  isDerailed: false,
  bossName: CUP_BOSS_BY_TRACK.montmelo.name,
  cupTitle: CUP_BOSS_BY_TRACK.montmelo.cupTitle,
};

/** Parrilla activa de hasta 3 rivales IA (P1, P2, P3 en parrilla de 4 coches) */
export const liveRivalGridState: LiveAiCarUnit[] = [
  {
    driverId: 'ai-3',
    name: 'Viktor · Skyline R34',
    active: false,
    lane: 'right',
    lateralOffsetM: getLaneLateralOffsetM('right'),
    startGridOffsetM: 10.5,
    distanceM: 10.5,
    lapCount: 1,
    totalDistanceM: 10.5,
    speedMs: 0,
    isDerailed: false,
    derailTimerSec: 0,
    pressureAccumulatorSec: 0,
    laneSwitchCooldownSec: 0,
  },
  {
    driverId: 'ai-2',
    name: 'Mako · Senna GTR',
    active: false,
    lane: 'left',
    lateralOffsetM: getLaneLateralOffsetM('left'),
    startGridOffsetM: 7.0,
    distanceM: 7.0,
    lapCount: 1,
    totalDistanceM: 7.0,
    speedMs: 0,
    isDerailed: false,
    derailTimerSec: 0,
    pressureAccumulatorSec: 0,
    laneSwitchCooldownSec: 0,
  },
  {
    driverId: 'ai-1',
    name: 'Kai · Huracán GT3',
    active: false,
    lane: 'right',
    lateralOffsetM: getLaneLateralOffsetM('right'),
    startGridOffsetM: 3.5,
    distanceM: 3.5,
    lapCount: 1,
    totalDistanceM: 3.5,
    speedMs: 0,
    isDerailed: false,
    derailTimerSec: 0,
    pressureAccumulatorSec: 0,
    laneSwitchCooldownSec: 0,
  },
];

export const livePlayerProgress = {
  distanceM: 0,
  lapCount: 1,
  totalDistanceM: 0,
  lateralOffsetM: getLaneLateralOffsetM('left'),
  lane: 'left' as LaneId,
  isDerailed: false,
};

/** Calcula la clasificación en vivo P1..P4 (o P1..P2) ordenando por distancia total */
export function buildLiveGridStandings(): GridStandingRow[] {
  const entries: {
    driverId: string;
    name: string;
    isPlayer: boolean;
    lapCount: number;
    totalDistanceM: number;
    lane: LaneId;
    isDerailed: boolean;
  }[] = [
    {
      driverId: 'player',
      name: 'Tú (Piloto)',
      isPlayer: true,
      lapCount: livePlayerProgress.lapCount,
      totalDistanceM: livePlayerProgress.totalDistanceM,
      lane: livePlayerProgress.lane,
      isDerailed: livePlayerProgress.isDerailed,
    },
  ];

  for (const unit of liveRivalGridState) {
    if (!unit.active) continue;
    entries.push({
      driverId: unit.driverId,
      name: unit.name,
      isPlayer: false,
      lapCount: unit.lapCount,
      totalDistanceM: unit.totalDistanceM,
      lane: unit.lane,
      isDerailed: unit.isDerailed,
    });
  }

  entries.sort((a, b) => b.totalDistanceM - a.totalDistanceM);
  const leaderDist = entries[0]?.totalDistanceM ?? 0;

  return entries.map((entry, idx) => ({
    driverId: entry.driverId,
    name: entry.name,
    isPlayer: entry.isPlayer,
    position: Math.min(4, idx + 1) as 1 | 2 | 3 | 4,
    lapCount: entry.lapCount,
    gapToLeaderM: Math.max(0, leaderDist - entry.totalDistanceM),
    lane: entry.lane,
    isDerailed: entry.isDerailed,
  }));
}

const RIVAL_WEIGHT_KG = 172;
const RIVAL_BASE_GRIP_N = 7600;
const RIVAL_AERO_COEFF = 0.65;
const RIVAL_BRAKE_MS2 = 34.5;

const _rivalKinematics: SplineKinematicsResult = {
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  outwardNormal: new THREE.Vector3(),
  curvature: 0,
  curvatureRadius: Infinity,
  turnSign: 0,
};
const _rivalPos = new THREE.Vector3();
const _rivalLook = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _toRivalVec = new THREE.Vector3();
const _camRightVec = new THREE.Vector3();
const _rivalVelVec = new THREE.Vector3();
const _closestRivalPos = new THREE.Vector3();
const _closestRivalTangent = new THREE.Vector3();

/**
 * Parrilla de Coches IA 3D de alta densidad poligonal:
 * - En `vs-ai`: 1 Rival Jefe del circuito (Duelo 1vs1).
 * - En `grand-prix` y `championship`: 3 Rivales IA simultáneos en pista (Parrilla de 4 coches P1-P4)
 *   con adelantamientos dinámicos por cambio de carril y audio 3D espacial Doppler.
 */
export function RivalCar() {
  const groupRef0 = useRef<THREE.Group>(null);
  const groupRef1 = useRef<THREE.Group>(null);
  const groupRef2 = useRef<THREE.Group>(null);
  const groupRefs = [groupRef0, groupRef1, groupRef2];

  const trackId = useTelemetryStore((s) => s.trackId);
  const playerLane = useTelemetryStore((s) => s.playerLane);
  const raceMode = useTelemetryStore((s) => s.raceMode);
  const resetNonce = useTelemetryStore((s) => s.resetNonce);
  const playerModelPath = useGarageStore((s) => s.carStats.modelPath);

  const isSingleDuel = raceMode === 'vs-ai';
  const isMultiGrid =
    raceMode === 'grand-prix' || raceMode === 'championship';
  const hasAiCars = isSingleDuel || isMultiGrid;

  const trackBoss = CUP_BOSS_BY_TRACK[trackId];

  const activeProfiles: readonly BossProfile[] = useMemo(() => {
    if (isSingleDuel) {
      return [trackBoss];
    }
    if (isMultiGrid) {
      return GRAND_PRIX_AI_ROSTER;
    }
    return [];
  }, [isSingleDuel, isMultiGrid, trackBoss]);

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const lut = useMemo(() => getTrackLUT(trackId), [trackId]);
  const trackLengthM = useMemo(() => curve.getLength(), [curve]);

  const motionRef0 = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    bodyPitchRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    speedMs: 0,
    brakeIntensity: 0,
    guideStress: 0,
    isDerailed: false,
  });
  const motionRef1 = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    bodyPitchRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    speedMs: 0,
    brakeIntensity: 0,
    guideStress: 0,
    isDerailed: false,
  });
  const motionRef2 = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    bodyPitchRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    speedMs: 0,
    brakeIntensity: 0,
    guideStress: 0,
    isDerailed: false,
  });
  const motionRefs = [motionRef0, motionRef1, motionRef2];

  useEffect(() => {
    const oppLane: LaneId = playerLane === 'left' ? 'right' : 'left';
    const gridOffsets = isSingleDuel ? [3.2, 0, 0] : [10.5, 7.0, 3.5];
    const gridLanes: LaneId[] = isSingleDuel
      ? [oppLane, 'left', 'right']
      : [oppLane, playerLane, oppLane];

    for (let i = 0; i < 3; i++) {
      const profile = activeProfiles[i];
      const unit = liveRivalGridState[i];
      if (!profile) {
        unit.active = false;
        continue;
      }
      unit.active = true;
      unit.driverId = profile.driverId;
      unit.name = profile.name;
      unit.lane = gridLanes[i];
      unit.lateralOffsetM = getLaneLateralOffsetM(gridLanes[i]);
      unit.startGridOffsetM = gridOffsets[i];
      unit.distanceM = gridOffsets[i];
      unit.lapCount = 1;
      unit.totalDistanceM = gridOffsets[i];
      unit.speedMs = 0;
      unit.isDerailed = false;
      unit.derailTimerSec = 0;
      unit.pressureAccumulatorSec = 0;
      unit.laneSwitchCooldownSec = 1.5;
    }

    liveRivalState.distanceM = liveRivalGridState[0].distanceM;
    liveRivalState.lapCount = 1;
    liveRivalState.totalDistanceM = liveRivalGridState[0].totalDistanceM;
    liveRivalState.speedMs = 0;
    liveRivalState.isDerailed = false;
    liveRivalState.bossName = trackBoss.name;
    liveRivalState.cupTitle = trackBoss.cupTitle;
  }, [
    trackId,
    resetNonce,
    raceMode,
    isSingleDuel,
    activeProfiles,
    playerLane,
    trackBoss.name,
    trackBoss.cupTitle,
  ]);

  useEffect(() => {
    if (!hasAiCars) {
      soundEngine.silenceRival();
    }
    return () => {
      soundEngine.silenceRival();
    };
  }, [hasAiCars]);

  useFrame((state, rawDelta) => {
    if (!hasAiCars) {
      soundEngine.silenceRival();
      return;
    }

    const dt = Math.min(rawDelta, 0.05);
    const telemetry = useTelemetryStore.getState();
    const isRain = telemetry.weatherMode === 'rain';
    const wetGripScale = isRain ? 0.86 : 1.0;

    let closestDistToCam = Infinity;
    let closestSpeedMs = 0;
    let closestMaxSpeedMs = 54;
    let closestThrottle = 0;
    let closestDrift = 0;

    for (let i = 0; i < activeProfiles.length; i++) {
      const profile = activeProfiles[i];
      const unit = liveRivalGridState[i];
      const group = groupRefs[i]?.current;
      const vis = motionRefs[i].current;
      if (!profile || !unit || !unit.active || !group) continue;

      if (unit.laneSwitchCooldownSec > 0) {
        unit.laneSwitchCooldownSec = Math.max(
          0,
          unit.laneSwitchCooldownSec - dt
        );
      }

      const targetLateralM = getLaneLateralOffsetM(unit.lane);
      unit.lateralOffsetM = THREE.MathUtils.lerp(
        unit.lateralOffsetM,
        targetLateralM,
        1 - Math.exp(-10 * dt)
      );

      // Mientras el Semáforo F1 está en cuenta atrás roja, cada coche IA espera en su cajón de parrilla escalonado
      if (telemetry.cupStartPhase === 'countdown') {
        unit.distanceM = unit.startGridOffsetM;
        unit.lapCount = 1;
        unit.totalDistanceM = unit.startGridOffsetM;
        unit.speedMs = 0;
        const startU = (unit.distanceM / trackLengthM) % 1;
        evaluateSplineKinematics(curve, startU, _rivalKinematics);
        _rivalPos
          .copy(_rivalKinematics.position)
          .addScaledVector(_rivalKinematics.right, unit.lateralOffsetM);
        _rivalLook.copy(_rivalPos).add(_rivalKinematics.tangent);
        group.position.copy(_rivalPos);
        group.up.copy(_worldUp);
        group.lookAt(_rivalLook);
        continue;
      }

      if (unit.derailTimerSec > 0) {
        unit.derailTimerSec -= dt;
        unit.speedMs = Math.max(0, unit.speedMs - 24 * dt);
        vis.isDerailed = true;
        vis.speedMs = unit.speedMs;
        group.rotateY(4.2 * dt);
        unit.isDerailed = true;
        if (unit.derailTimerSec <= 0) {
          vis.isDerailed = false;
          unit.isDerailed = false;
        }
        continue;
      }

      const rivalTotalDist =
        (unit.lapCount - 1) * trackLengthM + unit.distanceM;
      unit.totalDistanceM = rivalTotalDist;

      // IA de cambio de carril inteligente para adelantar tráfico más lento en el mismo raíl
      if (unit.laneSwitchCooldownSec <= 0) {
        let blockedInSameLane = false;
        // Comprobar contra jugador
        const gapToPlayerAhead =
          livePlayerProgress.totalDistanceM - rivalTotalDist;
        if (
          gapToPlayerAhead > 0.8 &&
          gapToPlayerAhead < 6.2 &&
          livePlayerProgress.lane === unit.lane
        ) {
          blockedInSameLane = true;
        }
        // Comprobar contra otros coches IA
        for (let j = 0; j < activeProfiles.length; j++) {
          if (i === j) continue;
          const other = liveRivalGridState[j];
          if (!other.active) continue;
          const gapAhead = other.totalDistanceM - rivalTotalDist;
          if (
            gapAhead > 0.8 &&
            gapAhead < 6.2 &&
            other.lane === unit.lane &&
            unit.speedMs >= other.speedMs - 0.5
          ) {
            blockedInSameLane = true;
            break;
          }
        }
        if (blockedInSameLane) {
          unit.lane = unit.lane === 'left' ? 'right' : 'left';
          unit.laneSwitchCooldownSec = 2.2;
        }
      }

      const gapAheadOfPlayer =
        rivalTotalDist - livePlayerProgress.totalDistanceM;
      const isUnderClosePressure =
        gapAheadOfPlayer > -2 && gapAheadOfPlayer < 8.5;

      if (isUnderClosePressure && profile.canOverpushUnderPressure) {
        unit.pressureAccumulatorSec += dt;
      } else {
        unit.pressureAccumulatorSec = Math.max(
          0,
          unit.pressureAccumulatorSec - dt * 0.5
        );
      }

      // Escalar ligeramente el ritmo en parrilla múltiple para crear batallas compactas y adelantamientos
      const gridPaceMultiplier = isMultiGrid ? 0.985 - i * 0.022 : 1.0;
      const effectiveMaxSpeedMs = profile.maxSpeedMs * gridPaceMultiplier;
      const activeCornerAggression =
        (isUnderClosePressure && profile.canOverpushUnderPressure
          ? profile.cornerAggression + 0.055
          : profile.cornerAggression) * gridPaceMultiplier;

      let mustBrake = false;
      let shouldCoast = false;

      for (let d = 1; d <= 46; d += 3.0) {
        const node = sampleTrackLUTNode(lut, unit.distanceM + d);
        const effR = computeEffectiveLaneRadius(
          node.curvatureRadius,
          node.turnSign,
          unit.lateralOffsetM
        );
        const safeApexSpeed =
          computeCornerLimitSpeedMs(
            effR,
            RIVAL_WEIGHT_KG,
            RIVAL_BASE_GRIP_N * wetGripScale,
            RIVAL_AERO_COEFF
          ) * activeCornerAggression;

        if (!Number.isFinite(safeApexSpeed)) continue;

        const reqBrakeDist =
          unit.speedMs > safeApexSpeed
            ? (unit.speedMs * unit.speedMs - safeApexSpeed * safeApexSpeed) /
                (2 * (RIVAL_BRAKE_MS2 + 9.81 * node.tangent.y)) +
              unit.speedMs * 0.14
            : 0;

        if (unit.speedMs > safeApexSpeed && d <= reqBrakeDist * 1.1) {
          mustBrake = true;
          break;
        }
        if (
          unit.speedMs > safeApexSpeed * 0.94 &&
          d <= reqBrakeDist * 1.4 + 4
        ) {
          shouldCoast = true;
        }
      }

      const prevU = unit.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, prevU, _rivalKinematics);
      const slopeGravity = -9.81 * _rivalKinematics.tangent.y;

      let netAccel = slopeGravity - 0.0022 * unit.speedMs * unit.speedMs;
      const aiThrottle = !mustBrake && !shouldCoast ? 1 : 0;

      if (mustBrake) {
        netAccel -= RIVAL_BRAKE_MS2;
      } else if (shouldCoast) {
        netAccel -= 6.5;
      } else {
        const ratio = unit.speedMs / effectiveMaxSpeedMs;
        netAccel += profile.accelMs2 * Math.max(0, 1 - Math.pow(ratio, 2.3));
      }

      unit.speedMs = THREE.MathUtils.clamp(
        unit.speedMs + netAccel * dt,
        0,
        effectiveMaxSpeedMs
      );

      const curEffR = computeEffectiveLaneRadius(
        _rivalKinematics.curvatureRadius,
        _rivalKinematics.turnSign,
        unit.lateralOffsetM
      );
      const arcScale =
        Number.isFinite(_rivalKinematics.curvatureRadius) &&
        Number.isFinite(curEffR)
          ? THREE.MathUtils.clamp(
              _rivalKinematics.curvatureRadius / curEffR,
              0.72,
              1.35
            )
          : 1.0;

      const nextDistance = unit.distanceM + unit.speedMs * arcScale * dt;
      if (nextDistance >= trackLengthM) {
        if (
          telemetry.cupStartPhase !== 'finished' &&
          unit.lapCount >= telemetry.cupTargetLaps
        ) {
          unit.lapCount += 1;
          unit.distanceM =
            ((nextDistance % trackLengthM) + trackLengthM) % trackLengthM;
          unit.totalDistanceM =
            (unit.lapCount - 1) * trackLengthM + unit.distanceM;
          const finalStandings = buildLiveGridStandings();
          telemetry.finishGridRace(finalStandings);
        } else {
          unit.lapCount += 1;
        }
      }

      unit.distanceM =
        ((nextDistance % trackLengthM) + trackLengthM) % trackLengthM;
      unit.totalDistanceM =
        (unit.lapCount - 1) * trackLengthM + unit.distanceM;

      const u = unit.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, u, _rivalKinematics);

      _rivalPos
        .copy(_rivalKinematics.position)
        .addScaledVector(_rivalKinematics.right, unit.lateralOffsetM);
      _rivalLook.copy(_rivalPos).add(_rivalKinematics.tangent);

      group.position.copy(_rivalPos);
      group.up.copy(_worldUp);
      group.lookAt(_rivalLook);

      const postEffR = computeEffectiveLaneRadius(
        _rivalKinematics.curvatureRadius,
        _rivalKinematics.turnSign,
        unit.lateralOffsetM
      );
      const fc = Number.isFinite(postEffR)
        ? (RIVAL_WEIGHT_KG * unit.speedMs * unit.speedMs) / postEffR
        : 0;
      const dynGrip =
        RIVAL_BASE_GRIP_N * wetGripScale +
        RIVAL_AERO_COEFF * unit.speedMs * unit.speedMs;
      const gripRatio = dynGrip > 0 ? fc / dynGrip : 0;
      const driftInt = THREE.MathUtils.clamp(
        (gripRatio - 0.85) / 0.42,
        0,
        0.88
      );

      if (
        profile.canOverpushUnderPressure &&
        unit.pressureAccumulatorSec > 2.2 &&
        gripRatio > 1.06
      ) {
        unit.derailTimerSec = 1.25;
        unit.pressureAccumulatorSec = 0;
        soundEngine.playDerailSound();
      }

      vis.speedMs = unit.speedMs;
      vis.driftIntensity = driftInt;
      vis.brakeIntensity = mustBrake ? 1 : 0;
      vis.guideStress = gripRatio > 0.9 ? (gripRatio - 0.9) * 3.2 : 0;
      vis.driftYawRad = THREE.MathUtils.lerp(
        vis.driftYawRad,
        -_rivalKinematics.turnSign * driftInt * 0.44,
        1 - Math.exp(-12 * dt)
      );
      vis.bodyRollRad = THREE.MathUtils.lerp(
        vis.bodyRollRad,
        -_rivalKinematics.turnSign * Math.min(1.1, gripRatio) * 0.13,
        1 - Math.exp(-12 * dt)
      );
      vis.bodyPitchRad = THREE.MathUtils.lerp(
        vis.bodyPitchRad ?? 0,
        mustBrake ? 0.032 : aiThrottle > 0 ? -0.016 : 0,
        1 - Math.exp(-10 * dt)
      );

      // Seleccionar el coche IA más cercano a la cámara para el motor de audio 3D Doppler
      const distCam = _rivalPos.distanceTo(state.camera.position);
      if (distCam < closestDistToCam) {
        closestDistToCam = distCam;
        closestSpeedMs = unit.speedMs;
        closestMaxSpeedMs = effectiveMaxSpeedMs;
        closestThrottle = aiThrottle;
        closestDrift = driftInt;
        _closestRivalPos.copy(_rivalPos);
        _closestRivalTangent.copy(_rivalKinematics.tangent);
      }
    }

    // Sincronizar liveRivalState con el coche IA líder
    let leaderUnit = liveRivalGridState[0];
    for (const u of liveRivalGridState) {
      if (u.active && u.totalDistanceM > leaderUnit.totalDistanceM) {
        leaderUnit = u;
      }
    }
    liveRivalState.distanceM = leaderUnit.distanceM;
    liveRivalState.lapCount = leaderUnit.lapCount;
    liveRivalState.totalDistanceM = leaderUnit.totalDistanceM;
    liveRivalState.speedMs = leaderUnit.speedMs;
    liveRivalState.isDerailed = leaderUnit.isDerailed;
    liveRivalState.bossName = leaderUnit.name;

    if (
      telemetry.cupStartPhase !== 'countdown' &&
      Number.isFinite(closestDistToCam)
    ) {
      _toRivalVec.subVectors(_closestRivalPos, state.camera.position);
      const distToCam = Math.max(0.5, _toRivalVec.length());
      _toRivalVec.divideScalar(distToCam);

      _camRightVec.setFromMatrixColumn(state.camera.matrixWorld, 0).normalize();
      const stereoPan = _toRivalVec.dot(_camRightVec) * 1.15;

      _rivalVelVec
        .copy(_closestRivalTangent)
        .multiplyScalar(closestSpeedMs);
      const radialClosingSpeed = -_rivalVelVec.dot(_toRivalVec);

      soundEngine.updateRivalSpatialFrame({
        speedMs: closestSpeedMs,
        maxSpeedMs: closestMaxSpeedMs,
        throttle: closestThrottle,
        driftIntensity: closestDrift,
        distanceToListenerM: distToCam,
        stereoPan,
        radialClosingSpeedMs: radialClosingSpeed,
        active: true,
      });
    } else {
      soundEngine.silenceRival();
    }
  });

  if (!hasAiCars) return null;

  return (
    <group name="rival-slot-grid">
      {activeProfiles.map((profile, idx) => {
        const useAltModel = playerModelPath === profile.defaultModelPath;
        const modelPath = useAltModel
          ? profile.altModelPath
          : profile.defaultModelPath;
        const yawOffset = useAltModel
          ? profile.altYawRad
          : profile.defaultYawRad;

        return (
          <group
            key={profile.driverId}
            ref={groupRefs[idx]}
            name={`rival-slot-car-${idx}`}
          >
            <CarModel
              modelPath={modelPath}
              modelYawOffsetRad={yawOffset}
              motionRef={motionRefs[idx]}
            />
          </group>
        );
      })}
    </group>
  );
}

export default RivalCar;
