'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { EnvironmentScenery } from '@/components/canvas/EnvironmentScenery';
import { GhostCar } from '@/components/canvas/GhostCar';
import { PhysicsCar } from '@/components/canvas/PhysicsCar';
import { RivalCar } from '@/components/canvas/RivalCar';
import { Track } from '@/components/canvas/Track';

/**
 * Escena 3D principal de React Three Fiber.
 * Combina el escenario exterior/maqueta (<EnvironmentScenery />), circuito de doble carril,
 * coche fantasma holográfico (<GhostCar />), rival IA con audio espacial y vehículo del jugador.
 */
export function Scene() {
  return (
    <div className="fixed inset-0 h-full w-full bg-[#0D1117]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [42, 8, 42], fov: 50, near: 0.3, far: 1200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <EnvironmentScenery />
        <Track />
        <GhostCar />
        <RivalCar />
        <PhysicsCar />
      </Canvas>
    </div>
  );
}

export default Scene;
