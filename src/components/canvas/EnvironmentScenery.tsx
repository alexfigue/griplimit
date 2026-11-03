'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { getTrackLUT, type TrackLUT } from '@/lib/montmeloSpline';
import { useTelemetryStore } from '@/store/store';
import type { TrackId } from '@/types/types';

const RAIN_DROP_COUNT = 950;

/**
 * Mapa de entorno HDRI procedural 100% offline para reflejos PBR reales sobre la pintura Clearcoat y cristales.
 */
function AutomotivePBRReflections({ isNight = false }: { isNight?: boolean }) {
  return (
    <Environment resolution={256} frames={1}>
      <group rotation={[-Math.PI / 4, 0, 0]}>
        <Lightformer
          intensity={isNight ? 2.5 : 3.4}
          rotation-x={Math.PI / 2}
          position={[0, 8, -4]}
          scale={[18, 12, 1]}
          color={isNight ? '#38BDF8' : '#FFFDF8'}
        />
        <Lightformer
          intensity={isNight ? 1.8 : 2.1}
          rotation-y={Math.PI / 2}
          position={[-10, 3, 0]}
          scale={[24, 4, 1]}
          color={isNight ? '#F472B6' : '#BAE6FD'}
        />
        <Lightformer
          intensity={isNight ? 1.8 : 2.0}
          rotation-y={-Math.PI / 2}
          position={[10, 3, 0]}
          scale={[24, 4, 1]}
          color={isNight ? '#06B6D4' : '#FDE68A'}
        />
        <Lightformer
          intensity={0.9}
          rotation-x={-Math.PI / 2}
          position={[0, -6, 0]}
          scale={[28, 28, 1]}
          color="#1E293B"
        />
      </group>
    </Environment>
  );
}

/**
 * Cortina 3D de lluvia dinámica 0-GC (LineSegments pre-alojados en memoria).
 */
function RainPrecipitation3D() {
  const linesRef = useRef<THREE.LineSegments>(null);

  const rainBuffer = useMemo(() => {
    const positions = new Float32Array(RAIN_DROP_COUNT * 6);
    const speeds = new Float32Array(RAIN_DROP_COUNT);
    const rand = createSeededRandom(7744);

    for (let i = 0; i < RAIN_DROP_COUNT; i++) {
      const x = (rand() - 0.5) * 320;
      const y = rand() * 48;
      const z = (rand() - 0.5) * 260 - 15;
      const base = i * 6;

      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;

      positions[base + 3] = x + 0.18;
      positions[base + 4] = y + 1.75;
      positions[base + 5] = z + 0.12;

      speeds[i] = 44 + rand() * 18;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);

    return { geo, positions, speeds };
  }, []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const { positions, speeds, geo } = rainBuffer;

    for (let i = 0; i < RAIN_DROP_COUNT; i++) {
      const base = i * 6;
      const nextY = positions[base + 1] - speeds[i] * dt;
      const wrappedY = nextY < -0.5 ? 46 + (nextY + 0.5) : nextY;

      positions[base + 1] = wrappedY;
      positions[base + 4] = wrappedY + 1.75;
    }

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  });

  return (
    <lineSegments
      ref={linesRef}
      geometry={rainBuffer.geo}
      frustumCulled={false}
    >
      <lineBasicMaterial
        color="#BAE6FD"
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Distancia horizontal mínima desde (x, z) hasta el trazado del circuito (muestreo rápido de 256 puntos).
 */
function getMinDistToTrackXZ(lut: TrackLUT, x: number, z: number): number {
  let minDistSq = Infinity;
  const step = 4;
  for (let i = 0; i < lut.sampleCount; i += step) {
    const p = lut.nodes[i].position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
    }
  }
  return Math.sqrt(minDistSq);
}

function sampleElevationNoise(x: number, z: number, trackId: TrackId): number {
  if (trackId === 'neo-wangan') {
    // Explanada urbana y bahía de Tokio prácticamente llana bajo los viaductos elevados
    const urbanPlate =
      Math.sin(x * 0.015) * Math.cos(z * 0.015) * 1.4 + 0.8;
    return Math.max(0, urbanPlate);
  }
  if (trackId === 'sierra-seca') {
    const canyon =
      Math.sin(x * 0.018 + 0.6) * Math.cos(z * 0.021 - 0.3) * 14.0 +
      Math.sin(x * 0.042 - z * 0.035) * 6.5 +
      Math.cos(z * 0.014) * 8.0;
    return Math.max(0, canyon + 10.5);
  }
  const vallesHills =
    Math.sin(x * 0.016) * Math.cos(z * 0.019) * 10.5 +
    Math.sin(x * 0.035 + z * 0.028) * 4.5 +
    6.5;
  return Math.max(0, vallesHills);
}

