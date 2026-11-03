'use client';

import React, { Component, Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export const CAR_GLB_PATH = '/car.glb';
const TARGET_CAR_LENGTH_M = 4.2;
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

export interface CarVisualMotionState {
  bodyRollRad: number;
  driftYawRad: number;
  driftIntensity: number;
  /** Velocidad instantánea lineal (m/s) para giro físico de las 4 ruedas (ω = v / r) */
  speedMs?: number;
  /** Nivel de freno activo [0, 1] para encender luces de freno traseras */
  brakeIntensity?: number;
  /** Nivel de estrés vertical en la guía [0, 1] para emitir chispas metálicas */
  guideStress?: number;
  /** Indica si la descarga eléctrica OverVolt 18V está activa */
  overVoltActive?: boolean;
  isDerailed: boolean;
}

export interface CarModelProps {
  modelPath?: string;
  modelYawOffsetRad?: number;
  isGhost?: boolean;
  motionRef?: React.RefObject<CarVisualMotionState>;
  isDerailed?: boolean;
}

interface LoadedGLBProps {
  modelPath: string;
  yawOffsetRad: number;
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

function LoadedCarGLB({ modelPath, yawOffsetRad, isGhost }: LoadedGLBProps) {
  const { scene } = useGLTF(modelPath);

  const normalizedModel = useMemo(() => {
    const cloned = scene.clone(true);
    const wheelNodes: THREE.Object3D[] = [];

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
        }
      }
    });

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
    wrapper.userData.spinDirection = Math.cos(yawOffsetRad) >= 0 ? 1 : -1;
    return wrapper;
  }, [scene, yawOffsetRad, isGhost]);

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
        <meshStandardMaterial color="#2F81F7" metalness={0.35} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.68, -0.15]} castShadow>
        <boxGeometry args={[1.15, 0.34, 1.75]} />
        <meshStandardMaterial color="#0D1117" metalness={0.7} roughness={0.18} />
      </mesh>
      <mesh position={[0, 0.86, -1.85]} castShadow>
        <boxGeometry args={[1.95, 0.1, 0.48]} />
        <meshStandardMaterial color="#E63946" metalness={0.25} roughness={0.4} />
      </mesh>
      {(
        [
          [-0.98, 0.32, 1.25],
          [0.98, 0.32, 1.25],
          [-0.98, 0.34, -1.28],
          [0.98, 0.34, -1.28],
        ] as const
      ).map(([wx, wy, wz], idx) => (
        <mesh
          key={idx}
          position={[wx, wy, wz]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.33, 0.33, 0.36, 16]} />
          <meshStandardMaterial color="#181C22" roughness={0.75} />
        </mesh>
      ))}
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
 * - Normalización automática de escala (4.2 m) y rotación (`modelYawOffsetRad`) para modelos `.glb` oficiales y de la comunidad.
 * - Rotación física real de las 4 ruedas ($\omega = v / r$) en nodos `wheel*` / `tire*` del `.glb`.
 * - Modo holográfico translúcido (`isGhost`) para el Ghost Car de tu mejor vuelta.
 * - Pivote físico sobre la guía delantera (Z = +1.45 m), luces LED de freno y chispas metálicas / eléctricas OverVolt 0-GC.
 */
export function CarModel({
  modelPath = CAR_GLB_PATH,
  modelYawOffsetRad = 0,
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

  // Pool fijo de partículas para chispas metálicas/eléctricas de la guía (cero asignaciones en useFrame)
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
    if (chassisRollRef.current) {
      chassisRollRef.current.rotation.z = bodyRollRad;

      // 0. Giro físico real de las 4 ruedas (ω = v / r)
      if (!derailed && speedMs > 0.05) {
        const glbWrapper = chassisRollRef.current.getObjectByName(
          'glb-normalized-wrapper'
        );
        if (glbWrapper) {
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
      }
    }

    if (isGhost) return;

    // Guía delantera y color de descarga eléctrica OverVolt
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

    // 1. Luces traseras de freno LED
    const isBraking = !derailed && brakeIntensity > 0.1;
    for (const lightMesh of [
      leftBrakeLightRef.current,
      rightBrakeLightRef.current,
    ]) {
      if (!lightMesh) continue;
      const mat = lightMesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = isBraking ? 3.8 : 0.35;
      lightMesh.scale.setScalar(isBraking ? 1.18 : 1.0);
    }

    // 2. Brillo térmico bajo neumáticos traseros en derrape o descarga OverVolt
    const showSkid =
      !derailed && (driftIntensity > 0.05 || overVoltActive);
    const glowScaleZ = overVoltActive
      ? 1.85
      : 0.5 + driftIntensity * 1.9;
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

    // 3. Chispas metálicas en la guía delantera cuando hay fricción intensa o OverVolt 18V activo
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
      const ptsMat = sparksPointsRef.current
        .material as THREE.PointsMaterial;
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
          {/* Guía delantera en la ranura */}
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

          {/* Partículas de chispas metálicas/eléctricas de la trencilla/guía */}
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

      {/* Carrocería pivotando sobre la guía delantera */}
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
                isGhost={isGhost}
              />
            </Suspense>
          </CarGLBErrorBoundary>

          {!isGhost && (
            <>
              {/* Pilotos traseros LED de freno */}
              <mesh ref={leftBrakeLightRef} position={[-0.58, 0.38, -2.04]}>
                <boxGeometry args={[0.34, 0.09, 0.08]} />
                <meshStandardMaterial
                  color="#FF1E38"
                  emissive="#FF1E38"
                  emissiveIntensity={0.35}
                  roughness={0.2}
                />
              </mesh>
              <mesh ref={rightBrakeLightRef} position={[0.58, 0.38, -2.04]}>
                <boxGeometry args={[0.34, 0.09, 0.08]} />
                <meshStandardMaterial
                  color="#FF1E38"
                  emissive="#FF1E38"
                  emissiveIntensity={0.35}
                  roughness={0.2}
                />
              </mesh>

              {/* Brillo térmico bajo neumáticos traseros */}
              <mesh
                ref={leftSkidGlowRef}
                visible={false}
                position={[-0.96, 0.04, -1.55]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[0.38, 1.15]} />
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
                position={[0.96, 0.04, -1.55]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[0.38, 1.15]} />
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

useGLTF.preload(CAR_GLB_PATH);
useGLTF.preload('/cars/aero-saber.glb');
useGLTF.preload('/cars/sonic-wing.glb');
useGLTF.preload('/cars/phantom-stream.glb');
useGLTF.preload('/cars/tokyo-gt-turbo.glb');
useGLTF.preload('/cars/cyber-formula.glb');
useGLTF.preload('/cars/kenney-sedan-gt.glb');
useGLTF.preload('/cars/apex-supercar.glb');
useGLTF.preload('/cars/kenney-race-truck.glb');
useGLTF.preload('/cars/kenney-moto-gp.glb');

export default CarModel;
