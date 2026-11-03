'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SLOT_GUIDE_PIN_OFFSET_Z } from '@/components/canvas/CarModel';
import { useTelemetryStore } from '@/store/store';

export interface SkidmarkEmitterState {
  carGroup: THREE.Group | null;
  driftYawRad: number;
  driftIntensity: number;
  isDerailed: boolean;
}

export interface SkidmarksRibbonProps {
  emitterRef: React.RefObject<SkidmarkEmitterState>;
}

/** Número máximo de segmentos dobles (neumático trasero izq + der) en el ring buffer */
const MAX_SKID_SEGMENTS = 340;
const TIRE_HALF_WIDTH_M = 0.15;
const MIN_STAMP_DISTANCE_SQ = 0.55 * 0.55;

const _leftWheelLocal = new THREE.Vector3();
const _rightWheelLocal = new THREE.Vector3();
const _leftWheelWorld = new THREE.Vector3();
const _rightWheelWorld = new THREE.Vector3();
const _lateralDir = new THREE.Vector3();

/**
 * Sistema persistente de marcas de neumáticos sobre el asfalto (Ring Buffer 0-GC).
 * Estampa en coordenadas de mundo las dos huellas de goma trasera durante los derrapes
 * y persiste en la pista durante varias vueltas sin alojar memoria nueva.
 */
export function SkidmarksRibbon({ emitterRef }: SkidmarksRibbonProps) {
  const trackId = useTelemetryStore((s) => s.trackId);

  const ring = useMemo(() => {
    // Cada segmento estampa 2 quads independientes (rueda izq y rueda der) = 8 vértices, 12 índices
    const positions = new Float32Array(MAX_SKID_SEGMENTS * 8 * 3);
    const indices = new Uint16Array(MAX_SKID_SEGMENTS * 12);

    for (let i = 0; i < MAX_SKID_SEGMENTS; i++) {
      const v = i * 8;
      const idx = i * 12;
      // Quad rueda trasera izquierda (v+0, v+1, v+2, v+3)
      indices[idx + 0] = v + 0;
      indices[idx + 1] = v + 1;
      indices[idx + 2] = v + 2;
      indices[idx + 3] = v + 1;
      indices[idx + 4] = v + 3;
      indices[idx + 5] = v + 2;
      // Quad rueda trasera derecha (v+4, v+5, v+6, v+7)
      indices[idx + 6] = v + 4;
      indices[idx + 7] = v + 5;
      indices[idx + 8] = v + 6;
      indices[idx + 9] = v + 5;
      indices[idx + 10] = v + 7;
      indices[idx + 11] = v + 6;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    return {
      geo,
      positions,
      writeCursor: 0,
      wasSkidding: false,
      prevLeft: new THREE.Vector3(),
      prevRight: new THREE.Vector3(),
    };
  }, []);

  // Limpia las marcas anteriores al cambiar de circuito
  useEffect(() => {
    ring.positions.fill(0);
    ring.wasSkidding = false;
    ring.writeCursor = 0;
    const posAttr = ring.geo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }, [trackId, ring]);

  useFrame(() => {
    const emitter = emitterRef.current;
    if (!emitter || !emitter.carGroup) return;

    const isSkiddingNow =
      !emitter.isDerailed && emitter.driftIntensity > 0.16;

    if (!isSkiddingNow) {
      ring.wasSkidding = false;
      return;
    }

    // Posición exacta de los neumáticos traseros teniendo en cuenta el pivote sobre la guía delantera
    const yaw = emitter.driftYawRad;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const relZ = -1.28 - SLOT_GUIDE_PIN_OFFSET_Z; // -2.73 m detrás de la guía

    // Rotación 2D local alrededor de (0, SLOT_GUIDE_PIN_OFFSET_Z)
    const calcWheelLocal = (wheelX: number, out: THREE.Vector3) => {
      const rx = wheelX * cosY + relZ * sinY;
      const rz = -wheelX * sinY + relZ * cosY + SLOT_GUIDE_PIN_OFFSET_Z;
      return out.set(rx, 0.033, rz);
    };

    calcWheelLocal(-0.96, _leftWheelLocal);
    calcWheelLocal(0.96, _rightWheelLocal);

    _leftWheelWorld
      .copy(_leftWheelLocal)
      .applyMatrix4(emitter.carGroup.matrixWorld);
    _rightWheelWorld
      .copy(_rightWheelLocal)
      .applyMatrix4(emitter.carGroup.matrixWorld);

    if (!ring.wasSkidding) {
      ring.prevLeft.copy(_leftWheelWorld);
      ring.prevRight.copy(_rightWheelWorld);
      ring.wasSkidding = true;
      return;
    }

    if (
      _leftWheelWorld.distanceToSquared(ring.prevLeft) < MIN_STAMP_DISTANCE_SQ
    ) {
      return;
    }

    _lateralDir
      .subVectors(_rightWheelWorld, _leftWheelWorld)
      .normalize()
      .multiplyScalar(TIRE_HALF_WIDTH_M);

    const vOffset = ring.writeCursor * 24;
    const p = ring.positions;

    // Rueda izquierda: prevL - lat, prevL + lat, curL - lat, curL + lat
    p[vOffset + 0] = ring.prevLeft.x - _lateralDir.x;
    p[vOffset + 1] = ring.prevLeft.y;
    p[vOffset + 2] = ring.prevLeft.z - _lateralDir.z;

    p[vOffset + 3] = ring.prevLeft.x + _lateralDir.x;
    p[vOffset + 4] = ring.prevLeft.y;
    p[vOffset + 5] = ring.prevLeft.z + _lateralDir.z;

    p[vOffset + 6] = _leftWheelWorld.x - _lateralDir.x;
    p[vOffset + 7] = _leftWheelWorld.y;
    p[vOffset + 8] = _leftWheelWorld.z - _lateralDir.z;

    p[vOffset + 9] = _leftWheelWorld.x + _lateralDir.x;
    p[vOffset + 10] = _leftWheelWorld.y;
    p[vOffset + 11] = _leftWheelWorld.z + _lateralDir.z;

    // Rueda derecha: prevR - lat, prevR + lat, curR - lat, curR + lat
    p[vOffset + 12] = ring.prevRight.x - _lateralDir.x;
    p[vOffset + 13] = ring.prevRight.y;
    p[vOffset + 14] = ring.prevRight.z - _lateralDir.z;

    p[vOffset + 15] = ring.prevRight.x + _lateralDir.x;
    p[vOffset + 16] = ring.prevRight.y;
    p[vOffset + 17] = ring.prevRight.z + _lateralDir.z;

    p[vOffset + 18] = _rightWheelWorld.x - _lateralDir.x;
    p[vOffset + 19] = _rightWheelWorld.y;
    p[vOffset + 20] = _rightWheelWorld.z - _lateralDir.z;

    p[vOffset + 21] = _rightWheelWorld.x + _lateralDir.x;
    p[vOffset + 22] = _rightWheelWorld.y;
    p[vOffset + 23] = _rightWheelWorld.z + _lateralDir.z;

    ring.prevLeft.copy(_leftWheelWorld);
    ring.prevRight.copy(_rightWheelWorld);
    ring.writeCursor = (ring.writeCursor + 1) % MAX_SKID_SEGMENTS;

    const posAttr = ring.geo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  });

  return (
    <mesh geometry={ring.geo} frustumCulled={false}>
      <meshBasicMaterial
        color="#090B0E"
        transparent
        opacity={0.58}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default SkidmarksRibbon;