/**
 * Construye una malla topográfica 3D coloreada por vértices que rodea el circuito
 * manteniendo una plataforma plana bajo la pista y elevando relieve natural o explanada urbana.
 */
function buildBiomeTerrainGeometry(trackId: TrackId, lut: TrackLUT) {
  const width = 580;
  const depth = 460;
  const segX = 92;
  const segZ = 72;

  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const isWangan = trackId === 'neo-wangan';
  const isSierra = trackId === 'sierra-seca';

  const cRunoff = new THREE.Color(
    isWangan ? '#0B1120' : isSierra ? '#8C6B48' : '#59634F'
  );
  const cLow = new THREE.Color(
    isWangan ? '#070B14' : isSierra ? '#6E4226' : '#263F24'
  );
  const cMid = new THREE.Color(
    isWangan ? '#0F172A' : isSierra ? '#8F4F2B' : '#35542D'
  );
  const cPeak = new THREE.Color(
    isWangan ? '#1E1B4B' : isSierra ? '#5C2E18' : '#4C564A'
  );
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i) - 18;
    posAttr.setZ(i, z);

    const dist = getMinDistToTrackXZ(lut, x, z);

    const hillBlend = THREE.MathUtils.smoothstep(dist, 11.0, 44.0);
    const rimDist = Math.hypot(x / 245, (z + 18) / 190);
    const horizonRim = isWangan
      ? THREE.MathUtils.smoothstep(rimDist, 0.85, 1.2) * 4.0
      : THREE.MathUtils.smoothstep(rimDist, 0.72, 1.18) * 22.0;

    const rawHill = sampleElevationNoise(x, z, trackId);
    const y =
      -0.22 + hillBlend * rawHill + horizonRim * Math.max(0.25, hillBlend);
    posAttr.setY(i, y);

    if (dist < 12.5) {
      tmpColor.lerpColors(
        cRunoff,
        cLow,
        THREE.MathUtils.smoothstep(dist, 6.5, 12.5)
      );
    } else if (y < 9) {
      tmpColor.lerpColors(cLow, cMid, THREE.MathUtils.clamp(y / 9, 0, 1));
    } else {
      tmpColor.lerpColors(
        cMid,
        cPeak,
        THREE.MathUtils.clamp((y - 9) / 20, 0, 1)
      );
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

interface PropTransform {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotationY: number;
}

function generateInstancedPropTransforms(
  trackId: TrackId,
  lut: TrackLUT,
  targetCount: number
): PropTransform[] {
  const seed =
    trackId === 'neo-wangan' ? 2077 : trackId === 'sierra-seca' ? 90210 : 1992;
  const rand = createSeededRandom(seed);
  const list: PropTransform[] = [];
  let attempts = 0;
  const minClearance = trackId === 'neo-wangan' ? 16.5 : 13.5;

  while (list.length < targetCount && attempts < targetCount * 16) {
    attempts++;
    const x = (rand() - 0.5) * 460;
    const z = (rand() - 0.5) * 350 - 18;

    // Respetar espacio libre detrás de la Tribuna Principal en Montmeló
    if (trackId === 'montmelo' && z > 46 && z < 74 && Math.abs(x) < 88) {
      continue;
    }

    const dist = getMinDistToTrackXZ(lut, x, z);
    if (dist < minClearance) continue;

    const hillBlend = THREE.MathUtils.smoothstep(dist, 11.0, 44.0);
    const rimDist = Math.hypot(x / 245, (z + 18) / 190);
    const horizonRim =
      trackId === 'neo-wangan'
        ? THREE.MathUtils.smoothstep(rimDist, 0.85, 1.2) * 4.0
        : THREE.MathUtils.smoothstep(rimDist, 0.72, 1.18) * 22.0;
    const groundY =
      -0.22 +
      hillBlend * sampleElevationNoise(x, z, trackId) +
      horizonRim * Math.max(0.25, hillBlend);

    if (trackId === 'neo-wangan') {
      const footprint = 0.75 + rand() * 1.15;
      const towerHeightScale = 0.55 + rand() * 1.85;
      list.push({
        position: new THREE.Vector3(x, groundY, z),
        scale: new THREE.Vector3(
          footprint,
          towerHeightScale,
          footprint * (0.85 + rand() * 0.35)
        ),
        rotationY: Math.floor(rand() * 4) * (Math.PI / 2),
      });
    } else {
      const s = 0.75 + rand() * 0.95;
      list.push({
        position: new THREE.Vector3(x, groundY, z),
        scale: new THREE.Vector3(s, s * (0.85 + rand() * 0.4), s),
        rotationY: rand() * Math.PI * 2,
      });
    }
  }

  return list;
}

/**
 * Árboles mediterráneos instanciados (2 draw calls para ~210 pinos) en Montmeló.
 */
function InstancedPineForest({ transforms }: { transforms: PropTransform[] }) {
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const crownsRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    transforms.forEach((item, idx) => {
      dummy.position.set(
        item.position.x,
        item.position.y + 1.3 * item.scale.y,
        item.position.z
      );
      dummy.rotation.set(0, item.rotationY, 0);
      dummy.scale.copy(item.scale);
      dummy.updateMatrix();
      trunksRef.current?.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(
        item.position.x,
        item.position.y + 3.6 * item.scale.y,
        item.position.z
      );
      dummy.updateMatrix();
      crownsRef.current?.setMatrixAt(idx, dummy.matrix);
    });

    if (trunksRef.current) trunksRef.current.instanceMatrix.needsUpdate = true;
    if (crownsRef.current) crownsRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <group>
      <instancedMesh
        ref={trunksRef}
        args={[undefined, undefined, transforms.length]}
        castShadow
      >
        <cylinderGeometry args={[0.22, 0.34, 2.8, 6]} />
        <meshStandardMaterial color="#4A3525" roughness={0.9} />
      </instancedMesh>

      <instancedMesh
        ref={crownsRef}
        args={[undefined, undefined, transforms.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[2.15, 4.2, 7]} />
        <meshStandardMaterial color="#234726" roughness={0.85} />
      </instancedMesh>
    </group>
  );
}

/**
 * Rocas de arenisca y matorral desértico instanciados (2 draw calls) en Sierra Seca.
 */
function InstancedDesertCanyonProps({
  transforms,
}: {
  transforms: PropTransform[];
}) {
  const rocksRef = useRef<THREE.InstancedMesh>(null);
  const scrubRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    transforms.forEach((item, idx) => {
      dummy.position.set(
        item.position.x,
        item.position.y + 0.75 * item.scale.y,
        item.position.z
      );
      dummy.rotation.set(
        item.rotationY * 0.2,
        item.rotationY,
        item.rotationY * 0.15
      );
      dummy.scale.set(
        item.scale.x * 1.4,
        item.scale.y * 1.05,
        item.scale.z * 1.3
      );
      dummy.updateMatrix();
      rocksRef.current?.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(
        item.position.x + 1.8,
        item.position.y + 0.35,
        item.position.z + 1.1
      );
      dummy.rotation.set(0, item.rotationY, 0);
      dummy.scale.setScalar(item.scale.x * 0.65);
      dummy.updateMatrix();
      scrubRef.current?.setMatrixAt(idx, dummy.matrix);
    });

    if (rocksRef.current) rocksRef.current.instanceMatrix.needsUpdate = true;
    if (scrubRef.current) scrubRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <group>
      <instancedMesh
        ref={rocksRef}
        args={[undefined, undefined, transforms.length]}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1.45, 0]} />
        <meshStandardMaterial color="#7D4427" roughness={0.92} />
      </instancedMesh>

      <instancedMesh
        ref={scrubRef}
        args={[undefined, undefined, transforms.length]}
      >
        <icosahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial color="#556137" roughness={0.95} />
      </instancedMesh>
    </group>
  );
}

