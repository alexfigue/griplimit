'use client';

import React, { useEffect, useState } from 'react';
import { CUP_BOSS_BY_TRACK } from '@/components/canvas/RivalCar';
import { GaragePanel } from '@/components/ui/GaragePanel';
import { setPointerBrake, setPointerThrottle } from '@/hooks/useControls';
import { CIRCUITS } from '@/lib/montmeloSpline';
import { soundEngine } from '@/lib/soundEngine';
import { useGarageStore, useTelemetryStore } from '@/store/store';
import type { LapMedalGrade, SectorColor, TrackId } from '@/types/types';

function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const thousandths = Math.floor(ms % 1000);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(thousandths).padStart(3, '0')}`;
}

function formatSectorSeconds(ms: number | null): string {
  if (ms === null) return '--.--';
  return `${(ms / 1000).toFixed(2)}s`;
}

function getSectorBadgeClasses(color: SectorColor): string {
  switch (color) {
    case 'purple':
      return 'border-purple-400/80 bg-purple-500/25 text-purple-100';
    case 'green':
      return 'border-emerald-400/80 bg-emerald-500/20 text-emerald-100';
    case 'amber':
      return 'border-amber-400/80 bg-amber-500/20 text-amber-100';
    default:
      return 'border-slate-800 bg-[#0D1117]/75 text-slate-500';
  }
}

function getMedalBannerClasses(medal: LapMedalGrade): {
  border: string;
  badge: string;
  accent: string;
} {
  switch (medal) {
    case 'perfect':
      return {
        border: 'border-purple-400 bg-[#151226]/95',
        badge: 'bg-purple-500 text-white',
        accent: 'text-purple-200',
      };
    case 'drift-master':
      return {
        border: 'border-[#F59E0B] bg-[#1E1710]/95',
        badge: 'bg-[#F59E0B] text-slate-950',
        accent: 'text-amber-200',
      };
    case 'clean':
      return {
        border: 'border-emerald-400 bg-[#11201B]/95',
        badge: 'bg-emerald-500 text-slate-950',
        accent: 'text-emerald-200',
      };
    default:
      return {
        border: 'border-slate-600 bg-[#151B24]/95',
        badge: 'bg-slate-700 text-slate-100',
        accent: 'text-slate-300',
      };
  }
}

/**
 * HUD unificado v2.0 de Telemetría, Modo Copa 3V (Semáforo F1 + Jefes IA),
 * Rebufo + Descarga OverVolt 18V [B], Clima Dinámico [V], 3 Circuitos, Sectores F1 y Garaje.
 */
export function TelemetryUI() {
  const trackId = useTelemetryStore((s) => s.trackId);
  const playerLane = useTelemetryStore((s) => s.playerLane);
  const rivalEnabled = useTelemetryStore((s) => s.rivalEnabled);
  const ghostEnabled = useTelemetryStore((s) => s.ghostEnabled);
  const assistEnabled = useTelemetryStore((s) => s.assistEnabled);
  const soundEnabled = useTelemetryStore((s) => s.soundEnabled);
  const cameraMode = useTelemetryStore((s) => s.cameraMode);
  const environmentStyle = useTelemetryStore((s) => s.environmentStyle);
  const weatherMode = useTelemetryStore((s) => s.weatherMode);

  const raceMode = useTelemetryStore((s) => s.raceMode);
  const cupStartPhase = useTelemetryStore((s) => s.cupStartPhase);
  const countdownLights = useTelemetryStore((s) => s.countdownLights);
  const cupTargetLaps = useTelemetryStore((s) => s.cupTargetLaps);
  const cupWinner = useTelemetryStore((s) => s.cupWinner);
  const cupRewardGp = useTelemetryStore((s) => s.cupRewardGp);

  const speedKmh = useTelemetryStore((s) => s.speedKmh);
  const centrifugalForce = useTelemetryStore((s) => s.centrifugalForce);
  const gripAvailable = useTelemetryStore((s) => s.gripAvailable);
  const gripUsageRatio = useTelemetryStore((s) => s.gripUsageRatio);
  const isDrifting = useTelemetryStore((s) => s.isDrifting);
  const driftAngleDeg = useTelemetryStore((s) => s.driftAngleDeg);
  const guideStressRatio = useTelemetryStore((s) => s.guideStressRatio);
  const brakeAdvice = useTelemetryStore((s) => s.brakeAdvice);
  const recommendedCornerSpeedKmh = useTelemetryStore(
    (s) => s.recommendedCornerSpeedKmh
  );
  const curvatureRadius = useTelemetryStore((s) => s.curvatureRadius);
  const slopePercent = useTelemetryStore((s) => s.slopePercent);
  const lapCount = useTelemetryStore((s) => s.lapCount);
  const currentLapTimeMs = useTelemetryStore((s) => s.currentLapTimeMs);
  const lastLapTimeMs = useTelemetryStore((s) => s.lastLapTimeMs);
  const bestLapTimeMs = useTelemetryStore((s) => s.bestLapTimeMs);
  const currentSectors = useTelemetryStore((s) => s.currentSectors);
  const lastLapSummary = useTelemetryStore((s) => s.lastLapSummary);
  const isDerailed = useTelemetryStore((s) => s.isDerailed);
  const lastDerailForce = useTelemetryStore((s) => s.lastDerailForce);
  const throttleInput = useTelemetryStore((s) => s.throttleInput);
  const brakeInput = useTelemetryStore((s) => s.brakeInput);

  const slipstreamActive = useTelemetryStore((s) => s.slipstreamActive);
  const overVoltCharge = useTelemetryStore((s) => s.overVoltCharge);
  const overVoltActive = useTelemetryStore((s) => s.overVoltActive);
  const falseStartPenalty = useTelemetryStore((s) => s.falseStartPenalty);
  const turboStartActive = useTelemetryStore((s) => s.turboStartActive);
  const gapToRivalM = useTelemetryStore((s) => s.gapToRivalM);
  const playerRacePosition = useTelemetryStore((s) => s.playerRacePosition);

  const setTrackId = useTelemetryStore((s) => s.setTrackId);
  const startCupRace = useTelemetryStore((s) => s.startCupRace);
  const exitCupRace = useTelemetryStore((s) => s.exitCupRace);
  const triggerOverVolt = useTelemetryStore((s) => s.triggerOverVolt);
  const toggleWeatherMode = useTelemetryStore((s) => s.toggleWeatherMode);
  const togglePlayerLane = useTelemetryStore((s) => s.togglePlayerLane);
  const toggleRival = useTelemetryStore((s) => s.toggleRival);
  const toggleGhost = useTelemetryStore((s) => s.toggleGhost);
  const toggleAssist = useTelemetryStore((s) => s.toggleAssist);
  const toggleSound = useTelemetryStore((s) => s.toggleSound);
  const toggleCameraMode = useTelemetryStore((s) => s.toggleCameraMode);
  const toggleEnvironmentStyle = useTelemetryStore(
    (s) => s.toggleEnvironmentStyle
  );
  const requestTrackReset = useTelemetryStore((s) => s.requestTrackReset);

  const maxSpeedKmh = useGarageStore((s) => s.carStats.MaxSpeed);
  const driftCeilingRatio = useGarageStore((s) => s.carStats.DriftCeilingRatio);
  const activeTireId = useGarageStore((s) => s.loadout.tiresId);

  const boss = CUP_BOSS_BY_TRACK[trackId];

  const [visibleSummaryTs, setVisibleSummaryTs] = useState<number | null>(null);

  useEffect(() => {
    if (!lastLapSummary) {
      setVisibleSummaryTs(null);
      return;
    }
    setVisibleSummaryTs(lastLapSummary.timestamp);
    const timer = window.setTimeout(() => {
      setVisibleSummaryTs((prev) =>
        prev === lastLapSummary.timestamp ? null : prev
      );
    }, 4400);
    return () => window.clearTimeout(timer);
  }, [lastLapSummary]);

  const showLapMedalBanner =
    !isDerailed &&
    cupStartPhase !== 'finished' &&
    cupStartPhase !== 'countdown' &&
    lastLapSummary !== null &&
    visibleSummaryTs === lastLapSummary.timestamp;

  const MAX_GAUGE_RATIO = driftCeilingRatio;
  const clampedGripBarWidth = Math.min(
    100,
    (gripUsageRatio / MAX_GAUGE_RATIO) * 100
  );
  const driftStartMarkerLeft = (0.85 / MAX_GAUGE_RATIO) * 100;
  const nominalGripMarkerLeft = (1.0 / MAX_GAUGE_RATIO) * 100;

  const guideStressWidth = Math.min(100, guideStressRatio * 100);
  const speedBarWidth =
    maxSpeedKmh > 0 ? Math.min(100, (speedKmh / maxSpeedKmh) * 100) : 0;
  const overVoltPercent = Math.round(overVoltCharge * 100);
  const isOverVoltReady = overVoltCharge >= 0.99 && !overVoltActive;

  const gripBarColor =
    isDerailed || gripUsageRatio >= 1.05
      ? 'bg-[#E63946]'
      : isDrifting || gripUsageRatio >= 0.85
        ? 'bg-[#F59E0B]'
        : 'bg-[#2F81F7]';

  const gripStatusLabel = isDerailed
    ? 'Fuera de carril'
    : isDrifting
      ? `Derrape en guía · ${Math.round(driftAngleDeg)}°`
      : gripUsageRatio >= 0.7
        ? 'Apoyo firme en curva'
        : 'Tracción limpia';

  const radiusDisplay =
    !Number.isFinite(curvatureRadius) || curvatureRadius > 260
      ? 'Recta'
      : `${curvatureRadius.toFixed(1)} m`;

  const slopeLabel =
    Math.abs(slopePercent) < 1.2
      ? '0%'
      : `${slopePercent > 0 ? '+' : ''}${Math.round(slopePercent)}%`;

  const gapDisplay = `${gapToRivalM >= 0 ? '+' : ''}${gapToRivalM.toFixed(1)} m`;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* HEADER UNIFICADO SIN SOLAPAMIENTOS: 3 Circuitos + Modo Copa 3V + Crono + Sectores F1 | Botonera | Garaje */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        {/* Bloque Izquierdo: Selector de 3 Circuitos + Botón Copa Let's & Go + Cronometraje + Parciales S1/S2/S3 */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-[#151B24]/92 px-3.5 py-2 backdrop-blur-md">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(CIRCUITS) as TrackId[]).map((id) => {
                const active = id === trackId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      soundEngine.unlock();
                      setTrackId(id);
                    }}
                    className={`rounded-xs px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                      active
                        ? id === 'neo-wangan'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-[#2F81F7] text-white'
                        : 'bg-[#0D1117]/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {CIRCUITS[id].name}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  if (raceMode === 'cup') {
                    exitCupRace();
                  } else {
                    startCupRace();
                  }
                }}
                className={`rounded-xs border px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                  raceMode === 'cup'
                    ? 'border-[#F59E0B] bg-[#F59E0B] text-slate-950'
                    : 'border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#F59E0B] hover:bg-[#F59E0B]/25'
                }`}
              >
                {raceMode === 'cup' ? '🏆 Salir de Copa' : '🏆 Copa 3V vs Jefe'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {raceMode === 'cup' ? (
                <span className="font-mono text-amber-200">
                  {boss.cupTitle} · Rival: <strong>{boss.name}</strong>
                </span>
              ) : (
                CIRCUITS[trackId].subtitle
              )}
            </p>
          </div>

          <div className="hidden h-10 w-px bg-slate-800 sm:block" />

          <div>
            <div className="flex gap-3.5 font-mono text-xs tabular-nums">
              {raceMode === 'cup' && (
                <div>
                  <span className="block text-[10px] text-slate-400">Pos.</span>
                  <span
                    className={`text-sm font-bold ${
                      playerRacePosition === 1
                        ? 'text-emerald-400'
                        : 'text-[#F59E0B]'
                    }`}
                  >
                    {playerRacePosition}.º / 2
                  </span>
                </div>
              )}
              <div>
                <span className="block text-[10px] text-slate-400">Vuelta</span>
                <span className="text-sm font-semibold text-[#F0F4F8]">
                  {raceMode === 'cup'
                    ? `${Math.min(lapCount, cupTargetLaps)}/${cupTargetLaps}`
                    : lapCount}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Crono</span>
                <span className="text-sm font-semibold text-[#F0F4F8]">
                  {formatLapTime(currentLapTimeMs)}
                </span>
              </div>
              {raceMode === 'cup' ? (
                <div>
                  <span className="block text-[10px] text-slate-400">
                    Gap Jefe
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      gapToRivalM >= 0 ? 'text-emerald-400' : 'text-[#E63946]'
                    }`}
                  >
                    {gapDisplay}
                  </span>
                </div>
              ) : (
                lastLapTimeMs !== null && (
                  <div>
                    <span className="block text-[10px] text-slate-400">
                      Última
                    </span>
                    <span className="text-sm font-semibold text-slate-300">
                      {formatLapTime(lastLapTimeMs)}
                    </span>
                  </div>
                )
              )}
              <div>
                <span className="block text-[10px] text-slate-400">Mejor</span>
                <span className="text-sm font-bold text-[#F59E0B]">
                  {bestLapTimeMs !== null
                    ? formatLapTime(bestLapTimeMs)
                    : '--:--.---'}
                </span>
              </div>
            </div>

            {/* Parciales oficiales estilo F1: Morado (Récord), Verde (En ritmo), Ámbar (Lento) */}
            <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
              {(['S1', 'S2', 'S3'] as const).map((label, idx) => {
                const split = currentSectors[idx];
                return (
                  <span
                    key={label}
                    className={`rounded-xs border px-1.5 py-0.5 font-semibold transition-colors ${getSectorBadgeClasses(
                      split.color
                    )}`}
                  >
                    {label} {formatSectorSeconds(split.timeMs)}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bloque Derecho Unificado: Controles de Pista + Clima [V] + Ghost Car + Desplegable de Garaje */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-[#151B24]/90 p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={toggleWeatherMode}
              title="Cambiar entre Asfalto Seco y Tormenta de Lluvia (+20% GP en Lluvia) [Tecla V]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                weatherMode === 'rain'
                  ? 'border-sky-400/80 bg-sky-500/25 text-sky-100'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-200 hover:border-[#2F81F7]'
              }`}
            >
              Clima: {weatherMode === 'rain' ? '🌧️ Lluvia' : '☀️ Seco'} [V]
            </button>

            <button
              type="button"
              onClick={toggleAssist}
              title="Activar o quitar línea predictiva (Sin ayuda ganas ×1.35 GP) [Tecla H]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                assistEnabled
                  ? 'border-[#2F81F7]/70 bg-[#2F81F7]/20 text-[#F0F4F8]'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              Ayuda: {assistEnabled ? 'ON' : 'OFF'} [H]
            </button>

            <button
              type="button"
              onClick={toggleGhost}
              title="Mostrar u ocultar el Coche Fantasma de tu mejor vuelta [Tecla G]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                ghostEnabled
                  ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              Fantasma: {ghostEnabled ? 'ON' : 'OFF'} [G]
            </button>

            <button
              type="button"
              onClick={togglePlayerLane}
              title="Cambiar entre carril izquierdo y derecho [Tecla L]"
              className="rounded-xs border border-slate-700/70 bg-[#0D1117]/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#2F81F7]"
            >
              Carril: {playerLane === 'left' ? 'Izq' : 'Der'} [L]
            </button>

            <button
              type="button"
              onClick={toggleRival}
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                rivalEnabled
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              Rival: {rivalEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                toggleSound();
              }}
              title="Silenciar o activar audio del motor [Tecla M]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                soundEnabled
                  ? 'border-slate-700/70 bg-[#0D1117]/70 text-slate-200 hover:border-[#2F81F7]'
                  : 'border-slate-800 bg-[#0D1117]/40 text-slate-500 hover:text-slate-300'
              }`}
            >
              Audio: {soundEnabled ? 'ON' : 'OFF'} [M]
            </button>

            <button
              type="button"
              onClick={toggleEnvironmentStyle}
              title="Alternar entre paisaje real exterior y modo maqueta de salón [Tecla E]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                environmentStyle === 'tabletop'
                  ? 'border-[#F59E0B]/70 bg-[#F59E0B]/20 text-amber-100'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-200 hover:border-[#2F81F7]'
              }`}
            >
              Ambiente: {environmentStyle === 'realistic' ? 'Real' : 'Salón'} [E]
            </button>

            <button
              type="button"
              onClick={toggleCameraMode}
              className="rounded-xs border border-slate-700/70 bg-[#0D1117]/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#2F81F7]"
            >
              {cameraMode === 'chase' ? 'Cenital [C]' : 'Persecución [C]'}
            </button>

            <button
              type="button"
              onClick={requestTrackReset}
              className="rounded-xs border border-slate-700/70 bg-[#0D1117]/70 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-[#E63946] hover:text-white"
            >
              Reencarrilar [R]
            </button>
          </div>

          <GaragePanel />
        </div>
      </header>

      {/* ZONA CENTRAL: Semáforo F1, Resultado Copa 3V, Salida Nula/Turbo, Medalla de Vuelta o Aviso de Frenada */}
      <div className="mx-auto flex flex-col items-center gap-2">
        {/* Semáforo de 5 luces rojas estilo F1 en la parrilla de salida */}
        {raceMode === 'cup' && cupStartPhase === 'countdown' && (
          <div className="rounded-md border-2 border-slate-700 bg-[#0D1117]/95 px-6 py-4 text-center shadow-2xl backdrop-blur-md">
            <span className="font-mono text-[11px] font-bold tracking-wider text-amber-300 uppercase">
              {boss.cupTitle} · Duelo a {cupTargetLaps} Vueltas vs {boss.name}
            </span>
            <div className="my-3 flex items-center justify-center gap-3">
              {([1, 2, 3, 4, 5] as const).map((idx) => {
                const lit = countdownLights >= idx;
                return (
                  <div
                    key={idx}
                    className={`h-9 w-9 rounded-full border-2 transition-all ${
                      lit
                        ? 'border-red-300 bg-[#FF1E38] shadow-[0_0_20px_#FF1E38]'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  />
                );
              })}
            </div>
            <p className="font-mono text-xs text-slate-300">
              No aceleres antes de apagarse las luces · Acelera al apagarse para{' '}
              <strong className="text-cyan-300">Salida Turbo</strong>
            </p>
          </div>
        )}

        {/* Modal de Final de Carrera de Copa 3V */}
        {raceMode === 'cup' && cupStartPhase === 'finished' && (
          <div
            className={`pointer-events-auto max-w-md rounded-md border-2 px-6 py-4 text-center shadow-2xl backdrop-blur-md ${
              cupWinner === 'player'
                ? 'border-[#F59E0B] bg-[#151B24]/97'
                : 'border-slate-600 bg-[#151B24]/97'
            }`}
          >
            <span
              className={`inline-block rounded-xs px-2.5 py-0.5 font-mono text-xs font-bold ${
                cupWinner === 'player'
                  ? 'bg-[#F59E0B] text-slate-950'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              {cupWinner === 'player'
                ? `🏆 ¡CAMPEÓN DE ${boss.cupTitle.toUpperCase()}!`
                : `2.º PUESTO · ${boss.name} GANA LA COPA`}
            </span>
            <p className="mt-2 font-display text-xl font-bold text-[#F0F4F8]">
              {cupWinner === 'player'
                ? `¡Derrotaste a ${boss.name}!`
                : `${boss.name} cruzó la meta primero`}
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-emerald-400">
              Recompensa de Copa: +{cupRewardGp} GP añadidos al Garaje
            </p>
            <div className="mt-3 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={startCupRace}
                className="rounded-xs bg-[#2F81F7] px-3.5 py-1.5 font-display text-xs font-bold text-white hover:bg-blue-500"
              >
                Repetir Copa 3V
              </button>
              <button
                type="button"
                onClick={exitCupRace}
                className="rounded-xs border border-slate-700 bg-[#0D1117] px-3.5 py-1.5 font-display text-xs font-semibold text-slate-300 hover:border-slate-500"
              >
                Práctica Libre
              </button>
            </div>
          </div>
        )}

        {/* Avisos instantáneos de Salida Nula o Salida Turbo */}
        {falseStartPenalty && (
          <div className="rounded-md border-2 border-[#E63946] bg-[#151B24]/95 px-4 py-2 text-center shadow-lg">
            <span className="font-display text-sm font-bold text-[#E63946]">
              ⚠️ ¡SALIDA NULA! Corte de corriente de penalización (1.2 s)
            </span>
          </div>
        )}

        {turboStartActive && !falseStartPenalty && (
          <div className="rounded-md border-2 border-cyan-400 bg-cyan-950/90 px-4 py-1.5 text-center shadow-lg">
            <span className="font-display text-sm font-bold text-cyan-200">
              ⚡ ¡SALIDA PERFECTA TURBO! +28% Empuje Inicial
            </span>
          </div>
        )}

        {isDerailed ? (
          <div
            role="alert"
            className="pointer-events-auto max-w-md rounded-md border-2 border-[#E63946] bg-[#151B24]/95 px-5 py-4 text-center shadow-2xl backdrop-blur-md"
          >
            <p className="font-display text-lg font-bold text-[#E63946]">
              La guía saltó del carril
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-slate-300">
              Pico centrífugo: {Math.round(lastDerailForce)} N frente a{' '}
              {Math.round(gripAvailable)} N disponibles
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Suelta el acelerador al notar el derrape o equipa rodillos
              estabilizadores en el garaje.
            </p>
          </div>
        ) : showLapMedalBanner && lastLapSummary ? (
          (() => {
            const style = getMedalBannerClasses(lastLapSummary.medal);
            return (
              <div
                className={`max-w-md rounded-md border-2 px-5 py-3 text-center shadow-2xl backdrop-blur-md ${style.border}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span
                    className={`rounded-xs px-2 py-0.5 font-mono text-[11px] font-bold ${style.badge}`}
                  >
                    +{lastLapSummary.earnedCredits} GP
                  </span>
                  {lastLapSummary.isNewBest && (
                    <span className="rounded-xs bg-cyan-500/25 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-200">
                      NUEVO RÉCORD · FANTASMA ACTUALIZADO
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-display text-lg font-bold tracking-wide text-[#F0F4F8]">
                  {lastLapSummary.title}
                </p>
                <p
                  className={`font-mono text-sm font-bold tabular-nums ${style.accent}`}
                >
                  {formatLapTime(lastLapSummary.lapTimeMs)}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {lastLapSummary.subtitle}
                </p>
              </div>
            );
          })()
        ) : null}

        {!isDerailed && assistEnabled && brakeAdvice === 'brake' ? (
          <div className="rounded-md border border-[#E63946] bg-[#E63946]/25 px-4 py-1.5 text-center backdrop-blur-sm">
            <span className="font-display text-sm font-bold text-[#F0F4F8]">
              Frena ahora
            </span>
            {recommendedCornerSpeedKmh !== null && (
              <span className="ml-2 font-mono text-xs tabular-nums text-red-200">
                Vértice a {recommendedCornerSpeedKmh} km/h
              </span>
            )}
          </div>
        ) : !isDerailed && assistEnabled && brakeAdvice === 'coast' ? (
          <div className="rounded-md border border-[#F59E0B]/80 bg-[#F59E0B]/18 px-4 py-1.5 text-center backdrop-blur-sm">
            <span className="font-display text-sm font-semibold text-[#F0F4F8]">
              Templa el gas
            </span>
            {recommendedCornerSpeedKmh !== null && (
              <span className="ml-2 font-mono text-xs tabular-nums text-amber-200">
                Curva de {recommendedCornerSpeedKmh} km/h
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* ZONA INFERIOR: Pedales táctiles PWA + Botón OverVolt 18V + Cuadro principal de Telemetría */}
      <div className="flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-end">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <button
            type="button"
            onPointerDown={() => setPointerBrake(true)}
            onPointerUp={() => setPointerBrake(false)}
            onPointerLeave={() => setPointerBrake(false)}
            onPointerCancel={() => setPointerBrake(false)}
            className={`flex h-20 w-26 flex-col items-center justify-center rounded-md border text-sm font-semibold transition-colors active:scale-[0.98] ${
              brakeInput > 0
                ? 'border-[#E63946] bg-[#E63946]/25 text-white'
                : 'border-slate-700/90 bg-[#151B24]/90 text-slate-200 hover:border-slate-500'
            }`}
          >
            <span className="font-display text-base">Frenar</span>
            <span className="mt-0.5 font-mono text-[11px] text-slate-400">
              S / ↓
            </span>
          </button>

          <button
            type="button"
            onPointerDown={() => setPointerThrottle(true)}
            onPointerUp={() => setPointerThrottle(false)}
            onPointerLeave={() => setPointerThrottle(false)}
            onPointerCancel={() => setPointerThrottle(false)}
            className={`flex h-20 w-34 flex-col items-center justify-center rounded-md border text-sm font-semibold transition-colors active:scale-[0.98] ${
              throttleInput > 0.05
                ? 'border-[#2F81F7] bg-[#2F81F7]/25 text-white'
                : 'border-slate-700/90 bg-[#151B24]/90 text-slate-200 hover:border-slate-500'
            }`}
          >
            <span className="font-display text-base">Acelerar</span>
            <span className="mt-0.5 font-mono text-[11px] text-slate-400">
              W / ↑ / Espacio
            </span>
          </button>

          <button
            type="button"
            onClick={triggerOverVolt}
            disabled={!isOverVoltReady && !overVoltActive}
            title="Descarga condensador OverVolt 18V (+28% aceleración y +14% punta durante 2.5 s) [Tecla B]"
            className={`flex h-20 w-28 flex-col items-center justify-center rounded-md border text-xs font-bold transition-all active:scale-[0.98] ${
              overVoltActive
                ? 'border-cyan-300 bg-cyan-500/35 text-white shadow-[0_0_20px_rgba(56,189,248,0.45)]'
                : isOverVoltReady
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
                  : 'border-slate-800 bg-[#151B24]/75 text-slate-500'
            }`}
          >
            <span className="font-display text-sm">
              ⚡ {overVoltActive ? '18V ON' : 'OverVolt'}
            </span>
            <span className="mt-0.5 font-mono text-[11px] tabular-nums">
              {overVoltActive ? 'DESCARGA' : `${overVoltPercent}% [B]`}
            </span>
          </button>
        </div>

        <section
          aria-label="Telemetría física en tiempo real"
          className={`pointer-events-auto w-full sm:w-[465px] rounded-md border bg-[#151B24]/92 p-4 backdrop-blur-md transition-colors ${
            isDerailed || guideStressRatio > 0.65
              ? 'border-[#E63946]'
              : overVoltActive
                ? 'border-cyan-400'
                : isDrifting
                  ? 'border-[#F59E0B]/80'
                  : 'border-slate-800'
          }`}
        >
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Velocidad actual</span>
                {slipstreamActive && (
                  <span className="rounded-xs bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                    ⚡ REBUFO +12%
                  </span>
                )}
                {weatherMode === 'rain' && (
                  <span className="rounded-xs bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300">
                    {activeTireId === 'tir_wet_rain'
                      ? '🌧️ Wet-Pro 96%'
                      : '🌧️ Pista Mojada 78%'}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-4xl font-bold tracking-tight tabular-nums text-[#F0F4F8]">
                  {Math.round(speedKmh)}
                </span>
                <span className="font-display text-sm font-medium text-slate-400">
                  km/h
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  / {Math.round(maxSpeedKmh)} máx
                </span>
              </div>
            </div>

            <div className="flex gap-4 text-right">
              <div>
                <span className="block text-xs text-slate-400">Pendiente</span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    slopePercent < -6
                      ? 'text-[#F59E0B]'
                      : slopePercent > 6
                        ? 'text-emerald-400'
                        : 'text-slate-300'
                  }`}
                >
                  {slopeLabel}
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-400">
                  Radio carril
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                  {radiusDisplay}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-xs bg-slate-800/90">
            <div
              className={`h-full transition-[width] duration-75 ${
                overVoltActive ? 'bg-cyan-400' : 'bg-slate-300'
              }`}
              style={{ width: `${speedBarWidth}%` }}
            />
          </div>

          {/* Barra de carga del Condensador OverVolt 18V (Derrape + Rebufo) */}
          <div className="mt-2 flex items-center gap-2.5">
            <span className="shrink-0 font-mono text-[10px] text-cyan-300">
              Condensador 18V [B]
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-xs bg-slate-800/90">
              <div
                className={`h-full transition-[width] duration-75 ${
                  overVoltActive || isOverVoltReady
                    ? 'bg-cyan-400'
                    : 'bg-cyan-600/80'
                }`}
                style={{ width: `${overVoltActive ? 100 : overVoltPercent}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[10px] tabular-nums text-cyan-200">
              {overVoltActive ? 'ACTIVO' : `${overVoltPercent}%`}
            </span>
          </div>

          <div className="my-3 h-px bg-slate-800" />

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-300">
                Fuerza centrífuga vs. Grip dinámico
              </span>
              <span
                className={`text-xs font-semibold ${
                  isDerailed || guideStressRatio > 0.65
                    ? 'text-[#E63946]'
                    : isDrifting
                      ? 'text-[#F59E0B]'
                      : 'text-[#2F81F7]'
                }`}
              >
                {gripStatusLabel}
              </span>
            </div>

            <div className="relative mt-2 h-4 w-full overflow-hidden rounded-xs border border-slate-700/80 bg-[#0D1117]">
              <div
                className="absolute inset-y-0 right-0 bg-[#F59E0B]/10"
                style={{ left: `${driftStartMarkerLeft}%` }}
              />
              <div
                className={`relative h-full transition-[width] duration-75 ${gripBarColor}`}
                style={{ width: `${clampedGripBarWidth}%` }}
              />
              <div
                className="absolute inset-y-0 w-px bg-[#F59E0B]/70"
                style={{ left: `${driftStartMarkerLeft}%` }}
                title="85% Inicio de derrape sobre guía"
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-[#E63946]"
                style={{ left: `${nominalGripMarkerLeft}%` }}
                title="100% Grip nominal"
              />
            </div>

            <div className="mt-2 flex items-center gap-2.5">
              <span className="shrink-0 text-[11px] text-slate-400">
                Límite de guía
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-xs bg-slate-800/90">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    guideStressRatio > 0.65 ? 'bg-[#E63946]' : 'bg-[#F59E0B]'
                  }`}
                  style={{ width: `${guideStressWidth}%` }}
                />
              </div>
              <span className="w-9 text-right font-mono text-[11px] tabular-nums text-slate-400">
                {Math.round(guideStressWidth)}%
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between font-mono text-xs tabular-nums">
              <div>
                <span className="text-slate-400">Centrífuga: </span>
                <span className="font-semibold text-[#F0F4F8]">
                  {Math.round(centrifugalForce)} N
                </span>
                <span className="ml-1.5 text-slate-500">
                  ({Math.round(gripUsageRatio * 100)}%)
                </span>
              </div>

              <div>
                <span className="text-slate-400">Grip (base+aero): </span>
                <span className="font-semibold text-[#2F81F7]">
                  {Math.round(gripAvailable)} N
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default TelemetryUI;
