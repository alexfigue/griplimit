'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  computeEffectiveLaneRadius,
  evaluatePointBrakingRisk,
  getLaneLateralOffsetM,
  getTrackLUT,
  sampleTrackLUTNode,
} from '@/lib/montmeloSpline';
import { useGarageStore, useTelemetryStore } from '@/store/store';

export interface LiveTrackKinematicsRef {
  readonly distanceM: number;
  readonly speedMs: number;
  readonly isDerailed: boolean;
}

export interface PredictiveBrakingLineProps {
  liveStateRef: React.RefObject<LiveTrackKinematicsRef>;
}

const RIBBON_STEPS = 28;
const START_OFFSET_M = 2.6;
const LOOKAHEAD_SPAN_M = 50.0;
const RIBBON_Y_ELEVATION = 0.068;

const COLOR_SAFE_BLUE = new THREE.Color('#2F81F7');
const COLOR_COAST_AMBER = new THREE.Color('#F59E0B');
const COLOR_BRAKE_RED = new THREE.Color('#FF2A3C');
const _tmpColor = new THREE.Color();

/**
 * Línea predictiva 3D de frenada proyectada directamente sobre el carril activo del jugador.
 * Se oculta limpiamente cuando el jugador desactiva la ayuda (`assistEnabled === false`).
 */
export function PredictiveBrakingLine({
  liveStateRef,
}: PredictiveBrakingLineProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const carStats = useGarageStore((s) => s.carStats);
  const trackId = useTelemetryStore((s) => s.trackId);
  const playerLane = useTelemetryStore((s) => s.playerLane);
  const assistEnabled = useTelemetryStore((s) => s.assistEnabled);

  const lut = useMemo(() => getTrackLUT(trackId), [trackId]);
  const laneOffsetM = getLaneLateralOffsetM(playerLane);

  const { geometry, positionArray, colorArray } = useMemo(() => {
    const vertexCount = (RIBBON_STEPS + 1) * 2;
    const posArr = new Float32Array(vertexCount * 3);
    const colArr = new Float32Array(vertexCount * 3);
    const indices: number[] = [];

    for (let i = 0; i < RIBBON_STEPS; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(posArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(colArr, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);
    geo.setIndex(indices);

    return {
      geometry: geo,
      positionArray: posArr,
      colorArray: colArr,
    };
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    const live = liveStateRef.current;
    if (!mesh || !live) return;

    if (!assistEnabled || live.isDerailed) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const currentDist = live.distanceM;
    const currentSpeed = live.speedMs;
    const totalWeight = carStats.TotalWeight;
    const baseGrip = carStats.TotalGrip;
    const aeroCoeff = carStats.AeroDownforceCoeff;

    for (let i = 0; i <= RIBBON_STEPS; i++) {
      const progress = i / RIBBON_STEPS;
      const aheadM = START_OFFSET_M + progress * LOOKAHEAD_SPAN_M;
      const node = sampleTrackLUTNode(lut, currentDist + aheadM);

      const halfWidth = THREE.MathUtils.lerp(0.46, 0.13, progress);
      const centerX = node.position.x + node.right.x * laneOffsetM;
      const centerY = node.position.y + RIBBON_Y_ELEVATION;
      const centerZ = node.position.z + node.right.z * laneOffsetM;

      const lx = centerX - node.right.x * halfWidth;
      const lz = centerZ - node.right.z * halfWidth;
      const rx = centerX + node.right.x * halfWidth;
      const rz = centerZ + node.right.z * halfWidth;

      const vBase = i * 6;
      positionArray[vBase] = lx;
      positionArray[vBase + 1] = centerY;
      positionArray[vBase + 2] = lz;
      positionArray[vBase + 3] = rx;
      positionArray[vBase + 4] = centerY;
      positionArray[vBase + 5] = rz;

      const effectiveRadius = computeEffectiveLaneRadius(
        node.curvatureRadius,
        node.turnSign,
        laneOffsetM
      );

      const { risk } = evaluatePointBrakingRisk(
        currentSpeed,
        aheadM,
        effectiveRadius,
        totalWeight,
        baseGrip,
        aeroCoeff,
        node.tangent.y
      );

      if (risk >= 0.92) {
        _tmpColor.copy(COLOR_BRAKE_RED);
      } else if (risk >= 0.38) {
        const t = (risk - 0.38) / (0.92 - 0.38);
        _tmpColor.lerpColors(COLOR_COAST_AMBER, COLOR_BRAKE_RED, t * 0.45);
      } else {
        const t = risk / 0.38;
        _tmpColor.lerpColors(COLOR_SAFE_BLUE, COLOR_COAST_AMBER, t);
      }

      colorArray[vBase] = _tmpColor.r;
      colorArray[vBase + 1] = _tmpColor.g;
      colorArray[vBase + 2] = _tmpColor.b;
      colorArray[vBase + 3] = _tmpColor.r;
      colorArray[vBase + 4] = _tmpColor.g;
      colorArray[vBase + 5] = _tmpColor.b;
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default PredictiveBrakingLine;
