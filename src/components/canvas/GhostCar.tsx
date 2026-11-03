'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CarModel,
  type CarVisualMotionState,
} from '@/components/canvas/CarModel';
import {
  getBestGhostForTrack,
  liveLapClock,
  sampleGhostPoseAtTime,
  type InterpolatedGhostPose,
} from '@/lib/ghostRecorder';
import {
  evaluateSplineKinematics,
  getTrackCurve,
  type SplineKinematicsResult,
} from '@/lib/montmeloSpline';
import { useTelemetryStore } from '@/store/store';

const _ghostKinematics: SplineKinematicsResult = {
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  outwardNormal: new THREE.Vector3(),
  curvature: 0,
  curvatureRadius: Infinity,
  turnSign: 0,
};

const _ghostPose: InterpolatedGhostPose = {
  distanceM: 0,
  lateralOffsetM: 0,
  driftYawRad: 0,
};

const _ghostWorldPos = new THREE.Vector3();
const _ghostLookTarget = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Vehículo Fantasma (Ghost Replay) holográfico 0-GC.
 * Reproduce a 60-144 FPS tu mejor vuelta histórica del circuito activo usando interpolación O(1) sobre Float32Array.
 */
export function GhostCar() {
  const ghostGroupRef = useRef<THREE.Group>(null);
  const trackId = useTelemetryStore((s) => s.trackId);
  const ghostEnabled = useTelemetryStore((s) => s.ghostEnabled);
  const ghostVersionNonce = useTelemetryStore((s) => s.ghostVersionNonce);

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const trackLengthM = useMemo(() => curve.getLength(), [curve]);

  const savedGhost = useMemo(
    () => getBestGhostForTrack(trackId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackId, ghostVersionNonce]
  );

  const ghostMotionRef = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    isDerailed: false,
  });

  useFrame(() => {
    const group = ghostGroupRef.current;
    if (!group) return;

    if (
      !ghostEnabled ||
      !savedGhost ||
      !liveLapClock.active ||
      liveLapClock.elapsedMs < 30
    ) {
      group.visible = false;
      return;
    }

    const hasSample = sampleGhostPoseAtTime(
      savedGhost,
      trackLengthM,
      liveLapClock.elapsedMs,
      _ghostPose
    );

    if (!hasSample) {
      group.visible = false;
      return;
    }

    group.visible = true;
    const u = _ghostPose.distanceM / trackLengthM;
    evaluateSplineKinematics(curve, u, _ghostKinematics);

    _ghostWorldPos
      .copy(_ghostKinematics.position)
      .addScaledVector(_ghostKinematics.right, _ghostPose.lateralOffsetM);
    _ghostWorldPos.y += 0.015;

    group.position.copy(_ghostWorldPos);
    _ghostLookTarget.copy(_ghostWorldPos).add(_ghostKinematics.tangent);
    group.up.copy(_worldUp);
    group.lookAt(_ghostLookTarget);

    ghostMotionRef.current.driftYawRad = _ghostPose.driftYawRad;
  });

  if (!ghostEnabled || !savedGhost) {
    return null;
  }

  return (
    <group ref={ghostGroupRef} visible={false} name="best-lap-ghost-car">
      <CarModel
        modelPath={savedGhost.modelPath}
        modelYawOffsetRad={savedGhost.modelYawOffsetRad}
        isGhost
        motionRef={ghostMotionRef}
      />
    </group>
  );
}

export default GhostCar;
