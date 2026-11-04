'use client';

import React, { Component, Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  buildProMotorsportWheel,
  type ProRimStyle,
  type ProWheelSpec,
} from '@/lib/proWheelsGenerator';
import { useTelemetryStore } from '@/store/store';
import type { VisualCustomizationConfig } from '@/types/types';

export const CAR_GLB_PATH = '/cars/gt3-enduro-pro.glb';
const TARGET_CAR_LENGTH_M = 4.4;
export const SLOT_GUIDE_PIN_OFFSET_Z = 1.45;
const SPARK_POOL_SIZE = 28;
const SMOKE_POOL_SIZE = 44;
const WHEEL_RADIUS_M = 0.33;

const GHOST_HOLOGRAM_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#38BDF8',
  emissive: '#0284C7',
  emissiveIntensity: 0.85,
  roughness: 0.2,
  metalness: 0.1,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
});

const CAR_SIGNATURE_PAINT_HEX: Record<string, number> = {
  '/cars/gt3-enduro-pro.glb': 0xd91b2e, // Porsche GT3 Guards Red
  '/cars/lambo-razor-pro.glb': 0xeab308, // Lamborghini Giallo Orion
  '/cars/hyper-specter-pro.glb': 0xf97316, // McLaren Papaya Orange
  '/cars/skyline-kaido-pro.glb': 0x1d4ed8, // Nissan R34 Bayside Blue
  '/cars/lemans-apogee-pro.glb': 0x0284c7, // Ford GT Liquid Blue
  '/cars/jdm-touge-pro.glb': 0xf1f5f9, // AE86 Fuji White
  '/cars/f1-monoposto-pro.glb': 0xdc2626, // Scuderia Rosso Corsa
};

interface ProCarExtras {
  id?: string;
  wheels?: {
    front: ProWheelSpec;
    rear: ProWheelSpec;
  };
  exhausts?: Array<[number, number, number]>;
  headLights?: Array<[number, number, number]>;
}

export interface CarVisualMotionState {
  bodyRollRad: number;
  /** Cabeceo longitudinal de suspensión: positivo al hundir el morro en frenada, negativo al acelerar */
  bodyPitchRad?: number;
  driftYawRad: number;
  driftIntensity: number;
  /** Velocidad instantánea lineal (m/s) para giro físico de las 4 ruedas (ω = v / r) */
  speedMs?: number;
  /** Marcha engranada actual (1-6) para detectar reducciones y disparar petardeos de escape */
  gear?: number;
  /** Nivel de freno activo [0, 1] para encender luces de freno traseras y calentar discos */
  brakeIntensity?: number;
  /** Nivel de estrés vertical en la guía [0, 1] para emitir chispas metálicas */
  guideStress?: number;
  /** Indica si hay sobrecarga eléctrica / salida turbo */
  overVoltActive?: boolean;
  isDerailed: boolean;
}

export interface CarModelProps {
  modelPath?: string;
  modelYawOffsetRad?: number;
  paintColorOverrideHex?: number;
  visualConfig?: VisualCustomizationConfig;
  isGhost?: boolean;
  motionRef?: React.RefObject<CarVisualMotionState>;
  isDerailed?: boolean;
}

interface LoadedGLBProps {
  modelPath: string;
  yawOffsetRad: number;
  paintColorOverrideHex?: number;
  visualConfig?: VisualCustomizationConfig;
  isGhost: boolean;
}

let cachedSoftCloudTex: THREE.CanvasTexture | null = null;
function getSoftCloudTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedSoftCloudTex) return cachedSoftCloudTex;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.45, 'rgba(226, 232, 240, 0.55)');
    grad.addColorStop(1, 'rgba(226, 232, 240, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  cachedSoftCloudTex = new THREE.CanvasTexture(canvas);
  cachedSoftCloudTex.needsUpdate = true;
  return cachedSoftCloudTex;
}

