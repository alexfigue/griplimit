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
export const ASPHALT_HALF_WIDTH = 3.85;
export const KERB_WIDTH = 0.65;
export const GUARDRAIL_LATERAL_OFFSET_M = ASPHALT_HALF_WIDTH + KERB_WIDTH + 0.12;
const SLOT_RAIL_HALF_WIDTH = 0.1;
const CONDUCTOR_BRAID_HALF_WIDTH = 0.24;
const LANE_OFFSETS = [-DUAL_LANE_OFFSET_M, DUAL_LANE_OFFSET_M] as const;

interface ProceduralTrackTextures {
  asphaltMap: THREE.CanvasTexture | null;
  asphaltBumpMap: THREE.CanvasTexture | null;
  checkeredMap: THREE.CanvasTexture | null;
}

/**
 * Genera texturas PBR procedurales de alta definición para el asfalto:
 * - Grano mineral de árido bituminoso + mapa de relieve (bumpMap).
 * - Líneas blancas continuas de límite de pista FIA en ambos márgenes.
 * - Huellas oscuras de caucho depositado en las zonas de apoyo de los 2 carriles.
 * - Textura de bandera a cuadros para la línea de meta.
 */
function createProceduralTrackTextures(
  trackId: TrackId
): ProceduralTrackTextures {
  if (typeof document === 'undefined') {
    return { asphaltMap: null, asphaltBumpMap: null, checkeredMap: null };
  }

  const width = 512;
  const height = 512;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const ctx = diffCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d');

  const isWangan = trackId === 'neo-wangan';
  const isSierra = trackId === 'sierra-seca';

  if (ctx && bCtx) {
    // 1. Base asfáltica según el circuito
    ctx.fillStyle = isWangan ? '#182030' : isSierra ? '#252830' : '#21262E';
    ctx.fillRect(0, 0, width, height);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, width, height);

    // 2. Micro-grano de árido mineral (determinista para evitar parpadeos)
    const imgData = ctx.getImageData(0, 0, width, height);
    const bumpData = bCtx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const bd = bumpData.data;

    let seed = trackId === 'montmelo' ? 1337 : isSierra ? 4201 : 9001;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / width; // 0 = borde izq (-3.85m), 1 = borde der (+3.85m)
        const idx = (y * width + x) * 4;

        const grain = (nextRand() - 0.5) * 26;
        const fineSpeck = nextRand() > 0.92 ? 16 : nextRand() < 0.08 ? -14 : 0;

        // Oscurecimiento por goma de neumáticos en las huellas de los 2 carriles
        // Carril izq en u ≈ 0.338, carril der en u ≈ 0.662
        const distLaneL1 = Math.abs(u - 0.26);
        const distLaneL2 = Math.abs(u - 0.41);
        const distLaneR1 = Math.abs(u - 0.59);
        const distLaneR2 = Math.abs(u - 0.74);

        const tireGroove =
          Math.exp(-distLaneL1 * distLaneL1 * 520) +
          Math.exp(-distLaneL2 * distLaneL2 * 520) +
          Math.exp(-distLaneR1 * distLaneR1 * 520) +
          Math.exp(-distLaneR2 * distLaneR2 * 520);

        const rubberDarken = -tireGroove * 15;
        const delta = grain + fineSpeck + rubberDarken;

        d[idx] = Math.max(0, Math.min(255, d[idx] + delta));
        d[idx + 1] = Math.max(0, Math.min(255, d[idx + 1] + delta));
        d[idx + 2] = Math.max(0, Math.min(255, d[idx + 2] + delta));

        const bumpVal = Math.max(
          0,
          Math.min(255, 128 + grain * 2.4 + fineSpeck * 1.8)
        );
        bd[idx] = bumpVal;
        bd[idx + 1] = bumpVal;
        bd[idx + 2] = bumpVal;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    bCtx.putImageData(bumpData, 0, 0);

    // 3. Líneas blancas continuas de límite de pista (FIA Track Limits)
    ctx.fillStyle = isWangan ? 'rgba(224, 242, 254, 0.9)' : 'rgba(241, 245, 249, 0.88)';
    const lineLeftX = Math.round(width * 0.032);
    const lineRightX = Math.round(width * 0.952);
    const lineWidth = Math.round(width * 0.016);
    ctx.fillRect(lineLeftX, 0, lineWidth, height);
    ctx.fillRect(lineRightX, 0, lineWidth, height);

    // 4. Línea divisoria central discontinua sutil entre los 2 carriles
    ctx.fillStyle = isWangan
      ? 'rgba(56, 189, 248, 0.32)'
      : 'rgba(255, 255, 255, 0.22)';
    const centerLineX = Math.round(width * 0.495);
    const centerLineW = Math.max(2, Math.round(width * 0.01));
    ctx.fillRect(centerLineX, 0, centerLineW, Math.round(height * 0.45));
  }

  const asphaltMap = new THREE.CanvasTexture(diffCanvas);
  asphaltMap.wrapS = THREE.ClampToEdgeWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = 8;
  asphaltMap.needsUpdate = true;

  const asphaltBumpMap = new THREE.CanvasTexture(bumpCanvas);
  asphaltBumpMap.wrapS = THREE.ClampToEdgeWrapping;
  asphaltBumpMap.wrapT = THREE.RepeatWrapping;
  asphaltBumpMap.anisotropy = 8;
  asphaltBumpMap.needsUpdate = true;

  // 5. Textura ajedrezada de línea de Salida / Meta
  const chkCanvas = document.createElement('canvas');
  chkCanvas.width = 512;
  chkCanvas.height = 128;
  const cCtx = chkCanvas.getContext('2d');
  if (cCtx) {
    const cols = 16;
    const rows = 4;
    const cw = chkCanvas.width / cols;
    const ch = chkCanvas.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cCtx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
        cCtx.fillRect(c * cw, r * ch, cw, ch);
      }
    }
  }
  const checkeredMap = new THREE.CanvasTexture(chkCanvas);
  checkeredMap.anisotropy = 8;
  checkeredMap.needsUpdate = true;

  return { asphaltMap, asphaltBumpMap, checkeredMap };
}

