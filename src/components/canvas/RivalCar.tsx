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

const RIVAL_WEIGHT_KG = 176;
const RIVAL_BASE_GRIP_N = 7400;
const RIVAL_AERO_COEFF = 0.55;
const RIVAL_MAX_SPEED_MS = 186 / 3.6;
const RIVAL_ACCEL_MS2 = 13.8;
const RIVAL_BRAKE_MS2 = 34.0;

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
 * Coche Rival / IA sobre el carril paralelo de Scalextric con:
 * - Audio espacial 3D en tiempo real (paneo estéreo izq/der, atenuación por distancia y Doppler).
 * - Luces de freno traseras activas y chispas en apoyo fuerte.
 */
export function RivalCar() {
  const groupRef = useRef<THREE.Group>(null);

  const trackId = useTelemetryStore((s) => s.trackId);
  const playerLane = useTelemetryStore((s) => s.playerLane);
  const rivalEnabled = useTelemetryStore((s) => s.rivalEnabled);
  const resetNonce = useTelemetryStore((s) => s.resetNonce);
  const playerModelPath = useGarageStore((s) => s.carStats.modelPath);

  const rivalLane = playerLane === 'left' ? 'right' : 'left';
  const rivalLaneOffsetM = getLaneLateralOffsetM(rivalLane);

  const rivalModelPath =
    trackId === 'neo-wangan'
      ? playerModelPath === '/cars/tokyo-gt-turbo.glb'
        ? '/cars/cyber-formula.glb'
        : '/cars/tokyo-gt-turbo.glb'
      : playerModelPath === '/cars/sonic-wing.glb'
        ? '/cars/phantom-stream.glb'
        : '/cars/sonic-wing.glb';

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const lut = useMemo(() => getTrackLUT(trackId), [trackId]);
  const trackLengthM = useMemo(() => curve.getLength(), [curve]);

  const rivalMotionRef = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    brakeIntensity: 0,
    guideStress: 0,
    isDerailed: false,
  });

  const simRef = useRef({
    distanceM: 0,
    speedMs: 0,
    lateralOffsetM: rivalLaneOffsetM,
    prevDistanceToCamM: 20,
  });

  useEffect(() => {
    simRef.current.distanceM = 0;
    simRef.current.speedMs = 0;
  }, [trackId, resetNonce]);

  useEffect(() => {
    if (!rivalEnabled) {
      soundEngine.silenceRival();
    }
    return () => {
      soundEngine.silenceRival();
    };
  }, [rivalEnabled]);

  useFrame((state, rawDelta) => {
    if (!rivalEnabled) {
      soundEngine.silenceRival();
      return;
    }

    const group = groupRef.current;
    if (!group) return;

    const dt = Math.min(rawDelta, 0.05);
    const sim = simRef.current;

    sim.lateralOffsetM = THREE.MathUtils.lerp(
      sim.lateralOffsetM,
      rivalLaneOffsetM,
      1 - Math.exp(-10 * dt)
    );

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
          RIVAL_BASE_GRIP_N,
          RIVAL_AERO_COEFF
        ) * 0.95;

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
      const ratio = sim.speedMs / RIVAL_MAX_SPEED_MS;
      netAccel += RIVAL_ACCEL_MS2 * Math.max(0, 1 - Math.pow(ratio, 2.3));
    }

    sim.speedMs = THREE.MathUtils.clamp(
      sim.speedMs + netAccel * dt,
      0,
      RIVAL_MAX_SPEED_MS
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

    sim.distanceM =
      (sim.distanceM + sim.speedMs * arcScale * dt + trackLengthM) %
      trackLengthM;

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
      RIVAL_BASE_GRIP_N + RIVAL_AERO_COEFF * sim.speedMs * sim.speedMs;
    const gripRatio = dynGrip > 0 ? fc / dynGrip : 0;
    const driftInt = THREE.MathUtils.clamp((gripRatio - 0.85) / 0.42, 0, 0.85);

    const vis = rivalMotionRef.current;
    vis.driftIntensity = driftInt;
    vis.brakeIntensity = mustBrake ? 1 : 0;
    vis.guideStress = gripRatio > 0.92 ? (gripRatio - 0.92) * 3.0 : 0;
    vis.driftYawRad = THREE.MathUtils.lerp(
      vis.driftYawRad,
      -_rivalKinematics.turnSign * driftInt * 0.42,
      1 - Math.exp(-12 * dt)
    );
    vis.bodyRollRad = THREE.MathUtils.lerp(
      vis.bodyRollRad,
      -_rivalKinematics.turnSign * Math.min(1.1, gripRatio) * 0.13,
      1 - Math.exp(-12 * dt)
    );

    // Espacialización 3D del audio respecto a la cámara activa
    _toRivalVec.subVectors(_rivalPos, state.camera.position);
    const distToCam = Math.max(0.5, _toRivalVec.length());
    _toRivalVec.divideScalar(distToCam);

    _camRightVec.setFromMatrixColumn(state.camera.matrixWorld, 0).normalize();
    const stereoPan = _toRivalVec.dot(_camRightVec) * 1.15;

    _rivalVelVec
      .copy(_rivalKinematics.tangent)
      .multiplyScalar(sim.speedMs);
    // Velocidad radial de acercamiento (>0 si se acerca a la cámara, <0 si se aleja)
    const radialClosingSpeed = -_rivalVelVec.dot(_toRivalVec);

    soundEngine.updateRivalSpatialFrame({
      speedMs: sim.speedMs,
      maxSpeedMs: RIVAL_MAX_SPEED_MS,
      throttle: aiThrottle,
      driftIntensity: driftInt,
      distanceToListenerM: distToCam,
      stereoPan,
      radialClosingSpeedMs: radialClosingSpeed,
      active: true,
    });
  });

  if (!rivalEnabled) return null;

  return (
    <group ref={groupRef} name="rival-slot-car">
      <CarModel modelPath={rivalModelPath} motionRef={rivalMotionRef} />
    </group>
  );
}

export default RivalCar;
