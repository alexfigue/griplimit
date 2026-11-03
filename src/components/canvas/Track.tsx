'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  DUAL_LANE_OFFSET_M,
  evaluateSplineKinematics,
  getTrackCurve,
  MONTMELO_WAYPOINTS,
  NEO_WANGAN_WAYPOINTS,
  SIERRA_SECA_WAYPOINTS,
  type SplineKinematicsResult,
} from '@/lib/montmeloSpline';
import { useTelemetryStore } from '@/store/store';
import type { TrackId } from '@/types/types';

export { MONTMELO_WAYPOINTS, SIERRA_SECA_WAYPOINTS, NEO_WANGAN_WAYPOINTS };

const TRACK_SEGMENTS = 780;
const ASPHALT_HALF_WIDTH = 3.85;
const KERB_WIDTH = 0.65;
const SLOT_RAIL_HALF_WIDTH = 0.12;
const CONDUCTOR_BRAID_HALF_WIDTH = 0.25;
const LANE_OFFSETS = [-DUAL_LANE_OFFSET_M, DUAL_LANE_OFFSET_M] as const;

/**
 * Construye las geometrías 3D de un circuito de doble carril de Scalextric:
 * 1. Cinta de asfalto de 7.7 m de ancho.
 * 2. Taludes estructurales / muros de viaducto bajo tramos elevados.
 * 3. Dos raíles metálicos paralelos (-1.25 m y +1.25 m) con sus trencillas conductoras.
 * 4. Pianos exteriores e interiores adaptados al bioma (rojiblancos o cian/blanco en Neo-Wangan).
 */