/**
 * Construye las geometrías 3D del circuito de doble carril:
 * 1. Cinta de asfalto con coordenadas UV para textura PBR y mapa de relieve.
 * 2. Taludes estructurales / muros de hormigón bajo tramos elevados.
 * 3. Dos raíles guía paralelos (-1.25 m y +1.25 m) con sus trencillas conductoras metálicas.
 * 4. Pianos FIA 3D con relieve dentado en curvas.
 * 5. Barreras metálicas Armco de doble onda y postes de acero a ambos lados de la pista.
 */
function buildDualLaneTrackGeometries(
  curve: THREE.CatmullRomCurve3,
  trackId: TrackId
) {
  const asphaltPositions: number[] = [];
  const asphaltNormals: number[] = [];
  const asphaltUvs: number[] = [];
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

  const guardrailPositions: number[] = [];
  const guardrailColors: number[] = [];
  const guardrailIndices: number[] = [];

  const sampleBuffer: SplineKinematicsResult = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    outwardNormal: new THREE.Vector3(),
    curvature: 0,
    curvatureRadius: Infinity,
    turnSign: 0,
  };

  const isWangan = trackId === 'neo-wangan';
  const accentKerb = new THREE.Color(isWangan ? '#06B6D4' : '#E63946');
  const whiteKerb = new THREE.Color('#F1F5F9');

  const steelBarrierColor = new THREE.Color(isWangan ? '#64748B' : '#94A3B8');
  const steelDarkColor = new THREE.Color('#334155');
  const chevronAccentColor = new THREE.Color(isWangan ? '#0EA5E9' : '#DC2626');

  let kerbQuadCount = 0;
  let guardrailQuadCount = 0;

  const prevLeftInner = new THREE.Vector3();
  const prevLeftOuter = new THREE.Vector3();
  const prevRightInner = new THREE.Vector3();
  const prevRightOuter = new THREE.Vector3();

  const prevGuardLeftBottom = new THREE.Vector3();
  const prevGuardLeftTop = new THREE.Vector3();
  const prevGuardRightBottom = new THREE.Vector3();
  const prevGuardRightTop = new THREE.Vector3();

  let hasPrevSample = false;

  const appendColoredQuad = (
    positions: number[],
    colors: number[],
    indices: number[],
    quadIndex: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    colTop: THREE.Color,
    colBottom: THREE.Color = colTop
  ) => {
    const vOffset = quadIndex * 4;
    positions.push(
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
    colors.push(
      colBottom.r,
      colBottom.g,
      colBottom.b,
      colTop.r,
      colTop.g,
      colTop.b,
      colBottom.r,
      colBottom.g,
      colBottom.b,
      colTop.r,
      colTop.g,
      colTop.b
    );
    indices.push(
      vOffset,
      vOffset + 1,
      vOffset + 2,
      vOffset + 1,
      vOffset + 3,
      vOffset + 2
    );
  };

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

    const vCoord = (i / TRACK_SEGMENTS) * 110;
    asphaltUvs.push(0, vCoord, 1, vCoord);

    const baseGroundY = -0.18;
    skirtPositions.push(
      leftEdge.x,
      leftEdge.y - 0.02,
      leftEdge.z,
      leftEdge.x - rightVec.x * 1.15,
      baseGroundY,
      leftEdge.z - rightVec.z * 1.15,
      rightEdge.x,
      rightEdge.y - 0.02,
      rightEdge.z,
      rightEdge.x + rightVec.x * 1.15,
      baseGroundY,
      rightEdge.z + rightVec.z * 1.15
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

    // Pianos FIA con relieve dentado 3D (sawtooth)
    const sawtooth = i % 2 === 0 ? 0.014 : 0;
    const curLeftInner = leftEdge.clone();
    const curLeftOuter = pos
      .clone()
      .addScaledVector(rightVec, -(ASPHALT_HALF_WIDTH + KERB_WIDTH));
    const curRightInner = rightEdge.clone();
    const curRightOuter = pos
      .clone()
      .addScaledVector(rightVec, ASPHALT_HALF_WIDTH + KERB_WIDTH);

    curLeftInner.y += 0.022;
    curLeftOuter.y += 0.055 + sawtooth;
    curRightInner.y += 0.022;
    curRightOuter.y += 0.055 + sawtooth;

    // Barreras metálicas exteriores Armco (borde de contención de pista)
    const curGuardLeftBottom = pos
      .clone()
      .addScaledVector(rightVec, -GUARDRAIL_LATERAL_OFFSET_M);
    const curGuardLeftTop = curGuardLeftBottom.clone();
    curGuardLeftBottom.y += 0.08;
    curGuardLeftTop.y += 0.48;

    const curGuardRightBottom = pos
      .clone()
      .addScaledVector(rightVec, GUARDRAIL_LATERAL_OFFSET_M);
    const curGuardRightTop = curGuardRightBottom.clone();
    curGuardRightBottom.y += 0.08;
    curGuardRightTop.y += 0.48;

    if (hasPrevSample) {
      if (sampleBuffer.curvatureRadius < 92) {
        const isAccentBlock = Math.floor(i / 2) % 2 === 0;
        const stripeColor = isAccentBlock ? accentKerb : whiteKerb;

        appendColoredQuad(
          kerbPositions,
          kerbColors,
          kerbIndices,
          kerbQuadCount++,
          prevLeftOuter,
          prevLeftInner,
          curLeftOuter,
          curLeftInner,
          stripeColor
        );
        appendColoredQuad(
          kerbPositions,
          kerbColors,
          kerbIndices,
          kerbQuadCount++,
          prevRightInner,
          prevRightOuter,
          curRightInner,
          curRightOuter,
          stripeColor
        );
      }

      // En curvas cerradas pintamos chevrons de advertencia sobre la barrera Armco; en recta acero galvanizado
      const isSharpCorner = sampleBuffer.curvatureRadius < 42;
      const barrierTopColor = isSharpCorner
        ? Math.floor(i / 3) % 2 === 0
          ? chevronAccentColor
          : whiteKerb
        : steelBarrierColor;

      appendColoredQuad(
        guardrailPositions,
        guardrailColors,
        guardrailIndices,
        guardrailQuadCount++,
        prevGuardLeftBottom,
        prevGuardLeftTop,
        curGuardLeftBottom,
        curGuardLeftTop,
        barrierTopColor,
        steelDarkColor
      );
      appendColoredQuad(
        guardrailPositions,
        guardrailColors,
        guardrailIndices,
        guardrailQuadCount++,
        prevGuardRightBottom,
        prevGuardRightTop,
        curGuardRightBottom,
        curGuardRightTop,
        barrierTopColor,
        steelDarkColor
      );
    }

    prevLeftInner.copy(curLeftInner);
    prevLeftOuter.copy(curLeftOuter);
    prevRightInner.copy(curRightInner);
    prevRightOuter.copy(curRightOuter);

    prevGuardLeftBottom.copy(curGuardLeftBottom);
    prevGuardLeftTop.copy(curGuardLeftTop);
    prevGuardRightBottom.copy(curGuardRightBottom);
    prevGuardRightTop.copy(curGuardRightTop);
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
  asphaltGeo.setAttribute('uv', new THREE.Float32BufferAttribute(asphaltUvs, 2));
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

  const guardrailGeo = new THREE.BufferGeometry();
  guardrailGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(guardrailPositions, 3)
  );
  guardrailGeo.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(guardrailColors, 3)
  );
  guardrailGeo.setIndex(guardrailIndices);
  guardrailGeo.computeVertexNormals();

  const startPos = curve.getPointAt(0);
  const startTangent = curve.getTangentAt(0);
  const startAngleY = Math.atan2(startTangent.x, startTangent.z);

  return {
    asphaltGeo,
    skirtGeo,
    braidGeo,
    railGeo,
    kerbGeo,
    guardrailGeo,
    startPos,
    startAngleY,
  };
}