function hasWheelAncestor(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let curr = obj.parent;
  while (curr && curr !== root) {
    if (/wheel|tire/i.test(curr.name)) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function LoadedCarGLB({
  modelPath,
  yawOffsetRad,
  paintColorOverrideHex,
  visualConfig,
  isGhost,
}: LoadedGLBProps) {
  const { scene } = useGLTF(modelPath);

  const normalizedModel = useMemo(() => {
    const cloned = scene.clone(true);
    const wheelNodes: THREE.Object3D[] = [];
    const brakeMaterials: THREE.MeshStandardMaterial[] = [];

    // Eliminar mallas de bajo detalle (lod1+) y planos billboard de brillo (tailglow) en modelos Pro
    const nodesToRemove: THREE.Object3D[] = [];
    cloned.traverse((child) => {
      if (
        /^lod[1-9]/i.test(child.name) ||
        /tailglow|headglow|glow/i.test(child.name)
      ) {
        nodesToRemove.push(child);
      }
    });
    for (const n of nodesToRemove) {
      n.parent?.remove(n);
    }

    const basePaintHex =
      paintColorOverrideHex ??
      visualConfig?.paintHex ??
      CAR_SIGNATURE_PAINT_HEX[modelPath] ??
      0xd91b2e;

    const isMatte = visualConfig?.paintFinish === 'satin-matte';

    const paintMaterial = new THREE.MeshPhysicalMaterial({
      color: basePaintHex,
      metalness: isMatte ? 0.52 : 0.72,
      roughness: isMatte ? 0.44 : 0.16,
      clearcoat: isMatte ? 0.15 : 1.0,
      clearcoatRoughness: isMatte ? 0.45 : 0.05,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: '#090E1A',
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.84,
    });
    const carbonMaterial = new THREE.MeshStandardMaterial({
      color: '#151922',
      metalness: 0.45,
      roughness: 0.36,
    });
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      metalness: 0.94,
      roughness: 0.1,
    });

    // Material térmico para los 4 discos de freno (se vuelve incandescente dentro de la llanta al frenar fuerte)
    const discThermalMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.28,
      metalness: 0.88,
      emissive: new THREE.Color('#FF3B00'),
      emissiveIntensity: 0,
      vertexColors: true,
    });

    cloned.traverse((child) => {
      if (
        /wheel|tire/i.test(child.name) &&
        !hasWheelAncestor(child, cloned)
      ) {
        wheelNodes.push(child);
      }

      if (child instanceof THREE.Mesh) {
        const matName = (
          (child.material as THREE.Material)?.name ?? ''
        ).toLowerCase();

        if (matName.includes('tailglow') || matName.includes('glow')) {
          child.visible = false;
          return;
        }

        if (isGhost) {
          child.material = GHOST_HOLOGRAM_MATERIAL;
          child.castShadow = false;
          child.receiveShadow = false;
        } else {
          child.castShadow = true;
          child.receiveShadow = true;

          if (matName.includes('paint')) {
            child.material = paintMaterial;
          } else if (
            matName.includes('glass') ||
            matName.includes('window') ||
            matName.includes('lens')
          ) {
            child.material = glassMaterial;
          } else if (
            matName.includes('carbon') ||
            matName.includes('grille') ||
            matName.includes('trim') ||
            matName.includes('interior')
          ) {
            child.material = carbonMaterial;
          } else if (
            matName.includes('chrome') ||
            matName.includes('exhaust') ||
            matName.includes('head') ||
            matName.includes('drl')
          ) {
            child.material = chromeMaterial;
          } else if (matName === 'tail') {
            const tailMat = new THREE.MeshStandardMaterial({
              color: '#881320',
              emissive: '#FF1E38',
              emissiveIntensity: 0.25,
              roughness: 0.22,
            });
            child.material = tailMat;
            brakeMaterials.push(tailMat);
          }
        }
      }
    });

    const extras = (scene.userData ?? {}) as ProCarExtras;

    // Ensamblar las 4 ruedas 3D Pro con discos de freno térmicos
    if (extras.wheels?.front && extras.wheels?.rear && wheelNodes.length === 0) {
      const { front, rear } = extras.wheels;
      const placements: Array<{ spec: ProWheelSpec; xSign: 1 | -1 }> = [
        { spec: front, xSign: 1 },
        { spec: front, xSign: -1 },
        { spec: rear, xSign: 1 },
        { spec: rear, xSign: -1 },
      ];

      const wheelOverride = visualConfig
        ? {
            rimStyle:
              visualConfig.rimStyle && visualConfig.rimStyle !== 'default'
                ? (visualConfig.rimStyle as ProRimStyle)
                : undefined,
            rimColorHex: visualConfig.rimColorHex ?? undefined,
            caliperColorHex: visualConfig.caliperColorHex ?? undefined,
          }
        : undefined;

      for (const p of placements) {
        const { rootGroup, spinGroup } = buildProMotorsportWheel(
          p.spec,
          extras.id,
          p.xSign,
          isGhost,
          GHOST_HOLOGRAM_MATERIAL,
          discThermalMaterial,
          wheelOverride
        );
        rootGroup.position.set(p.spec.x * p.xSign, p.spec.y, p.spec.z);
        cloned.add(rootGroup);
        wheelNodes.push(spinGroup);
      }
    }

    const orientedGroup = new THREE.Group();
    cloned.rotation.y = yawOffsetRad;
    orientedGroup.add(cloned);
    orientedGroup.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(orientedGroup);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxHorizontalSpan = Math.max(size.x, size.z, 0.001);
    const uniformScale = TARGET_CAR_LENGTH_M / maxHorizontalSpan;

    const wrapper = new THREE.Group();
    wrapper.name = 'glb-normalized-wrapper';
    orientedGroup.scale.setScalar(uniformScale);
    orientedGroup.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(orientedGroup);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);

    orientedGroup.position.set(
      -scaledCenter.x,
      -scaledBox.min.y,
      -scaledCenter.z
    );

    wrapper.add(orientedGroup);
    wrapper.userData.wheels = wheelNodes;
    wrapper.userData.brakeMaterials = brakeMaterials;
    wrapper.userData.discThermalMaterial = discThermalMaterial;
    wrapper.userData.spinDirection = Math.cos(yawOffsetRad) >= 0 ? 1 : -1;
    return wrapper;
  }, [
    scene,
    yawOffsetRad,
    paintColorOverrideHex,
    visualConfig,
    isGhost,
    modelPath,
  ]);

  return <primitive object={normalizedModel} />;
}