function buildDualLaneTrackGeometries(
  curve: THREE.CatmullRomCurve3,
  trackId: TrackId
) {
  const asphaltPositions: number[] = [];
  const asphaltNormals: number[] = [];
  const asphaltIndices: number[] = [];

  const skirtPositions: number[] = [];
  const skirtIndices: number[] = [];

  const braidPositions: number[] = [];
  const braidIndices: number[] = [];

  const railPositions: number[] = [];
  const railIndices: number[] = [];

  const kerbPositions: number[] = [];
  const kerbColors: number[] = [];
  const kerbIndices: number[] = [];

  const sampleBuffer: SplineKinematicsResult = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    outwardNormal: new THREE.Vector3(),
    curvature: 0,
    curvatureRadius: Infinity,
    turnSign: 0,
  };

  const accentKerb = new THREE.Color(
    trackId === 'neo-wangan' ? '#06B6D4' : '#E63946'
  );
  const whiteKerb = new THREE.Color('#F0F4F8');

  let kerbQuadCount = 0;

  const prevLeftInner = new THREE.Vector3();
  const prevLeftOuter = new THREE.Vector3();
  const prevRightInner = new THREE.Vector3();
  const prevRightOuter = new THREE.Vector3();
  let hasPrevSample = false;

  for (let i = 0; i <= TRACK_SEGMENTS; i++) {
    const u = (i % TRACK_SEGMENTS) / TRACK_SEGMENTS;
    evaluateSplineKinematics(curve, u, sampleBuffer);

    const pos = sampleBuffer.position;
    const rightVec = sampleBuffer.right;

    const leftEdge = pos.clone().addScaledVector(rightVec, -ASPHALT_HALF_WIDTH);
    const rightEdge = pos.clone().addScaledVector(rightVec, ASPHALT_HALF_WIDTH);

    asphaltPositions.push(
      leftEdge.x,
      leftEdge.y,
      leftEdge.z,
      rightEdge.x,
      rightEdge.y,
      rightEdge.z
    );
    asphaltNormals.push(0, 1, 0, 0, 1, 0);

    const baseGroundY = -0.18;
    skirtPositions.push(
      leftEdge.x,
      leftEdge.y - 0.02,
      leftEdge.z,
      leftEdge.x - rightVec.x * 1.1,
      baseGroundY,
      leftEdge.z - rightVec.z * 1.1,
      rightEdge.x,
      rightEdge.y - 0.02,
      rightEdge.z,
      rightEdge.x + rightVec.x * 1.1,
      baseGroundY,
      rightEdge.z + rightVec.z * 1.1
    );

    for (let laneIdx = 0; laneIdx < LANE_OFFSETS.length; laneIdx++) {
      const laneOffset = LANE_OFFSETS[laneIdx];
      const laneCenter = pos.clone().addScaledVector(rightVec, laneOffset);

      const lBraid = laneCenter
        .clone()
        .addScaledVector(rightVec, -CONDUCTOR_BRAID_HALF_WIDTH);
      const rBraid = laneCenter
        .clone()
        .addScaledVector(rightVec, CONDUCTOR_BRAID_HALF_WIDTH);
      braidPositions.push(
        lBraid.x,
        lBraid.y + 0.016,
        lBraid.z,
        rBraid.x,
        rBraid.y + 0.016,
        rBraid.z
      );

      const lSlot = laneCenter
        .clone()
        .addScaledVector(rightVec, -SLOT_RAIL_HALF_WIDTH);
      const rSlot = laneCenter
        .clone()
        .addScaledVector(rightVec, SLOT_RAIL_HALF_WIDTH);
      railPositions.push(
        lSlot.x,
        lSlot.y + 0.026,
        lSlot.z,
        rSlot.x,
        rSlot.y + 0.026,
        rSlot.z
      );
    }

    if (i < TRACK_SEGMENTS) {
      const base = i * 2;
      asphaltIndices.push(
        base,
        base + 1,
        base + 2,
        base + 1,
        base + 3,
        base + 2
      );

      const sBase = i * 4;
      const sNext = (i + 1) * 4;
      skirtIndices.push(sBase, sBase + 1, sNext, sBase + 1, sNext + 1, sNext);
      skirtIndices.push(
        sBase + 2,
        sNext + 2,
        sBase + 3,
        sBase + 3,
        sNext + 2,
        sNext + 3
      );

      for (let laneIdx = 0; laneIdx < 2; laneIdx++) {
        const cCur = i * 4 + laneIdx * 2;
        const cNext = (i + 1) * 4 + laneIdx * 2;
        braidIndices.push(cCur, cCur + 1, cNext, cCur + 1, cNext + 1, cNext);
        railIndices.push(cCur, cCur + 1, cNext, cCur + 1, cNext + 1, cNext);
      }
    }

    const curLeftInner = leftEdge.clone();
    const curLeftOuter = pos
      .clone()
      .addScaledVector(rightVec, -(ASPHALT_HALF_WIDTH + KERB_WIDTH));
    const curRightInner = rightEdge.clone();
    const curRightOuter = pos
      .clone()
      .addScaledVector(rightVec, ASPHALT_HALF_WIDTH + KERB_WIDTH);

    curLeftInner.y += 0.025;
    curLeftOuter.y += 0.045;
    curRightInner.y += 0.025;
    curRightOuter.y += 0.045;

    if (hasPrevSample && sampleBuffer.curvatureRadius < 68) {
      const stripeColor = Math.floor(i / 2) % 2 === 0 ? accentKerb : whiteKerb;

      const appendKerbQuad = (
        a: THREE.Vector3,
        b: THREE.Vector3,
        c: THREE.Vector3,
        d: THREE.Vector3
      ) => {
        const vOffset = kerbQuadCount * 4;
        kerbPositions.push(
          a.x,
          a.y,
          a.z,
          b.x,
          b.y,
          b.z,
          c.x,
          c.y,
          c.z,
          d.x,
          d.y,
          d.z
        );
        for (let k = 0; k < 4; k++) {
          kerbColors.push(stripeColor.r, stripeColor.g, stripeColor.b);
        }
        kerbIndices.push(
          vOffset,
          vOffset + 1,
          vOffset + 2,
          vOffset + 1,
          vOffset + 3,
          vOffset + 2
        );
        kerbQuadCount++;
      };

      appendKerbQuad(prevLeftOuter, prevLeftInner, curLeftOuter, curLeftInner);
      appendKerbQuad(
        prevRightInner,
        prevRightOuter,
        curRightInner,
        curRightOuter
      );
    }

    prevLeftInner.copy(curLeftInner);
    prevLeftOuter.copy(curLeftOuter);
    prevRightInner.copy(curRightInner);
    prevRightOuter.copy(curRightOuter);
    hasPrevSample = true;
  }

  const asphaltGeo = new THREE.BufferGeometry();
  asphaltGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(asphaltPositions, 3)
  );
  asphaltGeo.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(asphaltNormals, 3)
  );
  asphaltGeo.setIndex(asphaltIndices);
  asphaltGeo.computeVertexNormals();

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(skirtPositions, 3)
  );
  skirtGeo.setIndex(skirtIndices);
  skirtGeo.computeVertexNormals();

  const braidGeo = new THREE.BufferGeometry();
  braidGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(braidPositions, 3)
  );
  braidGeo.setIndex(braidIndices);
  braidGeo.computeVertexNormals();

  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(railPositions, 3)
  );
  railGeo.setIndex(railIndices);
  railGeo.computeVertexNormals();

  const kerbGeo = new THREE.BufferGeometry();
  kerbGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(kerbPositions, 3)
  );
  kerbGeo.setAttribute('color', new THREE.Float32BufferAttribute(kerbColors, 3));
  kerbGeo.setIndex(kerbIndices);
  kerbGeo.computeVertexNormals();

  const startPos = curve.getPointAt(0);
  const startTangent = curve.getTangentAt(0);
  const startAngleY = Math.atan2(startTangent.x, startTangent.z);

  return {
    asphaltGeo,
    skirtGeo,
    braidGeo,
    railGeo,
    kerbGeo,
    startPos,
    startAngleY,
  };
}

