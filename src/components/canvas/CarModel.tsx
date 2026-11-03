'use client';

import React, { Component, Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export const CAR_GLB_PATH = '/cars/gt3-enduro-pro.glb';
const TARGET_CAR_LENGTH_M = 4.4;
export const SLOT_GUIDE_PIN_OFFSET_Z = 1.45;
const SPARK_POOL_SIZE = 28;
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

interface WheelSpec {
  x: number;
  y: number;
  z: number;
  r: number;
  w: number;
  rim?: number;
}

interface ProCarExtras {
  wheels?: {
    front: WheelSpec;
    rear: WheelSpec;
  };
}

function buildDetailedRacingWheel(
  spec: WheelSpec,
  isLeft: boolean,
  isGhost: boolean
): THREE.Group {
  const wheelGroup = new THREE.Group();
  const r = spec.r || 0.33;
  const w = spec.w || 0.28;
  const rimR = spec.rim || r * 0.64;

  if (isGhost) {
    const ghostTire = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, w, 20),
      GHOST_HOLOGRAM_MATERIAL
    );
    ghostTire.rotation.z = Math.PI / 2;
    wheelGroup.add(ghostTire);
    return wheelGroup;
  }

  // 1. Neumático Slick de caucho vulcanizado
  const tireGeo = new THREE.CylinderGeometry(r, r, w, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: '#12151A',
    roughness: 0.76,
    metalness: 0.08,
  });
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  wheelGroup.add(tireMesh);

  // 2. Tambor interior de llanta de aleación forjada
  const rimGeo = new THREE.CylinderGeometry(rimR, rimR, w * 1.03, 24);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    metalness: 0.88,
    roughness: 0.2,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rimMesh);

  // 3. Disco de freno cerámico ventilado interior
  const discGeo = new THREE.CylinderGeometry(
    rimR * 0.78,
    rimR * 0.78,
    w * 1.05,
    20
  );
  discGeo.rotateZ(Math.PI / 2);
  const discMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.82,
    roughness: 0.32,
  });
  wheelGroup.add(new THREE.Mesh(discGeo, discMat));

  // 4. Radios forjados (5 radios dobles) para apreciar claramente el giro físico a alta velocidad
  const spokeMat = new THREE.MeshStandardMaterial({
    color: '#E2E8F0',
    metalness: 0.92,
    roughness: 0.16,
  });
  const outerX = (isLeft ? 1 : -1) * (w * 0.49);
  const spokeGeo = new THREE.BoxGeometry(0.025, rimR * 1.82, 0.036);
  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.Mesh(spokeGeo, spokeMat);
    spoke.position.x = outerX;
    spoke.rotation.x = (s * Math.PI) / 5;
    wheelGroup.add(spoke);
  }

  // 5. Tuerca central monotuerca de competición (Center-Lock Roja)
  const nutGeo = new THREE.CylinderGeometry(0.048, 0.048, w * 1.09, 12);
  nutGeo.rotateZ(Math.PI / 2);
  const nutMat = new THREE.MeshStandardMaterial({
    color: '#E63946',
    metalness: 0.75,
    roughness: 0.22,
  });
  wheelGroup.add(new THREE.Mesh(nutGeo, nutMat));

  return wheelGroup;
}

export interface CarVisualMotionState {
  bodyRollRad: number;
  /** Cabeceo longitudinal de suspensión: positivo al hundir el morro en frenada, negativo al acelerar */
  bodyPitchRad?: number;
  driftYawRad: number;
  driftIntensity: number;
  /** Velocidad instantánea lineal (m/s) para giro físico de las 4 ruedas (ω = v / r) */
  speedMs?: number;
  /** Nivel de freno activo [0, 1] para encender luces de freno traseras */
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
  isGhost?: boolean;
  motionRef?: React.RefObject<CarVisualMotionState>;
  isDerailed?: boolean;
}

