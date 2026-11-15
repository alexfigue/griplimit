'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
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
const GRAVEL_TRAP_WIDTH_M = 4.2;
const SLOT_RAIL_HALF_WIDTH = 0.1;
const CONDUCTOR_BRAID_HALF_WIDTH = 0.24;
const LANE_OFFSETS = [-DUAL_LANE_OFFSET_M, DUAL_LANE_OFFSET_M] as const;

export type BrakingBoardDistance = 150 | 100 | 50;

export interface BrakingBoardPlacement {
  distanceLabel: BrakingBoardDistance;
  position: THREE.Vector3;
  rotationY: number;
}

export interface TireStackPlacement {
  position: THREE.Vector3;
  rotationY: number;
  isAccentTop: boolean;
}

interface ProceduralTrackTextures {
  asphaltMap: THREE.CanvasTexture | null;
  asphaltBumpMap: THREE.CanvasTexture | null;
  checkeredMap: THREE.CanvasTexture | null;
  gravelMap: THREE.CanvasTexture | null;
  boardMaps: Record<BrakingBoardDistance, THREE.CanvasTexture | null>;
}

/**
 * Genera texturas PBR procedurales de alta definición para el circuito:
 * - Asfalto granulado con relieve, líneas blancas FIA y goma en trazada.
 * - Textura de grava para las escapatorias exteriores.
 * - Carteles oficiales FIA de distancia de frenada (150m, 100m, 50m).
 * - Bandera a cuadros para la línea de meta.
 */