/**
 * Componente 3D del Circuito activo (Montmeló GP, Sierra Seca o Neo-Wangan) en doble carril.
 */
export function Track() {
  const trackId = useTelemetryStore((s) => s.trackId);

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const {
    asphaltGeo,
    skirtGeo,
    braidGeo,
    railGeo,
    kerbGeo,
    startPos,
    startAngleY,
  } = useMemo(
    () => buildDualLaneTrackGeometries(curve, trackId),
    [curve, trackId]
  );

  const isWangan = trackId === 'neo-wangan';
  const isSierra = trackId === 'sierra-seca';

  return (
    <group name={`circuit-${trackId}`}>
      {/* Taludes / pilares de viaducto */}
      <mesh geometry={skirtGeo} receiveShadow castShadow>
        <meshStandardMaterial
          color={isWangan ? '#0F172A' : isSierra ? '#2A2118' : '#161D24'}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Cinta de asfalto de doble carril */}
      <mesh geometry={asphaltGeo} receiveShadow>
        <meshStandardMaterial
          color={isWangan ? '#151B28' : '#1E242D'}
          roughness={isWangan ? 0.72 : 0.82}
          metalness={isWangan ? 0.16 : 0.08}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pianos de curva */}
      <mesh geometry={kerbGeo} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Trencillas conductoras metálicas de los 2 carriles */}
      <mesh geometry={braidGeo}>
        <meshStandardMaterial
          color={isWangan ? '#BAE6FD' : '#94A3B8'}
          metalness={0.85}
          roughness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Ranuras guía paralelas (Carril Izquierdo y Carril Derecho) */}
      <mesh geometry={railGeo}>
        <meshStandardMaterial
          color="#07090D"
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pórtico y línea de Salida / Meta */}
      <group position={startPos} rotation={[0, startAngleY, 0]}>
        <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ASPHALT_HALF_WIDTH * 2, 0.95]} />
          <meshStandardMaterial color="#F0F4F8" roughness={0.4} />
        </mesh>

        <mesh position={[-ASPHALT_HALF_WIDTH - 0.9, 2.5, 0]} castShadow>
          <boxGeometry args={[0.38, 5.0, 0.52]} />
          <meshStandardMaterial
            color="#151B24"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[ASPHALT_HALF_WIDTH + 0.9, 2.5, 0]} castShadow>
          <boxGeometry args={[0.38, 5.0, 0.52]} />
          <meshStandardMaterial
            color="#151B24"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>

        <mesh position={[0, 4.85, 0]} castShadow>
          <boxGeometry args={[ASPHALT_HALF_WIDTH * 2 + 2.2, 0.78, 0.68]} />
          <meshStandardMaterial
            color={isWangan ? '#06B6D4' : isSierra ? '#2F81F7' : '#E63946'}
            emissive={isWangan ? '#0891B2' : '#000000'}
            emissiveIntensity={isWangan ? 0.75 : 0}
            roughness={0.35}
          />
        </mesh>
      </group>
    </group>
  );
}

export default Track;
