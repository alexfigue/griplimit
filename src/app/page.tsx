import React from 'react';
import { Scene } from '@/components/canvas/Scene';
import { TelemetryUI } from '@/components/ui/TelemetryUI';

export default function HomePage() {
  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-[#0D1117]">
      <Scene />
      <TelemetryUI />
    </main>
  );
}