function createProceduralTrackTextures(
  trackId: TrackId
): ProceduralTrackTextures {
  if (typeof document === 'undefined') {
    return {
      asphaltMap: null,
      asphaltBumpMap: null,
      checkeredMap: null,
      gravelMap: null,
      boardMaps: { 150: null, 100: null, 50: null },
    };
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

  let seed = trackId === 'montmelo' ? 1337 : isSierra ? 4201 : 9001;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  if (ctx && bCtx) {
    ctx.fillStyle = isWangan ? '#182030' : isSierra ? '#252830' : '#21262E';
    ctx.fillRect(0, 0, width, height);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const bumpData = bCtx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const bd = bumpData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const idx = (y * width + x) * 4;

        const grain = (nextRand() - 0.5) * 26;
        const fineSpeck = nextRand() > 0.92 ? 16 : nextRand() < 0.08 ? -14 : 0;

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

    // Líneas blancas continuas de límite de pista FIA
    ctx.fillStyle = isWangan
      ? 'rgba(224, 242, 254, 0.9)'
      : 'rgba(241, 245, 249, 0.88)';
    const lineLeftX = Math.round(width * 0.032);
    const lineRightX = Math.round(width * 0.952);
    const lineWidth = Math.round(width * 0.016);
    ctx.fillRect(lineLeftX, 0, lineWidth, height);
    ctx.fillRect(lineRightX, 0, lineWidth, height);

    // Línea divisoria central discontinua entre carriles
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

  // Textura granular de Grava para las escapatorias (Gravel Traps)
  const grvCanvas = document.createElement('canvas');
  grvCanvas.width = 128;
  grvCanvas.height = 128;
  const gCtx = grvCanvas.getContext('2d');
  if (gCtx) {
    gCtx.fillStyle = isWangan ? '#1E293B' : isSierra ? '#B89772' : '#C8B99E';
    gCtx.fillRect(0, 0, 128, 128);
    const gImg = gCtx.getImageData(0, 0, 128, 128);
    const gd = gImg.data;
    for (let i = 0; i < 128 * 128; i++) {
      const idx = i * 4;
      const pebble = (nextRand() - 0.5) * 44;
      gd[idx] = Math.max(0, Math.min(255, gd[idx] + pebble));
      gd[idx + 1] = Math.max(0, Math.min(255, gd[idx + 1] + pebble));
      gd[idx + 2] = Math.max(0, Math.min(255, gd[idx + 2] + pebble));
    }
    gCtx.putImageData(gImg, 0, 0);
  }
  const gravelMap = new THREE.CanvasTexture(grvCanvas);
  gravelMap.wrapS = THREE.RepeatWrapping;
  gravelMap.wrapT = THREE.RepeatWrapping;
  gravelMap.anisotropy = 4;
  gravelMap.needsUpdate = true;

  // Textura ajedrezada de línea de Salida / Meta
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

  // Carteles de Frenada FIA (150m, 100m, 50m)
  const buildBoardTex = (dist: BrakingBoardDistance): THREE.CanvasTexture => {
    const bCan = document.createElement('canvas');
    bCan.width = 256;
    bCan.height = 192;
    const bc = bCan.getContext('2d');
    if (bc) {
      bc.fillStyle = '#F8FAFC';
      bc.fillRect(0, 0, 256, 192);

      // Marco perimetral rojo/azul FIA
      bc.lineWidth = 12;
      bc.strokeStyle = isWangan ? '#06B6D4' : '#E63946';
      bc.strokeRect(6, 6, 244, 180);

      // Bandas superiores de referencia (3 barras = 150m, 2 barras = 100m, 1 barra = 50m)
      const bars = dist === 150 ? 3 : dist === 100 ? 2 : 1;
      bc.fillStyle = '#0F172A';
      for (let b = 0; b < bars; b++) {
        bc.fillRect(28 + b * 72, 22, 52, 14);
      }

      // Número de distancia de frenada
      bc.fillStyle = '#0F172A';
      bc.font = '900 84px sans-serif';
      bc.textAlign = 'center';
      bc.textBaseline = 'middle';
      bc.fillText(`${dist}m`, 128, 118);
    }
    const tex = new THREE.CanvasTexture(bCan);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    asphaltMap,
    asphaltBumpMap,
    checkeredMap,
    gravelMap,
    boardMaps: {
      150: buildBoardTex(150),
      100: buildBoardTex(100),
      50: buildBoardTex(50),
    },
  };
}

/**
 * Construye las geometrías 3D del circuito de doble carril y calcula las posiciones de:
 * - Escapatorias de grava (Gravel Traps) en el exterior de las curvas críticas.
 * - Barreras de neumáticos 3D rojiblancos (Tire Walls) junto al guardarrail exterior.
 * - Carteles FIA de distancia de frenada (150m, 100m, 50m) antes de cada frenada fuerte.
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

  const gravelPositions: number[] = [];
  const gravelUvs: number[] = [];
  const gravelIndices: number[] = [];

  const tireStackPlacements: TireStackPlacement[] = [];
  const brakingBoards: BrakingBoardPlacement[] = [];
  const bridgePillars: Array<{
    position: THREE.Vector3;
    height: number;
    topY: number;
    rotationY: number;
  }> = [];

  const sampleBuffer: SplineKinematicsResult = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    outwardNormal: new THREE.Vector3(),
    curvature: 0,
    curvatureRadius: Infinity,
    turnSign: 0,
  };

  // Pre-muestreamos los 780 segmentos para poder colocar carteles de frenada hacia atrás respecto al inicio de curva
  const preSamples: Array<{
    pos: THREE.Vector3;
    tangent: THREE.Vector3;
    right: THREE.Vector3;
    outRightSign: 1 | -1;
    curvatureRadius: number;
  }> = [];

  for (let i = 0; i <= TRACK_SEGMENTS; i++) {
    const u = (i % TRACK_SEGMENTS) / TRACK_SEGMENTS;
    evaluateSplineKinematics(curve, u, sampleBuffer);
    const outRightSign: 1 | -1 =
      sampleBuffer.outwardNormal.dot(sampleBuffer.right) >= 0 ? 1 : -1;
    preSamples.push({
      pos: sampleBuffer.position.clone(),
      tangent: sampleBuffer.tangent.clone(),
      right: sampleBuffer.right.clone(),
      outRightSign,
      curvatureRadius: sampleBuffer.curvatureRadius,
    });
  }

  // Detectar puntos de entrada a curvas fuertes (donde el radio cae por debajo de 38 m tras una recta/zona rápida)
  let lastBrakingZoneIdx = -999;
  for (let i = 18; i < TRACK_SEGMENTS - 18; i++) {
    const prevR = preSamples[(i - 8 + TRACK_SEGMENTS) % TRACK_SEGMENTS].curvatureRadius;
    const curR = preSamples[i].curvatureRadius;
    if (
      curR < 38 &&
      prevR > 48 &&
      i - lastBrakingZoneIdx >= 58
    ) {
      lastBrakingZoneIdx = i;
      const outSign = preSamples[i].outRightSign;

      const markerOffsets: Array<{ segBack: number; label: BrakingBoardDistance }> = [
        { segBack: 30, label: 150 },
        { segBack: 20, label: 100 },
        { segBack: 10, label: 50 },
      ];

      for (const m of markerOffsets) {
        const sIdx = (i - m.segBack + TRACK_SEGMENTS) % TRACK_SEGMENTS;
        const node = preSamples[sIdx];
        const boardPos = node.pos
          .clone()
          .addScaledVector(
            node.right,
            outSign * (GUARDRAIL_LATERAL_OFFSET_M + 1.05)
          );
        const angleY = Math.atan2(node.tangent.x, node.tangent.z) + Math.PI;
        brakingBoards.push({
          distanceLabel: m.label,
          position: boardPos,
          rotationY: angleY,
        });
      }
    }
  }

  const isWangan = trackId === 'neo-wangan';
  const accentKerb = new THREE.Color(isWangan ? '#06B6D4' : '#E63946');
  const whiteKerb = new THREE.Color('#F1F5F9');

  const steelBarrierColor = new THREE.Color(isWangan ? '#64748B' : '#94A3B8');
  const steelDarkColor = new THREE.Color('#334155');
  const chevronAccentColor = new THREE.Color(isWangan ? '#0EA5E9' : '#DC2626');

  let kerbQuadCount = 0;
  let guardrailQuadCount = 0;
  let gravelQuadCount = 0;

  const prevLeftInner = new THREE.Vector3();
  const prevLeftOuter = new THREE.Vector3();
  const prevRightInner = new THREE.Vector3();
  const prevRightOuter = new THREE.Vector3();

  const prevGuardLeftBottom = new THREE.Vector3();
  const prevGuardLeftTop = new THREE.Vector3();
  const prevGuardRightBottom = new THREE.Vector3();
  const prevGuardRightTop = new THREE.Vector3();

  const prevGravelLeftInner = new THREE.Vector3();
  const prevGravelLeftOuter = new THREE.Vector3();
  const prevGravelRightInner = new THREE.Vector3();
  const prevGravelRightOuter = new THREE.Vector3();

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

  const appendUvQuad = (
    positions: number[],
    uvs: number[],
    indices: number[],
    quadIndex: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    v0: number,
    v1: number
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
    uvs.push(0, v0, 1, v0, 0, v1, 1, v1);
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
    const node = preSamples[i];
    const pos = node.pos;
    const rightVec = node.right;

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

    // Tablero estructural 3D de puente/viaducto (espesor constante 0.58 m con cara inferior cerrada y paso inferior libre)
    const DECK_THICKNESS_M = 0.58;
    const deckHalfWidth = ASPHALT_HALF_WIDTH + KERB_WIDTH + 0.14;
    const leftDeck = pos.clone().addScaledVector(rightVec, -deckHalfWidth);
    const rightDeck = pos.clone().addScaledVector(rightVec, deckHalfWidth);

    skirtPositions.push(
      leftDeck.x,
      leftDeck.y,
      leftDeck.z,
      leftDeck.x,
      leftDeck.y - DECK_THICKNESS_M,
      leftDeck.z,
      rightDeck.x,
      rightDeck.y,
      rightDeck.z,
      rightDeck.x,
      rightDeck.y - DECK_THICKNESS_M,
      rightDeck.z
    );

    if (
      i < TRACK_SEGMENTS &&
      i % 24 === 0 &&
      pos.y - DECK_THICKNESS_M > 1.35
    ) {
      let clearBelow = true;
      for (let j = 0; j < TRACK_SEGMENTS; j += 3) {
        const segDiff = Math.abs(j - i);
        if (segDiff < 26 || TRACK_SEGMENTS - segDiff < 26) continue;
        const otherPos = preSamples[j].pos;
        const distXZ = Math.hypot(otherPos.x - pos.x, otherPos.z - pos.z);
        if (distXZ < 14.5) {
          clearBelow = false;
          break;
        }
      }
      if (clearBelow) {
        const topY = pos.y - DECK_THICKNESS_M;
        const groundY = -0.25;
        const height = Math.max(0.8, topY - groundY);
        const angleY = Math.atan2(node.tangent.x, node.tangent.z);
        bridgePillars.push({
          position: new THREE.Vector3(pos.x, groundY + height * 0.5, pos.z),
          height,
          topY,
          rotationY: angleY,
        });
      }
    }

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
      // Pared lateral izquierda del tablero
      skirtIndices.push(sBase, sBase + 1, sNext, sBase + 1, sNext + 1, sNext);
      // Pared lateral derecha del tablero
      skirtIndices.push(
        sBase + 2,
        sNext + 2,
        sBase + 3,
        sBase + 3,
        sNext + 2,
        sNext + 3
      );
      // Cara inferior cerrada (intradós del puente) para vista limpia al cruzar por debajo
      skirtIndices.push(
        sBase + 1,
        sBase + 3,
        sNext + 1,
        sBase + 3,
        sNext + 3,
        sNext + 1
      );

      for (let laneIdx = 0; laneIdx < 2; laneIdx++) {
        const cCur = i * 4 + laneIdx * 2;
        const cNext = (i + 1) * 4 + laneIdx * 2;
        braidIndices.push(cCur, cCur + 1, cNext, cCur + 1, cNext + 1, cNext);
        railIndices.push(cCur, cCur + 1, cNext, cCur + 1, cNext + 1, cNext);
      }
    }

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

    // Escapatorias de grava detrás del piano / guardarrail exterior
    const curGravelLeftInner = pos
      .clone()
      .addScaledVector(rightVec, -(ASPHALT_HALF_WIDTH + KERB_WIDTH));
    const curGravelLeftOuter = pos
      .clone()
      .addScaledVector(
        rightVec,
        -(ASPHALT_HALF_WIDTH + KERB_WIDTH + GRAVEL_TRAP_WIDTH_M)
      );
    curGravelLeftInner.y += 0.01;
    curGravelLeftOuter.y += 0.03;

    const curGravelRightInner = pos
      .clone()
      .addScaledVector(rightVec, ASPHALT_HALF_WIDTH + KERB_WIDTH);
    const curGravelRightOuter = pos
      .clone()
      .addScaledVector(
        rightVec,
        ASPHALT_HALF_WIDTH + KERB_WIDTH + GRAVEL_TRAP_WIDTH_M
      );
    curGravelRightInner.y += 0.01;
    curGravelRightOuter.y += 0.03;

    if (hasPrevSample) {
      if (node.curvatureRadius < 92) {
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

      const isSharpCorner = node.curvatureRadius < 42;
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

      // En curvas críticas añadimos Escapatoria de Grava y Muros de Neumáticos rojiblancos en el lado exterior
      if (isSharpCorner) {
        const gv0 = ((i - 1) / TRACK_SEGMENTS) * 65;
        const gv1 = (i / TRACK_SEGMENTS) * 65;

        if (node.outRightSign < 0) {
          appendUvQuad(
            gravelPositions,
            gravelUvs,
            gravelIndices,
            gravelQuadCount++,
            prevGravelLeftOuter,
            prevGravelLeftInner,
            curGravelLeftOuter,
            curGravelLeftInner,
            gv0,
            gv1
          );
        } else {
          appendUvQuad(
            gravelPositions,
            gravelUvs,
            gravelIndices,
            gravelQuadCount++,
            prevGravelRightInner,
            prevGravelRightOuter,
            curGravelRightInner,
            curGravelRightOuter,
            gv0,
            gv1
          );
        }

        // Pilas de neumáticos 3D cada 2 segmentos pegadas a la barrera exterior
        if (i % 2 === 0 && i > 12 && i < TRACK_SEGMENTS - 12) {
          const tirePos = pos
            .clone()
            .addScaledVector(
              rightVec,
              node.outRightSign * (GUARDRAIL_LATERAL_OFFSET_M - 0.34)
            );
          tireStackPlacements.push({
            position: tirePos,
            rotationY: Math.atan2(node.tangent.x, node.tangent.z),
            isAccentTop: Math.floor(i / 2) % 2 === 0,
          });
        }
      }
    }

    prevLeftInner.copy(curLeftInner);
    prevLeftOuter.copy(curLeftOuter);
    prevRightInner.copy(curRightInner);
    prevRightOuter.copy(curRightOuter);

    prevGuardLeftBottom.copy(curGuardLeftBottom);
    prevGuardLeftTop.copy(curGuardLeftTop);
    prevGuardRightBottom.copy(curGuardRightBottom);
    prevGuardRightTop.copy(curGuardRightTop);

    prevGravelLeftInner.copy(curGravelLeftInner);
    prevGravelLeftOuter.copy(curGravelLeftOuter);
    prevGravelRightInner.copy(curGravelRightInner);
    prevGravelRightOuter.copy(curGravelRightOuter);

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

  const gravelGeo = new THREE.BufferGeometry();
  gravelGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(gravelPositions, 3)
  );
  gravelGeo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(gravelUvs, 2)
  );
  gravelGeo.setIndex(gravelIndices);
  gravelGeo.computeVertexNormals();

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
    gravelGeo,
    tireStackPlacements,
    brakingBoards,
    bridgePillars,
    startPos,
    startAngleY,
  };
}

/**
 * Muros de neumáticos de protección FIA (InstancedMesh de 2 capas alternando Rojo/Cian y Blanco).
 */
function TireWallBarriers({
  placements,
  isWangan,
}: {
  placements: TireStackPlacement[];
  isWangan: boolean;
}) {
  const bottomTiresRef = useRef<THREE.InstancedMesh>(null);
  const topTiresRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const bottomMesh = bottomTiresRef.current;
    const topMesh = topTiresRef.current;
    if (!bottomMesh || !topMesh || placements.length === 0) return;

    const dummy = new THREE.Object3D();
    const accentCol = new THREE.Color(isWangan ? '#06B6D4' : '#E63946');
    const whiteCol = new THREE.Color('#F8FAFC');

    placements.forEach((p, idx) => {
      dummy.position.set(p.position.x, p.position.y + 0.14, p.position.z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.updateMatrix();
      bottomMesh.setMatrixAt(idx, dummy.matrix);
      bottomMesh.setColorAt(idx, p.isAccentTop ? whiteCol : accentCol);

      dummy.position.set(p.position.x, p.position.y + 0.36, p.position.z);
      dummy.updateMatrix();
      topMesh.setMatrixAt(idx, dummy.matrix);
      topMesh.setColorAt(idx, p.isAccentTop ? accentCol : whiteCol);
    });

    bottomMesh.instanceMatrix.needsUpdate = true;
    if (bottomMesh.instanceColor) bottomMesh.instanceColor.needsUpdate = true;
    topMesh.instanceMatrix.needsUpdate = true;
    if (topMesh.instanceColor) topMesh.instanceColor.needsUpdate = true;
  }, [placements, isWangan]);

  if (placements.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={bottomTiresRef}
        args={[undefined, undefined, placements.length]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.32, 0.32, 0.22, 14]} />
        <meshStandardMaterial roughness={0.78} metalness={0.05} />
      </instancedMesh>
      <instancedMesh
        ref={topTiresRef}
        args={[undefined, undefined, placements.length]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.32, 0.32, 0.22, 14]} />
        <meshStandardMaterial roughness={0.78} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}