interface LoadedGLBProps {
  modelPath: string;
  yawOffsetRad: number;
  paintColorOverrideHex?: number;
  isGhost: boolean;
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
  isGhost,
}: LoadedGLBProps) {
  const { scene } = useGLTF(modelPath);

  const normalizedModel = useMemo(() => {
    const cloned = scene.clone(true);
    const wheelNodes: THREE.Object3D[] = [];
    const brakeMaterials: THREE.MeshStandardMaterial[] = [];

    // Eliminar mallas de bajo detalle (lod1+) en modelos Pro multi-LOD para dejar solo lod0 (100k+ vértices)
    const lodNodesToRemove: THREE.Object3D[] = [];
    cloned.traverse((child) => {
      if (/^lod[1-9]/i.test(child.name)) {
        lodNodesToRemove.push(child);
      }
    });
    for (const n of lodNodesToRemove) {
      n.parent?.remove(n);
    }

    const basePaintHex =
      paintColorOverrideHex ??
      CAR_SIGNATURE_PAINT_HEX[modelPath] ??
      0xd91b2e;

    const paintMaterial = new THREE.MeshPhysicalMaterial({
      color: basePaintHex,
      metalness: 0.7,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
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
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      emissive: '#E0F2FE',
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });

    cloned.traverse((child) => {
      if (
        /wheel|tire/i.test(child.name) &&
        !hasWheelAncestor(child, cloned)
      ) {
        wheelNodes.push(child);
      }

      if (child instanceof THREE.Mesh) {
        if (isGhost) {
          child.material = GHOST_HOLOGRAM_MATERIAL;
          child.castShadow = false;
          child.receiveShadow = false;
        } else {
          child.castShadow = true;
          child.receiveShadow = true;

          const matName = (
            (child.material as THREE.Material)?.name ?? ''
          ).toLowerCase();

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
            matName.includes('exhaust')
          ) {
            child.material = chromeMaterial;
          } else if (matName.includes('head') || matName.includes('drl')) {
            child.material = headlightMaterial;
          } else if (matName.includes('tail')) {
            const tailMat = new THREE.MeshStandardMaterial({
              color: '#FF1E38',
              emissive: '#FF1E38',
              emissiveIntensity: 0.65,
              roughness: 0.18,
            });
            child.material = tailMat;
            brakeMaterials.push(tailMat);
          }
        }
      }
    });

    // Si el modelo Pro incluye especificaciones CAD de ejes en userData.wheels, ensamblar las 4 ruedas 3D detalladas
    const extras = (scene.userData ?? {}) as ProCarExtras;
    if (extras.wheels?.front && extras.wheels?.rear && wheelNodes.length === 0) {
      const { front, rear } = extras.wheels;
      const placements: Array<{ spec: WheelSpec; xSign: 1 | -1; isLeft: boolean }> = [
        { spec: front, xSign: 1, isLeft: true },
        { spec: front, xSign: -1, isLeft: false },
        { spec: rear, xSign: 1, isLeft: true },
        { spec: rear, xSign: -1, isLeft: false },
      ];

      for (const p of placements) {
        const wGroup = buildDetailedRacingWheel(p.spec, p.isLeft, isGhost);
        wGroup.position.set(p.spec.x * p.xSign, p.spec.y, p.spec.z);
        cloned.add(wGroup);
        wheelNodes.push(wGroup);
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
    wrapper.userData.spinDirection = Math.cos(yawOffsetRad) >= 0 ? 1 : -1;
    return wrapper;
  }, [scene, yawOffsetRad, paintColorOverrideHex, isGhost, modelPath]);

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
 * - Renderizado PBR Clearcoat de alta densidad poligonal (100k+ vértices) + llantas forjadas con discos y pinzas.
 * - Rotación física real de las 4 ruedas ($\omega = v / r$) y cabeceo/balanceo de suspensión (Pitch & Roll).
 * - Luces de freno LED integradas en la malla 3D del coche y chispas metálicas en la guía delantera.
 */
export function CarModel({
  modelPath = CAR_GLB_PATH,
  modelYawOffsetRad = 0,
  paintColorOverrideHex,
  isGhost = false,
  motionRef,
  isDerailed = false,
}: CarModelProps) {
  const guidePivotRef = useRef<THREE.Group>(null);
  const chassisRollRef = useRef<THREE.Group>(null);
  const guidePinMeshRef = useRef<THREE.Mesh>(null);
  const leftSkidGlowRef = useRef<THREE.Mesh>(null);
  const rightSkidGlowRef = useRef<THREE.Mesh>(null);
  const leftBrakeLightRef = useRef<THREE.Mesh>(null);
  const rightBrakeLightRef = useRef<THREE.Mesh>(null);
  const sparksPointsRef = useRef<THREE.Points>(null);

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

    if (guidePivotRef.current) {
      guidePivotRef.current.rotation.y = driftYawRad;
    }

    const isBraking = !derailed && brakeIntensity > 0.1;

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

        // Iluminación de las ópticas traseras 3D esculpidas en el modelo .glb
        const brakeMats = glbWrapper.userData.brakeMaterials as
          | THREE.MeshStandardMaterial[]
          | undefined;
        if (brakeMats && brakeMats.length > 0) {
          const targetEmissive = isBraking ? 4.8 : 0.65;
          for (let m = 0; m < brakeMats.length; m++) {
            brakeMats[m].emissiveIntensity = targetEmissive;
          }
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

    for (const lightMesh of [
      leftBrakeLightRef.current,
      rightBrakeLightRef.current,
    ]) {
      if (!lightMesh) continue;
      const mat = lightMesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = isBraking ? 4.2 : 0.35;
      lightMesh.scale.setScalar(isBraking ? 1.2 : 1.0);
    }

    const showSkid = !derailed && (driftIntensity > 0.08 || overVoltActive);
    const glowScaleZ = overVoltActive ? 1.85 : 0.5 + driftIntensity * 1.9;
    const glowColorHex = overVoltActive
      ? 0x38bdf8
      : driftIntensity > 0.65
        ? 0xe63946
        : 0xf59e0b;

    for (const mesh of [leftSkidGlowRef.current, rightSkidGlowRef.current]) {
      if (!mesh) continue;
      mesh.visible = showSkid;
      if (showSkid) {
        mesh.scale.set(1, 1, glowScaleZ);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(glowColorHex);
        mat.opacity = overVoltActive
          ? 0.78
          : Math.min(0.88, 0.25 + driftIntensity * 0.65);
      }
    }

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

    let anyAlive = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      if (sparkPool.lifetimes[i] > 0) {
        anyAlive = true;
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
      sparksPointsRef.current.visible = anyAlive;
      const ptsMat = sparksPointsRef.current.material as THREE.PointsMaterial;
      ptsMat.color.setHex(overVoltActive ? 0x38bdf8 : 0xfbbf24);
      if (anyAlive) {
        const posAttr = sparkPool.geo.getAttribute(
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
                isGhost={isGhost}
              />
            </Suspense>
          </CarGLBErrorBoundary>

          {!isGhost && (
            <>
              <mesh ref={leftBrakeLightRef} position={[-0.58, 0.44, -2.14]}>
                <boxGeometry args={[0.32, 0.07, 0.06]} />
                <meshStandardMaterial
                  color="#FF1E38"
                  emissive="#FF1E38"
                  emissiveIntensity={0.35}
                  roughness={0.2}
                />
              </mesh>
              <mesh ref={rightBrakeLightRef} position={[0.58, 0.44, -2.14]}>
                <boxGeometry args={[0.32, 0.07, 0.06]} />
                <meshStandardMaterial
                  color="#FF1E38"
                  emissive="#FF1E38"
                  emissiveIntensity={0.35}
                  roughness={0.2}
                />
              </mesh>

              <mesh
                ref={leftSkidGlowRef}
                visible={false}
                position={[-0.86, 0.03, -1.45]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[0.36, 1.1]} />
                <meshBasicMaterial
                  color="#F59E0B"
                  transparent
                  opacity={0.6}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <mesh
                ref={rightSkidGlowRef}
                visible={false}
                position={[0.86, 0.03, -1.45]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[0.36, 1.1]} />
                <meshBasicMaterial
                  color="#F59E0B"
                  transparent
                  opacity={0.6}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </>
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