function FallbackSlotCarMesh({ isGhost = false }: { isGhost?: boolean }) {
  if (isGhost) {
    return (
      <group>
        <mesh position={[0, 0.42, 0]} material={GHOST_HOLOGRAM_MATERIAL}>
          <boxGeometry args={[1.82, 0.48, 4.1]} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.85, 0.42, 4.1]} />
        <meshStandardMaterial color="#D91B2E" metalness={0.65} roughness={0.2} />
      </mesh>
    </group>
  );
}

interface ErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class CarGLBErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Componente 3D del vehículo con:
 * - Renderizado PBR Clearcoat (100k+ vértices) + llantas 3D forjadas a medida.
 * - Discos de freno térmicos que se ponen al rojo vivo dentro de la llanta en frenadas fuertes.
 * - Humo volumétrico 3D de neumáticos en derrape y estela de agua pulverizada (Spray) en modo Lluvia.
 */
export function CarModel({
  modelPath = CAR_GLB_PATH,
  modelYawOffsetRad = 0,
  paintColorOverrideHex,
  visualConfig,
  isGhost = false,
  motionRef,
  isDerailed = false,
}: CarModelProps) {
  const guidePivotRef = useRef<THREE.Group>(null);
  const chassisRollRef = useRef<THREE.Group>(null);
  const guidePinMeshRef = useRef<THREE.Mesh>(null);
  const sparksPointsRef = useRef<THREE.Points>(null);
  const smokePointsRef = useRef<THREE.Points>(null);

  const brakeHeatRef = useRef(0);

  const sparkPool = useMemo(() => {
    const positions = new Float32Array(SPARK_POOL_SIZE * 3);
    const velocities = new Float32Array(SPARK_POOL_SIZE * 3);
    const lifetimes = new Float32Array(SPARK_POOL_SIZE);
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      positions[i * 3 + 1] = -999;
      lifetimes[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);

    return { geo, positions, velocities, lifetimes, cursor: 0 };
  }, []);

  const smokePool = useMemo(() => {
    const positions = new Float32Array(SMOKE_POOL_SIZE * 3);
    const velocities = new Float32Array(SMOKE_POOL_SIZE * 3);
    const lifetimes = new Float32Array(SMOKE_POOL_SIZE);
    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      positions[i * 3 + 1] = -999;
      lifetimes[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);

    return { geo, positions, velocities, lifetimes, cursor: 0 };
  }, []);

  const softCloudTex = useMemo(() => getSoftCloudTexture(), []);

  useFrame((_, rawDelta) => {
    if (!motionRef?.current) return;
    const dt = Math.min(rawDelta, 0.05);
    const {
      bodyRollRad,
      bodyPitchRad = 0,
      driftYawRad,
      driftIntensity,
      speedMs = 0,
      brakeIntensity = 0,
      guideStress = 0,
      overVoltActive = false,
      isDerailed: derailed,
    } = motionRef.current;

    const telemetryState = useTelemetryStore.getState();
    const isRain = telemetryState.weatherMode === 'rain';

    if (guidePivotRef.current) {
      guidePivotRef.current.rotation.y = driftYawRad;
    }

    const isBraking = !derailed && brakeIntensity > 0.1;

    // 1. Cálculo térmico de discos de freno (se calientan al frenar fuerte y se enfrían con la velocidad del aire)
    if (isBraking && speedMs > 5) {
      const heatRate =
        brakeIntensity * Math.min(1.8, speedMs / 22) * 2.95;
      brakeHeatRef.current = Math.min(1, brakeHeatRef.current + heatRate * dt);
    } else {
      const coolRate = 0.52 + (speedMs / 38) * 0.95;
      brakeHeatRef.current = Math.max(0, brakeHeatRef.current - coolRate * dt);
    }

    if (chassisRollRef.current) {
      chassisRollRef.current.rotation.z = bodyRollRad;
      chassisRollRef.current.rotation.x = bodyPitchRad;

      const glbWrapper = chassisRollRef.current.getObjectByName(
        'glb-normalized-wrapper'
      );
      if (glbWrapper) {
        // Giro físico real de las 4 ruedas (ω = v / r)
        if (!derailed && speedMs > 0.05) {
          const wheels = glbWrapper.userData.wheels as
            | THREE.Object3D[]
            | undefined;
          const spinDir = (glbWrapper.userData.spinDirection as number) ?? 1;
          if (wheels && wheels.length > 0) {
            const angularStep = (speedMs / WHEEL_RADIUS_M) * dt * spinDir;
            for (let w = 0; w < wheels.length; w++) {
              wheels[w].rotation.x += angularStep;
            }
          }
        }

        // Iluminación sutil únicamente de las ópticas traseras reales esculpidas en la malla 3D
        const brakeMats = glbWrapper.userData.brakeMaterials as
          | THREE.MeshStandardMaterial[]
          | undefined;
        if (brakeMats && brakeMats.length > 0) {
          const targetEmissive = isBraking ? 2.4 : 0.25;
          for (let m = 0; m < brakeMats.length; m++) {
            brakeMats[m].emissiveIntensity = targetEmissive;
          }
        }

        // Incandescencia térmica en los 4 discos de freno cerámicos dentro de la llanta
        const discThermalMat = glbWrapper.userData.discThermalMaterial as
          | THREE.MeshStandardMaterial
          | undefined;
        if (discThermalMat) {
          discThermalMat.emissiveIntensity =
            Math.pow(brakeHeatRef.current, 1.3) * 4.4;
        }
      }
    }

    if (isGhost) return;

    if (guidePinMeshRef.current) {
      const pinMat = guidePinMeshRef.current
        .material as THREE.MeshStandardMaterial;
      if (derailed) {
        pinMat.color.setHex(0xe63946);
        pinMat.emissive.setHex(0xe63946);
        pinMat.emissiveIntensity = 0.9;
      } else if (overVoltActive) {
        pinMat.color.setHex(0x38bdf8);
        pinMat.emissive.setHex(0x38bdf8);
        pinMat.emissiveIntensity = 2.6;
      } else {
        pinMat.color.setHex(0xf59e0b);
        pinMat.emissive.setHex(0x000000);
        pinMat.emissiveIntensity = 0;
      }
    }

    // 2. Emisión de chispas metálicas en la guía delantera
    const sparkIntensity = Math.max(
      guideStress,
      driftIntensity * 0.85,
      overVoltActive ? 0.92 : 0
    );
    if (!derailed && sparkIntensity > 0.42) {
      const spawnCount = sparkIntensity > 0.75 ? 2 : 1;
      for (let s = 0; s < spawnCount; s++) {
        const idx = sparkPool.cursor;
        sparkPool.cursor = (sparkPool.cursor + 1) % SPARK_POOL_SIZE;

        const base = idx * 3;
        sparkPool.positions[base] = (Math.random() - 0.5) * 0.18;
        sparkPool.positions[base + 1] = 0.08;
        sparkPool.positions[base + 2] = SLOT_GUIDE_PIN_OFFSET_Z;

        sparkPool.velocities[base] = (Math.random() - 0.5) * 4.8;
        sparkPool.velocities[base + 1] = 1.6 + Math.random() * 3.4;
        sparkPool.velocities[base + 2] = -4.5 - Math.random() * 5.5;
        sparkPool.lifetimes[idx] = 0.16 + Math.random() * 0.14;
      }
    }

    let anySparkAlive = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      if (sparkPool.lifetimes[i] > 0) {
        anySparkAlive = true;
        sparkPool.lifetimes[i] -= dt;
        const base = i * 3;
        sparkPool.velocities[base + 1] -= 14.0 * dt;
        sparkPool.positions[base] += sparkPool.velocities[base] * dt;
        sparkPool.positions[base + 1] = Math.max(
          0.02,
          sparkPool.positions[base + 1] + sparkPool.velocities[base + 1] * dt
        );
        sparkPool.positions[base + 2] += sparkPool.velocities[base + 2] * dt;
      } else {
        sparkPool.positions[i * 3 + 1] = -999;
      }
    }

    if (sparksPointsRef.current) {
      sparksPointsRef.current.visible = anySparkAlive;
      const ptsMat = sparksPointsRef.current.material as THREE.PointsMaterial;
      ptsMat.color.setHex(overVoltActive ? 0x38bdf8 : 0xfbbf24);
      if (anySparkAlive) {
        const posAttr = sparkPool.geo.getAttribute(
          'position'
        ) as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
      }
    }

    // 3. Emisión de Humo 3D de Neumáticos al derrapar y Estela de Agua (Spray) en Modo Lluvia
    const shouldEmitRainSpray = isRain && !derailed && speedMs > 5.5;
    const shouldEmitTireSmoke =
      !isRain &&
      speedMs > 4.5 &&
      (driftIntensity > 0.24 || (derailed && speedMs > 3));

    if (shouldEmitRainSpray || shouldEmitTireSmoke) {
      const spawnPuffs =
        driftIntensity > 0.65 || (isRain && speedMs > 24) ? 2 : 1;
      for (let p = 0; p < spawnPuffs; p++) {
        const idx = smokePool.cursor;
        smokePool.cursor = (smokePool.cursor + 1) % SMOKE_POOL_SIZE;
        const base = idx * 3;
        const sideSign = idx % 2 === 0 ? -1 : 1;

        smokePool.positions[base] =
          sideSign * (0.76 + (Math.random() - 0.5) * 0.22);
        smokePool.positions[base + 1] = 0.14 + Math.random() * 0.12;
        smokePool.positions[base + 2] = -1.45 - Math.random() * 0.35;

        smokePool.velocities[base] =
          sideSign * (0.4 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.8;
        smokePool.velocities[base + 1] = isRain
          ? 1.4 + Math.random() * 1.8
          : 0.75 + Math.random() * 1.1;
        smokePool.velocities[base + 2] = -3.8 - Math.random() * 3.2;
        smokePool.lifetimes[idx] = isRain
          ? 0.24 + Math.random() * 0.14
          : 0.32 + Math.random() * 0.18;
      }
    }

    let anySmokeAlive = false;
    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      if (smokePool.lifetimes[i] > 0) {
        anySmokeAlive = true;
        smokePool.lifetimes[i] -= dt;
        const base = i * 3;
        smokePool.positions[base] += smokePool.velocities[base] * dt;
        smokePool.positions[base + 1] += smokePool.velocities[base + 1] * dt;
        smokePool.positions[base + 2] += smokePool.velocities[base + 2] * dt;
      } else {
        smokePool.positions[i * 3 + 1] = -999;
      }
    }

    if (smokePointsRef.current) {
      smokePointsRef.current.visible = anySmokeAlive;
      const smkMat = smokePointsRef.current.material as THREE.PointsMaterial;
      smkMat.color.setHex(isRain ? 0xbae6fd : 0xe2e8f0);
      smkMat.size = isRain ? 0.68 : 0.82;
      smkMat.opacity = isRain ? 0.36 : 0.46;
      if (anySmokeAlive) {
        const posAttr = smokePool.geo.getAttribute(
          'position'
        ) as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      {!isGhost && (
        <>
          <mesh
            ref={guidePinMeshRef}
            position={[0, 0.05, SLOT_GUIDE_PIN_OFFSET_Z]}
          >
            <boxGeometry args={[0.14, 0.12, 0.48]} />
            <meshStandardMaterial
              color={isDerailed ? '#E63946' : '#F59E0B'}
              emissive={isDerailed ? '#E63946' : '#000000'}
              emissiveIntensity={isDerailed ? 0.9 : 0}
            />
          </mesh>

          <points
            ref={sparksPointsRef}
            geometry={sparkPool.geo}
            visible={false}
            frustumCulled={false}
          >
            <pointsMaterial
              color="#FBBF24"
              size={0.14}
              sizeAttenuation
              transparent
              opacity={0.95}
              depthWrite={false}
            />
          </points>
        </>
      )}

      <group ref={guidePivotRef} position={[0, 0, SLOT_GUIDE_PIN_OFFSET_Z]}>
        <group ref={chassisRollRef} position={[0, 0, -SLOT_GUIDE_PIN_OFFSET_Z]}>
          <CarGLBErrorBoundary
            key={modelPath}
            fallback={<FallbackSlotCarMesh isGhost={isGhost} />}
          >
            <Suspense fallback={<FallbackSlotCarMesh isGhost={isGhost} />}>
              <LoadedCarGLB
                modelPath={modelPath}
                yawOffsetRad={modelYawOffsetRad}
                paintColorOverrideHex={paintColorOverrideHex}
                visualConfig={visualConfig}
                isGhost={isGhost}
              />
            </Suspense>
          </CarGLBErrorBoundary>

          {!isGhost && (
            <points
              ref={smokePointsRef}
              geometry={smokePool.geo}
              visible={false}
              frustumCulled={false}
            >
              <pointsMaterial
                map={softCloudTex}
                color="#E2E8F0"
                size={0.78}
                sizeAttenuation
                transparent
                opacity={0.44}
                depthWrite={false}
              />
            </points>
          )}
        </group>
      </group>
    </group>
  );
}

useGLTF.preload('/cars/gt3-enduro-pro.glb');
useGLTF.preload('/cars/lambo-razor-pro.glb');
useGLTF.preload('/cars/hyper-specter-pro.glb');
useGLTF.preload('/cars/skyline-kaido-pro.glb');
useGLTF.preload('/cars/lemans-apogee-pro.glb');
useGLTF.preload('/cars/jdm-touge-pro.glb');
useGLTF.preload('/cars/f1-monoposto-pro.glb');

export default CarModel;
