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
import type { TrackId } from '@/types/types';

export interface BossProfile {
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
};

/** Estado 0-GC compartido en tiempo real entre PhysicsCar y RivalCar */
export const liveRivalState = {
  distanceM: 0,
  lapCount: 1,
  totalDistanceM: 0,
  speedMs: 0,
  isDerailed: false,
  bossName: CUP_BOSS_BY_TRACK.montmelo.name,
  cupTitle: CUP_BOSS_BY_TRACK.montmelo.cupTitle,
};

export const livePlayerProgress = {
  distanceM: 0,
  lapCount: 1,
  totalDistanceM: 0,
};

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

/**
 * Coche Rival IA de alta densidad poligonal (100k+ vértices PBR).
 * Activo exclusivamente en "Modo VS IA" (`raceMode === 'vs-ai'`), sincronizado con el Semáforo F1.
 */
export function RivalCar() {
  const groupRef = useRef<THREE.Group>(null);

  const trackId = useTelemetryStore((s) => s.trackId);
  const playerLane = useTelemetryStore((s) => s.playerLane);
  const raceMode = useTelemetryStore((s) => s.raceMode);
  const resetNonce = useTelemetryStore((s) => s.resetNonce);
  const playerModelPath = useGarageStore((s) => s.carStats.modelPath);

  const isVsMode = raceMode === 'vs-ai';

  const boss = CUP_BOSS_BY_TRACK[trackId];
  const useAltModel = playerModelPath === boss.defaultModelPath;
  const rivalModelPath = useAltModel
    ? boss.altModelPath
    : boss.defaultModelPath;
  const rivalYawOffsetRad = useAltModel
    ? boss.altYawRad
    : boss.defaultYawRad;

  const rivalLane = playerLane === 'left' ? 'right' : 'left';
  const rivalLaneOffsetM = getLaneLateralOffsetM(rivalLane);

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const lut = useMemo(() => getTrackLUT(trackId), [trackId]);
  const trackLengthM = useMemo(() => curve.getLength(), [curve]);

  const rivalMotionRef = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    bodyPitchRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    speedMs: 0,
    brakeIntensity: 0,
    guideStress: 0,
    isDerailed: false,
  });

  const simRef = useRef({
    distanceM: 0,
    lapCount: 1,
    speedMs: 0,
    lateralOffsetM: rivalLaneOffsetM,
    derailTimerSec: 0,
    pressureAccumulatorSec: 0,
  });

  useEffect(() => {
    simRef.current.distanceM = 0;
    simRef.current.lapCount = 1;
    simRef.current.speedMs = 0;
    simRef.current.derailTimerSec = 0;
    simRef.current.pressureAccumulatorSec = 0;

    liveRivalState.distanceM = 0;
    liveRivalState.lapCount = 1;
    liveRivalState.totalDistanceM = 0;
    liveRivalState.speedMs = 0;
    liveRivalState.isDerailed = false;
    liveRivalState.bossName = boss.name;
    liveRivalState.cupTitle = boss.cupTitle;
  }, [trackId, resetNonce, raceMode, boss.name, boss.cupTitle]);

  useEffect(() => {
    if (!isVsMode) {
      soundEngine.silenceRival();
    }
    return () => {
      soundEngine.silenceRival();
    };
  }, [isVsMode]);

  useFrame((state, rawDelta) => {
    if (!isVsMode) {
      soundEngine.silenceRival();
      return;
    }

    const group = groupRef.current;
    if (!group) return;

    const dt = Math.min(rawDelta, 0.05);
    const sim = simRef.current;
    const telemetry = useTelemetryStore.getState();
    const isRain = telemetry.weatherMode === 'rain';
    const wetGripScale = isRain ? 0.86 : 1.0;

    sim.lateralOffsetM = THREE.MathUtils.lerp(
      sim.lateralOffsetM,
      rivalLaneOffsetM,
      1 - Math.exp(-10 * dt)
    );

    // Mientras el Semáforo F1 está en cuenta atrás roja, el coche IA espera alineado en la parrilla de salida
    if (telemetry.cupStartPhase === 'countdown') {
      sim.distanceM = 0;
      sim.lapCount = 1;
      sim.speedMs = 0;
      evaluateSplineKinematics(curve, 0, _rivalKinematics);
      _rivalPos
        .copy(_rivalKinematics.position)
        .addScaledVector(_rivalKinematics.right, sim.lateralOffsetM);
      _rivalLook.copy(_rivalPos).add(_rivalKinematics.tangent);
      group.position.copy(_rivalPos);
      group.up.copy(_worldUp);
      group.lookAt(_rivalLook);
      soundEngine.silenceRival();
      return;
    }

    if (sim.derailTimerSec > 0) {
      sim.derailTimerSec -= dt;
      sim.speedMs = Math.max(0, sim.speedMs - 24 * dt);
      rivalMotionRef.current.isDerailed = true;
      rivalMotionRef.current.speedMs = sim.speedMs;
      group.rotateY(4.2 * dt);
      liveRivalState.isDerailed = true;
      liveRivalState.speedMs = sim.speedMs;
      if (sim.derailTimerSec <= 0) {
        rivalMotionRef.current.isDerailed = false;
        liveRivalState.isDerailed = false;
      }
      return;
    }

    const rivalTotalDist =
      (sim.lapCount - 1) * trackLengthM + sim.distanceM;
    const gapAheadOfPlayer =
      rivalTotalDist - livePlayerProgress.totalDistanceM;
    const isUnderClosePressure =
      gapAheadOfPlayer > -2 && gapAheadOfPlayer < 8.5;

    if (isUnderClosePressure && boss.canOverpushUnderPressure) {
      sim.pressureAccumulatorSec += dt;
    } else {
      sim.pressureAccumulatorSec = Math.max(
        0,
        sim.pressureAccumulatorSec - dt * 0.5
      );
    }

    const activeCornerAggression =
      isUnderClosePressure && boss.canOverpushUnderPressure
        ? boss.cornerAggression + 0.055
        : boss.cornerAggression;

    let mustBrake = false;
    let shouldCoast = false;

    for (let d = 1; d <= 46; d += 3.0) {
      const node = sampleTrackLUTNode(lut, sim.distanceM + d);
      const effR = computeEffectiveLaneRadius(
        node.curvatureRadius,
        node.turnSign,
        sim.lateralOffsetM
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
        sim.speedMs > safeApexSpeed
          ? (sim.speedMs * sim.speedMs - safeApexSpeed * safeApexSpeed) /
              (2 * (RIVAL_BRAKE_MS2 + 9.81 * node.tangent.y)) +
            sim.speedMs * 0.14
          : 0;

      if (sim.speedMs > safeApexSpeed && d <= reqBrakeDist * 1.1) {
        mustBrake = true;
        break;
      }
      if (sim.speedMs > safeApexSpeed * 0.94 && d <= reqBrakeDist * 1.4 + 4) {
        shouldCoast = true;
      }
    }

    const prevU = sim.distanceM / trackLengthM;
    evaluateSplineKinematics(curve, prevU, _rivalKinematics);
    const slopeGravity = -9.81 * _rivalKinematics.tangent.y;

    let netAccel = slopeGravity - 0.0022 * sim.speedMs * sim.speedMs;
    const aiThrottle = !mustBrake && !shouldCoast ? 1 : 0;

    if (mustBrake) {
      netAccel -= RIVAL_BRAKE_MS2;
    } else if (shouldCoast) {
      netAccel -= 6.5;
    } else {
      const ratio = sim.speedMs / boss.maxSpeedMs;
      netAccel += boss.accelMs2 * Math.max(0, 1 - Math.pow(ratio, 2.3));
    }

    sim.speedMs = THREE.MathUtils.clamp(
      sim.speedMs + netAccel * dt,
      0,
      boss.maxSpeedMs
    );

    const curEffR = computeEffectiveLaneRadius(
      _rivalKinematics.curvatureRadius,
      _rivalKinematics.turnSign,
      sim.lateralOffsetM
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

    const nextDistance = sim.distanceM + sim.speedMs * arcScale * dt;
    if (nextDistance >= trackLengthM) {
      if (
        telemetry.raceMode === 'vs-ai' &&
        telemetry.cupStartPhase !== 'finished' &&
        sim.lapCount >= telemetry.cupTargetLaps
      ) {
        telemetry.finishCupRace('rival');
      }
      sim.lapCount += 1;
    }

    sim.distanceM =
      ((nextDistance % trackLengthM) + trackLengthM) % trackLengthM;

    const u = sim.distanceM / trackLengthM;
    evaluateSplineKinematics(curve, u, _rivalKinematics);

    _rivalPos
      .copy(_rivalKinematics.position)
      .addScaledVector(_rivalKinematics.right, sim.lateralOffsetM);
    _rivalLook.copy(_rivalPos).add(_rivalKinematics.tangent);

    group.position.copy(_rivalPos);
    group.up.copy(_worldUp);
    group.lookAt(_rivalLook);

    const postEffR = computeEffectiveLaneRadius(
      _rivalKinematics.curvatureRadius,
      _rivalKinematics.turnSign,
      sim.lateralOffsetM
    );
    const fc = Number.isFinite(postEffR)
      ? (RIVAL_WEIGHT_KG * sim.speedMs * sim.speedMs) / postEffR
      : 0;
    const dynGrip =
      RIVAL_BASE_GRIP_N * wetGripScale +
      RIVAL_AERO_COEFF * sim.speedMs * sim.speedMs;
    const gripRatio = dynGrip > 0 ? fc / dynGrip : 0;
    const driftInt = THREE.MathUtils.clamp((gripRatio - 0.85) / 0.42, 0, 0.88);

    if (
      boss.canOverpushUnderPressure &&
      sim.pressureAccumulatorSec > 2.2 &&
      gripRatio > 1.06
    ) {
      sim.derailTimerSec = 1.25;
      sim.pressureAccumulatorSec = 0;
      soundEngine.playDerailSound();
    }

    const vis = rivalMotionRef.current;
    vis.speedMs = sim.speedMs;
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

    liveRivalState.distanceM = sim.distanceM;
    liveRivalState.lapCount = sim.lapCount;
    liveRivalState.totalDistanceM =
      (sim.lapCount - 1) * trackLengthM + sim.distanceM;
    liveRivalState.speedMs = sim.speedMs;
    liveRivalState.bossName = boss.name;
    liveRivalState.cupTitle = boss.cupTitle;

    _toRivalVec.subVectors(_rivalPos, state.camera.position);
    const distToCam = Math.max(0.5, _toRivalVec.length());
    _toRivalVec.divideScalar(distToCam);

    _camRightVec.setFromMatrixColumn(state.camera.matrixWorld, 0).normalize();
    const stereoPan = _toRivalVec.dot(_camRightVec) * 1.15;

    _rivalVelVec
      .copy(_rivalKinematics.tangent)
      .multiplyScalar(sim.speedMs);
    const radialClosingSpeed = -_rivalVelVec.dot(_toRivalVec);

    soundEngine.updateRivalSpatialFrame({
      speedMs: sim.speedMs,
      maxSpeedMs: boss.maxSpeedMs,
      throttle: aiThrottle,
      driftIntensity: driftInt,
      distanceToListenerM: distToCam,
      stereoPan,
      radialClosingSpeedMs: radialClosingSpeed,
      active: true,
    });
  });

  if (!isVsMode) return null;

  return (
    <group ref={groupRef} name="rival-slot-car">
      <CarModel
        modelPath={rivalModelPath}
        modelYawOffsetRad={rivalYawOffsetRad}
        motionRef={rivalMotionRef}
      />
    </group>
  );
}

export default RivalCar;