/**
 * Componente 3D del Circuito activo (Montmeló GP, Sierra Seca o Neo-Wangan) con:
 * - Asfalto PBR granulado con relieve, líneas blancas FIA y goma en trazada.
 * - Pianos 3D dentados y guardarrail metálico Armco de doble onda en todo el perímetro.
 * - Línea de meta ajedrezada, cajones de parrilla F1 y pórtico con semáforo de 5 luces.
 */
export function Track() {
  const trackId = useTelemetryStore((s) => s.trackId);
  const weatherMode = useTelemetryStore((s) => s.weatherMode);
  const cupStartPhase = useTelemetryStore((s) => s.cupStartPhase);
  const countdownLights = useTelemetryStore((s) => s.countdownLights);

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const {
    asphaltGeo,
    skirtGeo,
    braidGeo,
    railGeo,
    kerbGeo,
    guardrailGeo,
    startPos,
    startAngleY,
  } = useMemo(
    () => buildDualLaneTrackGeometries(curve, trackId),
    [curve, trackId]
  );

  const { asphaltMap, asphaltBumpMap, checkeredMap } = useMemo(
    () => createProceduralTrackTextures(trackId),
    [trackId]
  );

  const isWangan = trackId === 'neo-wangan';
  const isSierra = trackId === 'sierra-seca';
  const isRain = weatherMode === 'rain';

  return (
    <group name={`circuit-${trackId}`}>
      {/* Taludes / muros de hormigón de soporte */}
      <mesh geometry={skirtGeo} receiveShadow castShadow>
        <meshStandardMaterial
          color={isWangan ? '#0F172A' : isSierra ? '#2A2118' : '#1E2530'}
          roughness={isRain ? 0.55 : 0.88}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Cinta de asfalto PBR con textura de grano mineral, relieve, líneas blancas y goma en trazada */}
      <mesh geometry={asphaltGeo} receiveShadow>
        <meshStandardMaterial
          map={asphaltMap}
          bumpMap={asphaltBumpMap}
          bumpScale={isRain ? 0.012 : 0.028}
          color={isRain ? '#CBD5E1' : '#FFFFFF'}
          roughness={isRain ? 0.18 : isWangan ? 0.72 : 0.82}
          metalness={isRain ? 0.52 : isWangan ? 0.14 : 0.06}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pianos de curva FIA con relieve dentado */}
      <mesh geometry={kerbGeo} receiveShadow castShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.48}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Guardarrail metálico Armco perimetral */}
      <mesh geometry={guardrailGeo} receiveShadow castShadow>
        <meshStandardMaterial
          vertexColors
          metalness={0.78}
          roughness={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Trencillas conductoras metálicas de los 2 carriles */}
      <mesh geometry={braidGeo}>
        <meshStandardMaterial
          color={isWangan ? '#BAE6FD' : '#CBD5E1'}
          metalness={0.88}
          roughness={0.22}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Ranuras guía paralelas (Carril Izquierdo y Carril Derecho) */}
      <mesh geometry={railGeo}>
        <meshStandardMaterial
          color="#05070B"
          roughness={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pórtico, Parrilla F1 y Línea Ajedrezada de Salida / Meta */}
      <group position={startPos} rotation={[0, startAngleY, 0]}>
        {/* Línea de Meta con textura de bandera a cuadros */}
        <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ASPHALT_HALF_WIDTH * 2 - 0.5, 1.15]} />
          <meshStandardMaterial
            map={checkeredMap}
            roughness={0.38}
            metalness={0.05}
          />
        </mesh>

        {/* Cajones de Parrilla F1 (P1 y P2) pintados en ambos carriles */}
        {LANE_OFFSETS.map((lx, idx) => (
          <group key={lx} position={[lx, 0.031, -2.4 - idx * 1.2]}>
            {/* Línea frontal del cajón de salida */}
            <mesh position={[0, 0, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1.65, 0.14]} />
              <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
            </mesh>
            {/* Líneas laterales del cajón */}
            <mesh position={[-0.78, 0, 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.12, 1.4]} />
              <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
            </mesh>
            <mesh position={[0.78, 0, 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.12, 1.4]} />
              <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* Pilares del Pórtico FIA */}
        <mesh position={[-ASPHALT_HALF_WIDTH - 0.9, 2.5, 0]} castShadow>
          <boxGeometry args={[0.42, 5.0, 0.56]} />
          <meshStandardMaterial
            color="#151B24"
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[ASPHALT_HALF_WIDTH + 0.9, 2.5, 0]} castShadow>
          <boxGeometry args={[0.42, 5.0, 0.56]} />
          <meshStandardMaterial
            color="#151B24"
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>

        {/* Puente superior del Pórtico */}
        <mesh position={[0, 4.85, 0]} castShadow>
          <boxGeometry args={[ASPHALT_HALF_WIDTH * 2 + 2.2, 0.82, 0.72]} />
          <meshStandardMaterial
            color={isWangan ? '#06B6D4' : isSierra ? '#2F81F7' : '#E63946'}
            emissive={isWangan ? '#0891B2' : '#000000'}
            emissiveIntensity={isWangan ? 0.75 : 0}
            roughness={0.3}
            metalness={0.35}
          />
        </mesh>

        {/* Semáforo Oficial F1 de 5 Focos en el Pórtico de Salida */}
        {([-2.4, -1.2, 0, 1.2, 2.4] as const).map((lx, idx) => {
          const lightIndex = idx + 1;
          const isRedOn =
            cupStartPhase === 'countdown' && countdownLights >= lightIndex;
          const isGreenOn = cupStartPhase === 'green';

          const bulbColor = isRedOn
            ? '#FF1E38'
            : isGreenOn
              ? '#10B981'
              : '#1E293B';
          const emissiveColor = isRedOn
            ? '#FF1E38'
            : isGreenOn
              ? '#10B981'
              : '#000000';

          return (
            <group key={lightIndex} position={[lx, 4.18, 0]}>
              <mesh>
                <boxGeometry args={[0.72, 0.68, 0.42]} />
                <meshStandardMaterial color="#0D1117" roughness={0.6} />
              </mesh>
              <mesh position={[0, 0, -0.22]}>
                <sphereGeometry args={[0.21, 14, 14]} />
                <meshStandardMaterial
                  color={bulbColor}
                  emissive={emissiveColor}
                  emissiveIntensity={isRedOn || isGreenOn ? 3.5 : 0}
                />
              </mesh>
              <mesh position={[0, 0, 0.22]}>
                <sphereGeometry args={[0.21, 14, 14]} />
                <meshStandardMaterial
                  color={bulbColor}
                  emissive={emissiveColor}
                  emissiveIntensity={isRedOn || isGreenOn ? 3.5 : 0}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

export default Track;