/**
 * Complejo 3D de Edificio de Boxes (Pit-Lane Garages + Paddock Club VIP) y Torre Oficial de Clasificación.
 */
function F1PitBuildingAndTimingTower({
  isWangan,
  isSierra,
}: {
  isWangan: boolean;
  isSierra: boolean;
}) {
  const accentHex = isWangan ? '#06B6D4' : isSierra ? '#2F81F7' : '#E63946';

  return (
    <group>
      {/* 1. EDIFICIO DE BOXES Y PIT-LANE (a la izquierda de la recta principal) */}
      <group position={[-ASPHALT_HALF_WIDTH - 6.4, 0, -5]}>
        {/* Plataforma de cemento del Pit-Lane */}
        <mesh position={[2.2, 0.02, 0]} receiveShadow>
          <boxGeometry args={[7.5, 0.06, 44]} />
          <meshStandardMaterial color="#1E293B" roughness={0.75} />
        </mesh>

        {/* Muro de Pit-Wall junto a la pista con cabina de telemetría de ingenieros */}
        <mesh position={[4.6, 0.65, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 1.3, 38]} />
          <meshStandardMaterial
            color="#334155"
            roughness={0.5}
            metalness={0.3}
          />
        </mesh>
        <mesh position={[4.5, 1.35, 0]}>
          <boxGeometry args={[0.42, 0.16, 38.2]} />
          <meshStandardMaterial color={accentHex} roughness={0.35} />
        </mesh>

        {/* Estructura principal del edificio de garajes (Planta Baja + Planta VIP) */}
        <mesh position={[-1.4, 2.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[5.2, 5.6, 40]} />
          <meshStandardMaterial
            color="#0F172A"
            roughness={0.42}
            metalness={0.45}
          />
        </mesh>

        {/* 6 Boxes de Escuderías abiertos con iluminación interior LED de techo */}
        {([-15, -9, -3, 3, 9, 15] as const).map((gz, idx) => (
          <group key={gz} position={[1.15, 0, gz]}>
            {/* Interior iluminado del garaje */}
            <mesh position={[-0.35, 1.35, 0]}>
              <boxGeometry args={[0.8, 2.5, 4.6]} />
              <meshStandardMaterial
                color="#1E293B"
                emissive={idx % 2 === 0 ? '#E0F2FE' : '#FEF3C7'}
                emissiveIntensity={0.45}
                roughness={0.4}
              />
            </mesh>
            {/* Panel LED de techo de box */}
            <mesh position={[0.02, 2.48, 0]}>
              <boxGeometry args={[0.35, 0.08, 4.2]} />
              <meshStandardMaterial
                color="#FFFFFF"
                emissive="#E0F2FE"
                emissiveIntensity={2.8}
              />
            </mesh>
            {/* Columna divisoria entre garajes */}
            <mesh position={[0.1, 1.4, 2.6]} castShadow>
              <boxGeometry args={[0.45, 2.8, 0.55]} />
              <meshStandardMaterial
                color="#E2E8F0"
                metalness={0.5}
                roughness={0.3}
              />
            </mesh>
          </group>
        ))}

        {/* Franja corporativa entre planta de boxes y terraza Paddock Club */}
        <mesh position={[1.28, 3.05, 0]} castShadow>
          <boxGeometry args={[0.35, 0.48, 40.4]} />
          <meshStandardMaterial
            color={accentHex}
            emissive={isWangan ? '#0891B2' : '#000000'}
            emissiveIntensity={isWangan ? 0.65 : 0}
            roughness={0.3}
          />
        </mesh>

        {/* Cristaleras panorámicas del Paddock Club (Planta Superior) */}
        <mesh position={[1.26, 4.35, 0]}>
          <boxGeometry args={[0.18, 1.9, 39.2]} />
          <meshPhysicalMaterial
            color="#0EA5E9"
            metalness={0.25}
            roughness={0.08}
            clearcoat={1}
            transparent
            opacity={0.72}
          />
        </mesh>

        {/* Visera aerodinámica voladiza en la cubierta del edificio de boxes */}
        <mesh position={[0.2, 5.8, 0]} rotation={[0, 0, -0.08]} castShadow>
          <boxGeometry args={[7.4, 0.36, 41.6]} />
          <meshStandardMaterial
            color="#F8FAFC"
            metalness={0.35}
            roughness={0.35}
          />
        </mesh>
      </group>

      {/* 2. TORRE VERTICAL DE CLASIFICACIÓN FIA (a la derecha de la línea de meta) */}
      <group position={[ASPHALT_HALF_WIDTH + 2.8, 0, 3.8]}>
        {/* Pedestal de hormigón */}
        <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 1.2, 1.8]} />
          <meshStandardMaterial color="#1E293B" roughness={0.6} />
        </mesh>

        {/* Cuerpo vertical del monolito de cronometraje */}
        <mesh position={[0, 7.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 12.6, 0.92]} />
          <meshStandardMaterial
            color="#0B0F17"
            metalness={0.65}
            roughness={0.25}
          />
        </mesh>

        {/* Corona luminosa superior de la torre */}
        <mesh position={[0, 13.7, 0]} castShadow>
          <boxGeometry args={[1.45, 0.75, 1.15]} />
          <meshStandardMaterial
            color={accentHex}
            emissive={accentHex}
            emissiveIntensity={1.6}
            roughness={0.2}
          />
        </mesh>

        {/* Módulos LED de posiciones (P1 a P6) en ambas caras de la torre */}
        {[11.6, 10.2, 8.8, 7.4, 6.0, 4.6].map((py, posIdx) => (
          <group key={py} position={[0, py, 0]}>
            {/* Indicador de posición (Rojo/Cian para P1, Ámbar/Blanco resto) */}
            <mesh position={[-0.26, 0, -0.48]}>
              <planeGeometry args={[0.34, 0.72]} />
              <meshStandardMaterial
                color={posIdx === 0 ? accentHex : '#334155'}
                emissive={posIdx === 0 ? accentHex : '#475569'}
                emissiveIntensity={posIdx === 0 ? 2.4 : 0.8}
              />
            </mesh>
            {/* Pantalla LED del dorsal / tiempo */}
            <mesh position={[0.18, 0, -0.48]}>
              <planeGeometry args={[0.46, 0.72]} />
              <meshStandardMaterial
                color="#F8FAFC"
                emissive={posIdx === 0 ? '#FEF08A' : '#E0F2FE'}
                emissiveIntensity={1.5}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Componente 3D del Circuito activo (Montmeló GP, Sierra Seca o Neo-Wangan) con:
 * - Asfalto PBR granulado con relieve, líneas blancas FIA y goma en trazada.
 * - Pianos 3D dentados, guardarrail metálico Armco, escapatorias de grava y muros de neumáticos.
 * - Carteles oficiales FIA de referencia de frenada (150m, 100m, 50m) antes de cada curva fuerte.
 * - Edificio de Boxes 3D con garajes iluminados, Torre de Clasificación y Pórtico con Semáforo F1.
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
    gravelGeo,
    tireStackPlacements,
    brakingBoards,
    bridgePillars,
    startPos,
    startAngleY,
  } = useMemo(
    () => buildDualLaneTrackGeometries(curve, trackId),
    [curve, trackId]
  );

  const { asphaltMap, asphaltBumpMap, checkeredMap, gravelMap, boardMaps } =
    useMemo(() => createProceduralTrackTextures(trackId), [trackId]);

  const isWangan = trackId === 'neo-wangan';
  const isSierra = trackId === 'sierra-seca';
  const isRain = weatherMode === 'rain';

  return (
    <group name={`circuit-${trackId}`}>
      {/* Tablero estructural 3D de puente/viaducto (con paso inferior abierto) */}
      <mesh geometry={skirtGeo} receiveShadow castShadow>
        <meshStandardMaterial
          color={isWangan ? '#1E293B' : isSierra ? '#33291F' : '#263040'}
          roughness={isRain ? 0.5 : 0.78}
          metalness={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pilares de hormigón armado y vigas cabezales en tramos elevados / puentes */}
      {bridgePillars.map((p, idx) => (
        <group
          key={`pillar-${idx}`}
          position={[p.position.x, 0, p.position.z]}
          rotation={[0, p.rotationY, 0]}
        >
          {/* Viga cabezal transversal bajo el tablero del puente */}
          <mesh position={[0, p.topY - 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[ASPHALT_HALF_WIDTH * 2 + 1.1, 0.44, 1.15]} />
            <meshStandardMaterial
              color="#334155"
              roughness={0.68}
              metalness={0.22}
            />
          </mesh>
          {/* Pareja de columnas cilíndricas de soporte hasta el suelo */}
          <mesh
            position={[-2.15, p.position.y, 0]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.38, 0.46, p.height, 14]} />
            <meshStandardMaterial
              color="#475569"
              roughness={0.72}
              metalness={0.18}
            />
          </mesh>
          <mesh
            position={[2.15, p.position.y, 0]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.38, 0.46, p.height, 14]} />
            <meshStandardMaterial
              color="#475569"
              roughness={0.72}
              metalness={0.18}
            />
          </mesh>
        </group>
      ))}

      {/* Escapatorias exteriores de grava (Gravel Traps) en curvas fuertes */}
      <mesh geometry={gravelGeo} receiveShadow>
        <meshStandardMaterial
          map={gravelMap}
          bumpMap={gravelMap}
          bumpScale={0.05}
          roughness={0.95}
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

      {/* Barreras 3D de neumáticos rojiblancos apilados en curvas críticas */}
      <TireWallBarriers placements={tireStackPlacements} isWangan={isWangan} />

      {/* Carteles FIA de referencia de frenada (150m / 100m / 50m) antes de las curvas fuertes */}
      {brakingBoards.map((b, idx) => (
        <group
          key={`${b.distanceLabel}-${idx}`}
          position={b.position}
          rotation={[0, b.rotationY, 0]}
        >
          {/* Postes metálicos de soporte */}
          <mesh position={[-0.36, 0.55, -0.04]} castShadow>
            <boxGeometry args={[0.06, 1.1, 0.06]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.36, 0.55, -0.04]} castShadow>
            <boxGeometry args={[0.06, 1.1, 0.06]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Placa reflectante con distancia (150m, 100m, 50m) */}
          <mesh position={[0, 0.72, 0]} castShadow>
            <boxGeometry args={[1.05, 0.78, 0.05]} />
            <meshStandardMaterial
              map={boardMaps[b.distanceLabel]}
              roughness={0.32}
              metalness={0.08}
            />
          </mesh>
        </group>
      ))}

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

      {/* Pórtico, Edificio de Boxes, Torre de Clasificación, Parrilla F1 y Línea de Meta */}
      <group position={startPos} rotation={[0, startAngleY, 0]}>
        <F1PitBuildingAndTimingTower
          isWangan={isWangan}
          isSierra={isSierra}
        />

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
            <mesh position={[0, 0, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1.65, 0.14]} />
              <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
            </mesh>
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