/**
 * Rascacielos nocturnos de Tokio con coronas de neón cian/magenta/ámbar (2 draw calls) para Neo-Wangan.
 */
function InstancedNeonSkyscrapers({
  transforms,
}: {
  transforms: PropTransform[];
}) {
  const towersRef = useRef<THREE.InstancedMesh>(null);
  const neonCapsRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const palette = [
      new THREE.Color('#06B6D4'),
      new THREE.Color('#38BDF8'),
      new THREE.Color('#EC4899'),
      new THREE.Color('#A855F7'),
      new THREE.Color('#F59E0B'),
    ];

    const baseTowerH = 26.0;

    transforms.forEach((item, idx) => {
      const towerH = baseTowerH * item.scale.y;

      dummy.position.set(
        item.position.x,
        item.position.y + towerH * 0.5,
        item.position.z
      );
      dummy.rotation.set(0, item.rotationY, 0);
      dummy.scale.set(item.scale.x, item.scale.y, item.scale.z);
      dummy.updateMatrix();
      towersRef.current?.setMatrixAt(idx, dummy.matrix);

      // Corona luminosa de neón en la azotea de cada rascacielos
      dummy.position.set(
        item.position.x,
        item.position.y + towerH + 0.25,
        item.position.z
      );
      dummy.scale.set(item.scale.x * 1.03, 1.0, item.scale.z * 1.03);
      dummy.updateMatrix();
      neonCapsRef.current?.setMatrixAt(idx, dummy.matrix);
      neonCapsRef.current?.setColorAt(idx, palette[idx % palette.length]);
    });

    if (towersRef.current) towersRef.current.instanceMatrix.needsUpdate = true;
    if (neonCapsRef.current) {
      neonCapsRef.current.instanceMatrix.needsUpdate = true;
      if (neonCapsRef.current.instanceColor) {
        neonCapsRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, [transforms]);

  return (
    <group>
      <instancedMesh
        ref={towersRef}
        args={[undefined, undefined, transforms.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[8.5, 26, 8.5]} />
        <meshStandardMaterial
          color="#0B1324"
          metalness={0.68}
          roughness={0.28}
        />
      </instancedMesh>

      <instancedMesh
        ref={neonCapsRef}
        args={[undefined, undefined, transforms.length]}
      >
        <boxGeometry args={[8.6, 0.55, 8.6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/**
 * Tribuna Principal cubierta frente a la Recta de Meta de Montmeló.
 */
function MontmeloGrandstand() {
  return (
    <group position={[-10, -0.2, 60]}>
      <mesh position={[0, 2.2, 2]} castShadow receiveShadow>
        <boxGeometry args={[130, 4.4, 12]} />
        <meshStandardMaterial color="#27303D" roughness={0.85} />
      </mesh>
      <mesh
        position={[0, 4.9, 0.5]}
        rotation={[-0.38, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[128, 1.2, 13]} />
        <meshStandardMaterial color="#1D4ED8" roughness={0.65} />
      </mesh>
      <mesh position={[0, 6.8, 3.8]} rotation={[-0.38, 0, 0]} castShadow>
        <boxGeometry args={[128, 1.0, 6]} />
        <meshStandardMaterial color="#E63946" roughness={0.6} />
      </mesh>
      <mesh position={[0, 9.8, 1.2]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[132, 0.45, 16]} />
        <meshStandardMaterial color="#E2E8F0" metalness={0.2} roughness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * MODO MAQUETA / SALÓN: Mesa gigante de madera de roble con textura procedural de tablones,
 * marco biselado, transformador clásico de Scalextric y cajas Mini-4WD a escala gigante.
 */
function TabletopLivingRoomDiorama() {
  const woodTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#5C3D24';
    ctx.fillRect(0, 0, 512, 512);

    const plankCount = 8;
    const plankH = 512 / plankCount;
    const tones = ['#68452A', '#593A22', '#704B2E', '#613F26'];

    for (let i = 0; i < plankCount; i++) {
      ctx.fillStyle = tones[i % tones.length];
      ctx.fillRect(0, i * plankH, 512, plankH - 3);
      ctx.fillStyle = '#3B2514';
      ctx.fillRect(0, (i + 1) * plankH - 3, 512, 3);

      ctx.strokeStyle = 'rgba(42, 24, 12, 0.22)';
      ctx.lineWidth = 2;
      for (let g = 0; g < 6; g++) {
        ctx.beginPath();
        const y0 = i * plankH + 8 + g * 9;
        ctx.moveTo(0, y0);
        ctx.bezierCurveTo(170, y0 + 5, 340, y0 - 5, 512, y0 + 2);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 5);
    return tex;
  }, []);

  return (
    <group name="tabletop-living-room">
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.2, -25]}
        receiveShadow
      >
        <planeGeometry args={[410, 290]} />
        <meshStandardMaterial
          map={woodTexture}
          color="#8C623E"
          roughness={0.62}
          metalness={0.05}
        />
      </mesh>

      <mesh position={[0, -0.6, 122]} receiveShadow>
        <boxGeometry args={[418, 3.2, 4]} />
        <meshStandardMaterial color="#3B2414" roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.6, -172]} receiveShadow>
        <boxGeometry args={[418, 3.2, 4]} />
        <meshStandardMaterial color="#3B2414" roughness={0.55} />
      </mesh>
      <mesh position={[-207, -0.6, -25]} receiveShadow>
        <boxGeometry args={[4, 3.2, 298]} />
        <meshStandardMaterial color="#3B2414" roughness={0.55} />
      </mesh>
      <mesh position={[207, -0.6, -25]} receiveShadow>
        <boxGeometry args={[4, 3.2, 298]} />
        <meshStandardMaterial color="#3B2414" roughness={0.55} />
      </mesh>

      {/* Transformador clásico de Scalextric gigante al borde de la mesa */}
      <group position={[-156, -0.2, 86]} rotation={[0, 0.22, 0]}>
        <mesh position={[0, 7, 0]} castShadow receiveShadow>
          <boxGeometry args={[28, 14, 20]} />
          <meshStandardMaterial
            color="#181C24"
            roughness={0.45}
            metalness={0.3}
          />
        </mesh>
        <mesh position={[-9, 14.2, 6]}>
          <cylinderGeometry args={[1.1, 1.1, 0.6, 16]} />
          <meshStandardMaterial
            color="#22C55E"
            emissive="#22C55E"
            emissiveIntensity={2.5}
          />
        </mesh>
        <mesh position={[3, 14.3, 6]}>
          <cylinderGeometry args={[1.6, 1.6, 1.2, 16]} />
          <meshStandardMaterial color="#2F81F7" roughness={0.3} />
        </mesh>
        <mesh position={[9, 14.3, 6]}>
          <cylinderGeometry args={[1.6, 1.6, 1.2, 16]} />
          <meshStandardMaterial color="#E63946" roughness={0.3} />
        </mesh>
      </group>

      {/* Cajas apiladas de kits Mini-4WD Let's & Go en la esquina superior */}
      <group position={[162, -0.2, -128]} rotation={[0, -0.35, 0]}>
        <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[34, 9, 22]} />
          <meshStandardMaterial color="#1E3A8A" roughness={0.5} />
        </mesh>
        <mesh position={[1.5, 13, -1]} rotation={[0, 0.14, 0]} castShadow>
          <boxGeometry args={[32, 8, 21]} />
          <meshStandardMaterial color="#B91C1C" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function createTerrainDetailTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#D8D8D8';
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const rand = createSeededRandom(31415);

  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    const n = (rand() - 0.5) * 48 + (rand() > 0.88 ? 22 : 0);
    const v = Math.max(120, Math.min(255, 215 + n));
    d[idx] = v;
    d[idx + 1] = v;
    d[idx + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 34);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Gestor completo del entorno 3D para los 3 circuitos (Montmeló GP, Sierra Seca y Neo-Wangan)
 * + Modo Maqueta de Salón [Tecla E].
 */
export function EnvironmentScenery() {
  const trackId = useTelemetryStore((s) => s.trackId);
  const environmentStyle = useTelemetryStore((s) => s.environmentStyle);
  const weatherMode = useTelemetryStore((s) => s.weatherMode);
  const isRain = weatherMode === 'rain';

  const lut = useMemo(() => getTrackLUT(trackId), [trackId]);
  const terrainGeo = useMemo(
    () => buildBiomeTerrainGeometry(trackId, lut),
    [trackId, lut]
  );
  const terrainDetailTex = useMemo(() => createTerrainDetailTexture(), []);
  const propTransforms = useMemo(
    () =>
      generateInstancedPropTransforms(
        trackId,
        lut,
        trackId === 'neo-wangan' ? 185 : 210
      ),
    [trackId, lut]
  );

  if (environmentStyle === 'tabletop') {
    return (
      <>
        <AutomotivePBRReflections isNight={false} />
        <color attach="background" args={['#17110C']} />
        <fog attach="fog" args={['#17110C', 185, 460]} />
        <hemisphereLight args={['#FFE4C4', '#2B1D12', 0.85]} />
        <directionalLight
          position={[45, 135, 35]}
          intensity={2.1}
          color="#FFF1DC"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={10}
          shadow-camera-far={420}
          shadow-camera-left={-190}
          shadow-camera-right={190}
          shadow-camera-top={150}
          shadow-camera-bottom={-150}
        />
        {isRain && <RainPrecipitation3D />}
        <TabletopLivingRoomDiorama />
      </>
    );
  }

  if (trackId === 'neo-wangan') {
    return (
      <>
        <AutomotivePBRReflections isNight />
        <color attach="background" args={['#050811']} />
        <fog attach="fog" args={['#070C1A', isRain ? 115 : 155, isRain ? 360 : 450]} />

        <hemisphereLight args={['#38BDF8', '#090D16', 0.72]} />
        <directionalLight
          position={[85, 130, 55]}
          intensity={1.55}
          color="#BAE6FD"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={10}
          shadow-camera-far={420}
          shadow-camera-left={-185}
          shadow-camera-right={185}
          shadow-camera-top={145}
          shadow-camera-bottom={-145}
        />
        {/* Contraluz urbano magenta sin coste de sombras para resaltar reflejos metálicos */}
        <directionalLight
          position={[-110, 60, -90]}
          intensity={0.7}
          color="#F472B6"
        />

        <mesh geometry={terrainGeo} receiveShadow>
          <meshStandardMaterial
            vertexColors
            map={terrainDetailTex}
            bumpMap={terrainDetailTex}
            bumpScale={0.04}
            roughness={isRain ? 0.45 : 0.86}
            metalness={isRain ? 0.35 : 0.18}
          />
        </mesh>

        {isRain && <RainPrecipitation3D />}
        <InstancedNeonSkyscrapers transforms={propTransforms} />
      </>
    );
  }

  const isSierra = trackId === 'sierra-seca';

  return (
    <>
      <AutomotivePBRReflections isNight={false} />
      <color
        attach="background"
        args={[isRain ? '#263445' : isSierra ? '#D99B66' : '#8CB8DE']}
      />
      <fog
        attach="fog"
        args={[
          isRain ? '#263445' : isSierra ? '#C98A5B' : '#9EC3E2',
          isRain ? 115 : 170,
          isRain ? 360 : 470,
        ]}
      />

      {!isRain && (
        <Sky
          distance={4500}
          sunPosition={isSierra ? [-110, 16, -75] : [95, 58, 65]}
          turbidity={isSierra ? 7.8 : 3.4}
          rayleigh={isSierra ? 2.3 : 1.15}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />
      )}

      <hemisphereLight
        args={[
          isRain ? '#94A3B8' : isSierra ? '#FFD2A6' : '#D6ECFF',
          isRain ? '#1E293B' : isSierra ? '#4A2C1A' : '#263822',
          isRain ? 0.65 : 0.78,
        ]}
      />
      <directionalLight
        position={isSierra ? [-110, 95, -75] : [95, 125, 65]}
        intensity={isRain ? 1.15 : isSierra ? 2.15 : 1.95}
        color={isRain ? '#CBD5E1' : isSierra ? '#FFD7AD' : '#FFFDF8'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-camera-left={-170}
        shadow-camera-right={170}
        shadow-camera-top={115}
        shadow-camera-bottom={-115}
      />

      <mesh geometry={terrainGeo} receiveShadow>
        <meshStandardMaterial
          vertexColors
          map={terrainDetailTex}
          bumpMap={terrainDetailTex}
          bumpScale={0.08}
          roughness={isRain ? 0.65 : 0.94}
        />
      </mesh>

      {isRain && <RainPrecipitation3D />}

      {isSierra ? (
        <InstancedDesertCanyonProps transforms={propTransforms} />
      ) : (
        <>
          <InstancedPineForest transforms={propTransforms} />
          <MontmeloGrandstand />
        </>
      )}
    </>
  );
}

export default EnvironmentScenery;
