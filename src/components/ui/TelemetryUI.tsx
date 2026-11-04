'use client';

import React, { useEffect, useState } from 'react';
import { CUP_BOSS_BY_TRACK } from '@/components/canvas/RivalCar';
import { GaragePanel } from '@/components/ui/GaragePanel';
import { setPointerBrake, setPointerThrottle } from '@/hooks/useControls';
import { CIRCUITS } from '@/lib/montmeloSpline';
import { soundEngine } from '@/lib/soundEngine';
import {
  CHAMPIONSHIP_TRACK_ORDER,
  LICENSE_CHALLENGES,
  useGarageStore,
  useTelemetryStore,
} from '@/store/store';
import type {
  LapMedalGrade,
  LicenseMedalGrade,
  SectorColor,
  TrackId,
} from '@/types/types';

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

function getTireTempClasses(tempC: number): string {
  if (tempC < 65) {
    return 'border-sky-400/70 bg-sky-500/20 text-sky-200';
  }
  if (tempC <= 98) {
    return 'border-emerald-400/80 bg-emerald-500/20 text-emerald-200';
  }
  if (tempC <= 108) {
    return 'border-amber-400/80 bg-amber-500/25 text-amber-200';
  }
  return 'border-[#E63946] bg-[#E63946]/30 text-red-100';
}

function getLicenseMedalEmoji(medal: LicenseMedalGrade): string {
  switch (medal) {
    case 'gold':
      return '🥇';
    case 'silver':
      return '🥈';
    case 'bronze':
      return '🥉';
    default:
      return '·';
  }
}

const SHIFT_LIGHT_COUNT = 12;

/**
 * HUD Motorsport v3.2:
 * - Selector de los 5 Modos Single-Player: Contrarreloj, Duelo 1vs1, Gran Premio (4 Coches), Escuela de Licencias y Campeonato FIA.
 * - Tabla de clasificación en vivo P1-P4 con distancias y carril de cada rival.
 * - Semáforo F1 de 5 Focos (Rojo 1..5 -> ¡VERDE SALIDA!) + Cuadro digital GT3/F1.
 */
export function TelemetryUI() {
  const trackId = useTelemetryStore((s) => s.trackId);
  const playerLane = useTelemetryStore((s) => s.playerLane);
  const ghostEnabled = useTelemetryStore((s) => s.ghostEnabled);
  const assistEnabled = useTelemetryStore((s) => s.assistEnabled);
  const soundEnabled = useTelemetryStore((s) => s.soundEnabled);
  const cameraMode = useTelemetryStore((s) => s.cameraMode);
  const environmentStyle = useTelemetryStore((s) => s.environmentStyle);
  const weatherMode = useTelemetryStore((s) => s.weatherMode);
  const magnetMode = useTelemetryStore((s) => s.magnetMode);
  const tireTempsC = useTelemetryStore((s) => s.tireTempsC);
  const tireThermalGripFactor = useTelemetryStore(
    (s) => s.tireThermalGripFactor
  );

  const raceMode = useTelemetryStore((s) => s.raceMode);
  const totalCarsInRace = useTelemetryStore((s) => s.totalCarsInRace);
  const liveGridStandings = useTelemetryStore((s) => s.liveGridStandings);
  const cupStartPhase = useTelemetryStore((s) => s.cupStartPhase);
  const countdownLights = useTelemetryStore((s) => s.countdownLights);
  const cupTargetLaps = useTelemetryStore((s) => s.cupTargetLaps);
  const cupRewardGp = useTelemetryStore((s) => s.cupRewardGp);

  const activeLicenseId = useTelemetryStore((s) => s.activeLicenseId);
  const licenseProgress = useTelemetryStore((s) => s.licenseProgress);
  const lastLicenseResult = useTelemetryStore((s) => s.lastLicenseResult);
  const championshipRoundIndex = useTelemetryStore(
    (s) => s.championshipRoundIndex
  );
  const championshipCompleted = useTelemetryStore(
    (s) => s.championshipCompleted
  );
  const championshipStandings = useTelemetryStore(
    (s) => s.championshipStandings
  );

  const speedKmh = useTelemetryStore((s) => s.speedKmh);
  const gear = useTelemetryStore((s) => s.gear);
  const engineRpm = useTelemetryStore((s) => s.engineRpm);
  const lateralG = useTelemetryStore((s) => s.lateralG);
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
  const turboStartActive = useTelemetryStore((s) => s.turboStartActive);
  const gapToRivalM = useTelemetryStore((s) => s.gapToRivalM);
  const playerRacePosition = useTelemetryStore((s) => s.playerRacePosition);

  const setTrackId = useTelemetryStore((s) => s.setTrackId);
  const setRaceMode = useTelemetryStore((s) => s.setRaceMode);
  const selectLicenseChallenge = useTelemetryStore(
    (s) => s.selectLicenseChallenge
  );
  const advanceChampionshipRound = useTelemetryStore(
    (s) => s.advanceChampionshipRound
  );
  const restartChampionship = useTelemetryStore((s) => s.restartChampionship);
  const toggleMagnetMode = useTelemetryStore((s) => s.toggleMagnetMode);
  const toggleWeatherMode = useTelemetryStore((s) => s.toggleWeatherMode);
  const togglePlayerLane = useTelemetryStore((s) => s.togglePlayerLane);
  const toggleGhost = useTelemetryStore((s) => s.toggleGhost);
  const toggleAssist = useTelemetryStore((s) => s.toggleAssist);
  const toggleSound = useTelemetryStore((s) => s.toggleSound);
  const toggleCameraMode = useTelemetryStore((s) => s.toggleCameraMode);
  const toggleEnvironmentStyle = useTelemetryStore(
    (s) => s.toggleEnvironmentStyle
  );
  const requestTrackReset = useTelemetryStore((s) => s.requestTrackReset);

  const maxSpeedKmh = useGarageStore((s) => s.carStats.MaxSpeed);
  const maxRpm = useGarageStore((s) => s.carStats.maxRpm);
  const driftCeilingRatio = useGarageStore((s) => s.carStats.DriftCeilingRatio);
  const activeTireId = useGarageStore((s) => s.loadout.tiresId);

  const boss = CUP_BOSS_BY_TRACK[trackId];
  const activeLicense =
    LICENSE_CHALLENGES.find((c) => c.id === activeLicenseId) ??
    LICENSE_CHALLENGES[0];
  const isAiRaceMode =
    raceMode === 'vs-ai' ||
    raceMode === 'grand-prix' ||
    raceMode === 'championship';

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
    cupStartPhase === 'racing' &&
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

  const rpmFraction =
    maxRpm > 1800
      ? Math.max(0, Math.min(1, (engineRpm - 1800) / (maxRpm - 1800)))
      : 0;
  const activeShiftLeds = Math.round(rpmFraction * SHIFT_LIGHT_COUNT);
  const isRedline = rpmFraction >= 0.92;

  const gripBarColor =
    isDerailed || gripUsageRatio >= 1.05
      ? 'bg-[#E63946]'
      : isDrifting || gripUsageRatio >= 0.85
        ? 'bg-[#F59E0B]'
        : 'bg-[#2F81F7]';

  const gripStatusLabel = isDerailed
    ? 'Fuera de carril'
    : isDrifting
      ? `Deslizamiento · ${Math.round(driftAngleDeg)}°`
      : gripUsageRatio >= 0.7
        ? 'Apoyo fuerte en curva'
        : 'Tracción óptima';

  const radiusDisplay =
    !Number.isFinite(curvatureRadius) || curvatureRadius > 260
      ? 'Recta'
      : `${curvatureRadius.toFixed(1)} m`;

  const slopeLabel =
    Math.abs(slopePercent) < 1.2
      ? '0%'
      : `${slopePercent > 0 ? '+' : ''}${Math.round(slopePercent)}%`;

  const gapDisplay = `${gapToRivalM >= 0 ? '+' : ''}${gapToRivalM.toFixed(1)} m`;

  const cameraLabel =
    cameraMode === 'chase'
      ? 'Cámara: GT Baja [C]'
      : cameraMode === 'cockpit'
        ? 'Cámara: Capó [C]'
        : 'Cámara: Cenital [C]';

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* HEADER UNIFICADO: 5 Modos Single-Player + Selector Contextual (Circuitos / Licencias / Campeonato) + Crono | Controles + Garaje */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-[#151B24]/92 px-3.5 py-2 backdrop-blur-md">
            {/* Selector principal de los 5 Modos de Juego */}
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1 rounded-xs border border-slate-700/80 bg-[#0D1117] p-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    setRaceMode('time-trial');
                  }}
                  className={`rounded-xs px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                    raceMode === 'time-trial'
                      ? 'bg-[#2F81F7] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⏱️ Contrarreloj
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    setRaceMode('vs-ai');
                  }}
                  className={`rounded-xs px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                    raceMode === 'vs-ai'
                      ? 'bg-[#E63946] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🏁 Duelo 1vs1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    setRaceMode('grand-prix');
                  }}
                  className={`rounded-xs px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                    raceMode === 'grand-prix'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🏎️ Gran Premio (4)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    setRaceMode('license-school');
                  }}
                  className={`rounded-xs px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                    raceMode === 'license-school'
                      ? 'bg-purple-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🎓 Licencias FIA
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    setRaceMode('championship');
                  }}
                  className={`rounded-xs px-2.5 py-1 font-display text-xs font-bold transition-colors ${
                    raceMode === 'championship'
                      ? 'bg-[#F59E0B] text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🏆 Campeonato
                </button>
              </div>

              {/* Sub-barra contextual según Modo de Juego */}
              {raceMode === 'license-school' ? (
                <div className="flex flex-wrap items-center gap-1">
                  {LICENSE_CHALLENGES.map((lic) => {
                    const active = lic.id === activeLicense.id;
                    const rec = licenseProgress[lic.id];
                    return (
                      <button
                        key={lic.id}
                        type="button"
                        onClick={() => {
                          soundEngine.unlock();
                          selectLicenseChallenge(lic.id);
                        }}
                        title={`${lic.code}: ${lic.title} (${lic.subtitle})`}
                        className={`rounded-xs px-2 py-0.5 font-mono text-[11px] font-bold transition-colors ${
                          active
                            ? 'bg-purple-400 text-slate-950'
                            : 'bg-[#0D1117]/80 text-slate-300 hover:text-white'
                        }`}
                      >
                        {lic.code} {getLicenseMedalEmoji(rec?.medal ?? 'none')}
                      </button>
                    );
                  })}
                  <span className="ml-1.5 font-mono text-[10px] text-purple-200">
                    🥇 {(activeLicense.goldMs / 1000).toFixed(2)}s · 🥈{' '}
                    {(activeLicense.silverMs / 1000).toFixed(2)}s · 🥉{' '}
                    {(activeLicense.bronzeMs / 1000).toFixed(2)}s
                  </span>
                </div>
              ) : raceMode === 'championship' ? (
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  {CHAMPIONSHIP_TRACK_ORDER.map((tId, idx) => {
                    const isCurrent = idx === championshipRoundIndex;
                    const isPast = idx < championshipRoundIndex;
                    return (
                      <span
                        key={tId}
                        className={`rounded-xs px-2 py-0.5 font-bold ${
                          isCurrent
                            ? 'bg-[#F59E0B] text-slate-950'
                            : isPast
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-[#0D1117]/80 text-slate-400'
                        }`}
                      >
                        R{idx + 1}: {CIRCUITS[tId].name}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
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
                        className={`rounded-xs px-2 py-0.5 font-display text-[11px] font-bold transition-colors ${
                          active
                            ? 'bg-slate-200 text-slate-950'
                            : 'bg-[#0D1117]/80 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {CIRCUITS[id].name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="hidden h-12 w-px bg-slate-800 sm:block" />

            {/* Cronometraje oficial + Posición + Sectores F1 */}
            <div>
              <div className="flex gap-3.5 font-mono text-xs tabular-nums">
                {isAiRaceMode && (
                  <div>
                    <span className="block text-[10px] text-slate-400">
                      Posición
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        playerRacePosition === 1
                          ? 'text-emerald-400'
                          : 'text-[#F59E0B]'
                      }`}
                    >
                      P{playerRacePosition} / {totalCarsInRace}
                    </span>
                  </div>
                )}
                <div>
                  <span className="block text-[10px] text-slate-400">
                    Vuelta
                  </span>
                  <span className="text-sm font-semibold text-[#F0F4F8]">
                    {raceMode === 'time-trial'
                      ? lapCount
                      : `${Math.min(lapCount, cupTargetLaps)}/${cupTargetLaps}`}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">
                    Crono
                  </span>
                  <span className="text-sm font-semibold text-[#F0F4F8]">
                    {formatLapTime(currentLapTimeMs)}
                  </span>
                </div>
                {isAiRaceMode ? (
                  <div>
                    <span className="block text-[10px] text-slate-400">
                      Gap Líder
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
                  <span className="block text-[10px] text-slate-400">
                    {raceMode === 'license-school' ? 'Oro FIA' : 'Récord'}
                  </span>
                  <span className="text-sm font-bold text-[#F59E0B]">
                    {raceMode === 'license-school'
                      ? formatLapTime(activeLicense.goldMs)
                      : bestLapTimeMs !== null
                        ? formatLapTime(bestLapTimeMs)
                        : '--:--.---'}
                  </span>
                </div>
              </div>

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

          {/* Tabla en vivo de Parrilla (P1-P4) con Carril de cada coche para planificar Rebufo y Adelantamientos */}
          {isAiRaceMode && liveGridStandings.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-[#0D1117]/90 px-3 py-1.5 font-mono text-[11px] tabular-nums backdrop-blur-md">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Parrilla:
              </span>
              {liveGridStandings.map((row) => (
                <div
                  key={row.driverId}
                  className={`flex items-center gap-1.5 rounded-xs border px-2 py-0.5 ${
                    row.isPlayer
                      ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-100 font-bold'
                      : 'border-slate-800 bg-[#151B24] text-slate-300'
                  }`}
                >
                  <span className="text-amber-300 font-bold">
                    P{row.position}
                  </span>
                  <span>{row.name.split(' · ')[0]}</span>
                  <span className="rounded-xs bg-slate-800 px-1 text-[9px] text-slate-300">
                    {row.lane === 'left' ? 'IZQ' : 'DER'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {row.position === 1
                      ? 'LÍDER'
                      : `-${row.gapToLeaderM.toFixed(1)}m`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bloque Derecho: Controles de Pista + Salida Semáforo + Garaje Pro */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-[#151B24]/90 p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                requestTrackReset();
              }}
              title="Volver a la parrilla de salida y activar el Semáforo F1 (o reencarrilar si saliste de pista) [Tecla R]"
              className="rounded-xs border border-amber-500/60 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/25"
            >
              {isDerailed && raceMode !== 'license-school'
                ? 'Reencarrilar [R]'
                : '🚦 Salida Semáforo [R]'}
            </button>

            <button
              type="button"
              onClick={toggleCameraMode}
              className="rounded-xs border border-slate-700/70 bg-[#0D1117]/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#2F81F7]"
            >
              {cameraLabel}
            </button>

            <button
              type="button"
              onClick={toggleMagnetMode}
              title="Alternar entre Imán Neodimio GT (pegado al raíl) y Modo Wood Sin Imán (derrapes largos y progresivos de costado) [Tecla I]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                magnetMode === 'wood-free'
                  ? 'border-[#F59E0B]/80 bg-[#F59E0B]/20 text-amber-200'
                  : 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300'
              }`}
            >
              {magnetMode === 'gt-magnet'
                ? '🧲 Imán GT [I]'
                : '🪵 Sin Imán (Wood) [I]'}
            </button>

            <button
              type="button"
              onClick={toggleWeatherMode}
              title="Cambiar entre Asfalto Seco y Lluvia [Tecla V]"
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                weatherMode === 'rain'
                  ? 'border-sky-400/80 bg-sky-500/25 text-sky-100'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-200 hover:border-[#2F81F7]'
              }`}
            >
              {weatherMode === 'rain' ? '🌧️ Lluvia [V]' : '☀️ Seco [V]'}
            </button>

            <button
              type="button"
              onClick={toggleAssist}
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                assistEnabled
                  ? 'border-[#2F81F7]/70 bg-[#2F81F7]/20 text-[#F0F4F8]'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              Trazada: {assistEnabled ? 'ON' : 'OFF'} [H]
            </button>

            <button
              type="button"
              onClick={toggleGhost}
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
              className="rounded-xs border border-slate-700/70 bg-[#0D1117]/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#2F81F7]"
            >
              Carril: {playerLane === 'left' ? 'Izq' : 'Der'} [L]
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                toggleSound();
              }}
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
              className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                environmentStyle === 'tabletop'
                  ? 'border-[#F59E0B]/70 bg-[#F59E0B]/20 text-amber-100'
                  : 'border-slate-700/70 bg-[#0D1117]/70 text-slate-200 hover:border-[#2F81F7]'
              }`}
            >
              {environmentStyle === 'realistic' ? 'Circuito [E]' : 'Salón [E]'}
            </button>
          </div>

          <GaragePanel />
        </div>
      </header>

      {/* ZONA CENTRAL: SEMÁFORO OFICIAL F1 (5 Focos Rojos -> ¡VERDE SALIDA!), Modales de Final de Carrera / Licencias / Campeonato */}
      <div className="mx-auto flex flex-col items-center gap-2">
        {(cupStartPhase === 'countdown' || cupStartPhase === 'green') && (
          <div className="rounded-md border-2 border-slate-700 bg-[#0D1117]/95 px-7 py-4 text-center shadow-2xl backdrop-blur-md">
            <span className="font-mono text-[11px] font-bold tracking-wider text-slate-300 uppercase">
              {raceMode === 'license-school'
                ? `🎓 LICENCIA FIA ${activeLicense.code} · ${activeLicense.title} (${activeLicense.subtitle})`
                : raceMode === 'championship'
                  ? `🏆 CAMPEONATO FIA · RONDA ${championshipRoundIndex + 1}/3 · ${CIRCUITS[trackId].name} (Parrilla 4 Coches)`
                  : raceMode === 'grand-prix'
                    ? `🏎️ GRAN PREMIO 4 COCHES · ${CIRCUITS[trackId].name} · 3 Vueltas`
                    : raceMode === 'vs-ai'
                      ? `🏁 DUELO 1vs1 · ${boss.cupTitle} vs ${boss.name}`
                      : `⏱️ CONTRARRELOJ · ${CIRCUITS[trackId].name}`}
            </span>

            {/* 5 Focos del Semáforo F1 */}
            <div className="my-3 flex items-center justify-center gap-3.5">
              {([1, 2, 3, 4, 5] as const).map((idx) => {
                const isRedLit =
                  cupStartPhase === 'countdown' && countdownLights >= idx;
                const isGreenLit = cupStartPhase === 'green';
                return (
                  <div
                    key={idx}
                    className={`h-10 w-10 rounded-full border-2 transition-all duration-150 ${
                      isGreenLit
                        ? 'border-emerald-200 bg-emerald-500 shadow-[0_0_24px_#10B981]'
                        : isRedLit
                          ? 'border-red-300 bg-[#FF1E38] shadow-[0_0_22px_#FF1E38]'
                          : 'border-slate-700 bg-slate-900'
                    }`}
                  />
                );
              })}
            </div>

            <p className="font-display text-sm font-bold">
              {cupStartPhase === 'green' ? (
                <span className="text-emerald-400">
                  ¡VERDE! ¡SALIDA LANZADA!
                  {turboStartActive ? ' · ⚡ LAUNCH CONTROL ACTIVO' : ''}
                </span>
              ) : (
                <span className="text-slate-300">
                  Parrilla de Salida ({countdownLights}/5) · Mantén{' '}
                  <strong className="text-white">W / Espacio</strong> para
                  revolucionar el motor
                </span>
              )}
            </p>
          </div>
        )}

        {/* Modal de Final de Examen en Escuela de Licencias FIA */}
        {raceMode === 'license-school' &&
          cupStartPhase === 'finished' &&
          lastLicenseResult && (
            <div className="pointer-events-auto max-w-md rounded-md border-2 border-purple-400 bg-[#151B24]/97 px-6 py-4 text-center shadow-2xl backdrop-blur-md">
              <span className="inline-block rounded-xs bg-purple-500 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                🎓 LICENCIA FIA {activeLicense.code} · {activeLicense.title}
              </span>
              <p className="mt-2 font-display text-xl font-bold text-[#F0F4F8]">
                {lastLicenseResult.failedByDerail
                  ? '❌ PRUEBA SUSPENDIDA (SALIDA DE CARRIL)'
                  : lastLicenseResult.medal === 'gold'
                    ? '🥇 ¡MEDALLA DE ORO FIA!'
                    : lastLicenseResult.medal === 'silver'
                      ? '🥈 ¡MEDALLA DE PLATA FIA!'
                      : lastLicenseResult.medal === 'bronze'
                        ? '🥉 ¡MEDALLA DE BRONCE FIA!'
                        : '⏱️ FUERA DE TIEMPO DE MEDALLA'}
              </p>
              {!lastLicenseResult.failedByDerail && (
                <p className="mt-1 font-mono text-lg font-bold text-amber-300 tabular-nums">
                  Tiempo: {formatLapTime(lastLicenseResult.timeMs)}
                </p>
              )}
              <p className="mt-1 font-mono text-xs text-slate-300">
                Objetivos: 🥇 {formatLapTime(activeLicense.goldMs)} · 🥈{' '}
                {formatLapTime(activeLicense.silverMs)} · 🥉{' '}
                {formatLapTime(activeLicense.bronzeMs)}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => selectLicenseChallenge(activeLicense.id)}
                  className="rounded-xs bg-purple-500 px-3.5 py-1.5 font-display text-xs font-bold text-white hover:bg-purple-400"
                >
                  Reintentar Licencia [R]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const curIdx = LICENSE_CHALLENGES.findIndex(
                      (c) => c.id === activeLicense.id
                    );
                    const nextLic =
                      LICENSE_CHALLENGES[
                        (curIdx + 1) % LICENSE_CHALLENGES.length
                      ];
                    selectLicenseChallenge(nextLic.id);
                  }}
                  className="rounded-xs border border-slate-600 bg-[#0D1117] px-3.5 py-1.5 font-display text-xs font-semibold text-slate-200 hover:border-purple-400"
                >
                  Siguiente Licencia →
                </button>
              </div>
            </div>
          )}

        {/* Modal de Final de Carrera en Duelo 1vs1, Gran Premio 4-Grid o Ronda de Campeonato FIA */}
        {isAiRaceMode && cupStartPhase === 'finished' && (
          <div
            className={`pointer-events-auto w-full max-w-lg rounded-md border-2 px-6 py-4 text-center shadow-2xl backdrop-blur-md ${
              playerRacePosition === 1
                ? 'border-emerald-400 bg-[#151B24]/97'
                : 'border-slate-600 bg-[#151B24]/97'
            }`}
          >
            <span
              className={`inline-block rounded-xs px-2.5 py-0.5 font-mono text-xs font-bold ${
                playerRacePosition === 1
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              {raceMode === 'championship'
                ? championshipCompleted
                  ? '🏆 ¡FINAL DEL CAMPEONATO MUNDIAL FIA!'
                  : `🏆 RONDA ${championshipRoundIndex + 1}/3 COMPLETADA · P${playerRacePosition}`
                : playerRacePosition === 1
                  ? '🏆 ¡VICTORIA EN GRAN PREMIO!'
                  : `🏁 ${playerRacePosition}.ª POSICIÓN FINAL (+${cupRewardGp} GP)`}
            </span>

            <p className="mt-2 font-display text-xl font-bold text-[#F0F4F8]">
              {raceMode === 'championship' && championshipCompleted
                ? championshipStandings[0]?.isPlayer
                  ? '¡ERES EL CAMPEÓN DEL MUNDO FIA SLOT!'
                  : `Campeón FIA: ${championshipStandings[0]?.name}`
                : playerRacePosition === 1
                  ? `¡Cruzaste la meta en P1 en ${CIRCUITS[trackId].name}!`
                  : `Finalizaste P${playerRacePosition} de ${totalCarsInRace} coches en pista`}
            </p>

            {/* Tabla de Clasificación de la Carrera o General del Campeonato FIA */}
            <div className="mt-3 rounded-xs border border-slate-800 bg-[#0D1117]/90 p-2.5 text-left font-mono text-xs">
              <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {raceMode === 'championship'
                  ? 'Clasificación General del Campeonato FIA (Puntos 25-18-15-12)'
                  : 'Clasificación Oficial en Meta'}
              </div>
              {raceMode === 'championship'
                ? championshipStandings.map((row, idx) => (
                    <div
                      key={row.driverId}
                      className={`flex items-center justify-between py-1 ${
                        row.isPlayer
                          ? 'text-emerald-300 font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      <span>
                        {idx + 1}.º {row.name}
                      </span>
                      <span>
                        {row.points} PTS ({row.wins}{' '}
                        {row.wins === 1 ? 'victoria' : 'victorias'})
                      </span>
                    </div>
                  ))
                : liveGridStandings.map((row) => (
                    <div
                      key={row.driverId}
                      className={`flex items-center justify-between py-1 ${
                        row.isPlayer
                          ? 'text-emerald-300 font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      <span>
                        P{row.position} · {row.name}
                      </span>
                      <span>
                        {row.position === 1
                          ? 'GANADOR'
                          : `+${row.gapToLeaderM.toFixed(1)} m`}
                      </span>
                    </div>
                  ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
              {raceMode === 'championship' ? (
                !championshipCompleted ? (
                  <button
                    type="button"
                    onClick={advanceChampionshipRound}
                    className="rounded-xs bg-[#F59E0B] px-4 py-1.5 font-display text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    Siguiente Ronda (R{championshipRoundIndex + 2}/3:{' '}
                    {
                      CIRCUITS[
                        CHAMPIONSHIP_TRACK_ORDER[
                          Math.min(2, championshipRoundIndex + 1)
                        ]
                      ].name
                    }
                    ) →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={restartChampionship}
                    className="rounded-xs bg-[#F59E0B] px-4 py-1.5 font-display text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    Iniciar Nuevo Campeonato FIA
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setRaceMode(raceMode)}
                  className="rounded-xs bg-emerald-500 px-3.5 py-1.5 font-display text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Repetir Carrera
                </button>
              )}
              <button
                type="button"
                onClick={() => setRaceMode('time-trial')}
                className="rounded-xs border border-slate-700 bg-[#0D1117] px-3.5 py-1.5 font-display text-xs font-semibold text-slate-300 hover:border-slate-500"
              >
                Ir a Contrarreloj
              </button>
            </div>
          </div>
        )}

        {isDerailed ? (
          <div
            role="alert"
            className="pointer-events-auto max-w-md rounded-md border-2 border-[#E63946] bg-[#151B24]/95 px-5 py-4 text-center shadow-2xl backdrop-blur-md"
          >
            <p className="font-display text-lg font-bold text-[#E63946]">
              Pérdida de tracción en el carril
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-slate-300">
              Carga lateral: {Math.round(lastDerailForce)} N ({lateralG} G) vs{' '}
              {Math.round(gripAvailable)} N de límite de neumático
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Frena antes del vértice para bajar marchas o monta compuestos más
              blandos en el Garaje.
            </p>
          </div>
        ) : showLapMedalBanner && lastLapSummary ? (
          (() => {
            const style = getMedalBannerClasses(lastLapSummary.medal);
            return (
              <div
                className={`max-w-md rounded-md border-2 px-5 py-3 text-center shadow-2xl backdrop-blur-md ${style.border}`}
              >
                {lastLapSummary.isNewBest && (
                  <span className="inline-block rounded-xs bg-cyan-500/25 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-200">
                    NUEVO RÉCORD PERSONAL · FANTASMA ACTUALIZADO
                  </span>
                )}
                <p className="mt-1 font-display text-lg font-bold tracking-wide text-[#F0F4F8]">
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
              Frena y reduce marcha
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
              Modula el gas
            </span>
            {recommendedCornerSpeedKmh !== null && (
              <span className="ml-2 font-mono text-xs tabular-nums text-amber-200">
                Curva de {recommendedCornerSpeedKmh} km/h
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* ZONA INFERIOR: Pedales táctiles + Cuadro Digital GT3/F1 (Shift Lights LED + Marcha + RPM + Fuerzas G) */}
      <div className="flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-end">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onPointerDown={() => setPointerBrake(true)}
            onPointerUp={() => setPointerBrake(false)}
            onPointerLeave={() => setPointerBrake(false)}
            onPointerCancel={() => setPointerBrake(false)}
            className={`flex h-20 w-28 flex-col items-center justify-center rounded-md border text-sm font-semibold transition-colors active:scale-[0.98] ${
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
            className={`flex h-20 w-36 flex-col items-center justify-center rounded-md border text-sm font-semibold transition-colors active:scale-[0.98] ${
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
        </div>

        {/* CUADRO DIGITAL MOTORSPORT GT3 / F1 */}
        <section
          aria-label="Telemetría física en tiempo real"
          className={`pointer-events-auto w-full sm:w-[475px] rounded-md border bg-[#151B24]/94 p-4 backdrop-blur-md transition-colors ${
            isDerailed || guideStressRatio > 0.65
              ? 'border-[#E63946]'
              : isDrifting
                ? 'border-[#F59E0B]/80'
                : 'border-slate-800'
          }`}
        >
          {/* Tira de 12 LEDs de Cambio de Marcha (Shift Lights F1/GT3) */}
          <div className="mb-3 flex items-center justify-between gap-1.5 rounded-xs border border-slate-800/90 bg-[#0D1117] px-2.5 py-1.5">
            {Array.from({ length: SHIFT_LIGHT_COUNT }).map((_, i) => {
              const lit = i < activeShiftLeds;
              const ledColor = !lit
                ? 'bg-slate-800/70'
                : isRedline
                  ? 'bg-cyan-400 shadow-[0_0_8px_#38BDF8]'
                  : i < 5
                    ? 'bg-emerald-400 shadow-[0_0_6px_#10B981]'
                    : i < 9
                      ? 'bg-amber-400 shadow-[0_0_6px_#F59E0B]'
                      : 'bg-[#FF1E38] shadow-[0_0_8px_#FF1E38]';
              return (
                <div
                  key={i}
                  className={`h-2.5 flex-1 rounded-xs transition-colors duration-75 ${ledColor}`}
                />
              );
            })}
          </div>

          {/* Indicador de Marcha (N, 1..6) + Velocímetro + Tacómetro RPM + Fuerzas G */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {/* Caja de Marcha Secuencial */}
              <div
                className={`flex h-14 w-13 flex-col items-center justify-center rounded-xs border font-mono ${
                  isRedline
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-700 bg-[#0D1117] text-[#F0F4F8]'
                }`}
              >
                <span className="text-[9px] tracking-wider text-slate-400 uppercase">
                  Marcha
                </span>
                <span className="text-2xl leading-none font-bold">
                  {gear === 0 ? 'N' : gear}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-slate-300">
                    {engineRpm.toLocaleString('es-ES')} RPM
                  </span>
                  {slipstreamActive && (
                    <span className="rounded-xs bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                      REBUFO
                    </span>
                  )}
                  {weatherMode === 'rain' && (
                    <span className="rounded-xs bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300">
                      {activeTireId === 'tir_wet_rain'
                        ? 'Wet-Pro 96%'
                        : 'Mojado 78%'}
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
                    / {Math.round(maxSpeedKmh)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3.5 text-right font-mono">
              <div>
                <span className="block text-[10px] text-slate-400">
                  Lat. G
                </span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    lateralG > 2.2 ? 'text-[#F59E0B]' : 'text-slate-200'
                  }`}
                >
                  {lateralG.toFixed(2)} G
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">
                  Pendiente
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-300">
                  {slopeLabel}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Radio</span>
                <span className="text-sm font-semibold tabular-nums text-slate-200">
                  {radiusDisplay}
                </span>
              </div>
            </div>
          </div>

          <div className="my-3 h-px bg-slate-800" />

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-300">
                Carga lateral en neumático vs. Límite de adherencia
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
                title="85% Inicio de deslizamiento lateral"
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-[#E63946]"
                style={{ left: `${nominalGripMarkerLeft}%` }}
                title="100% Límite nominal de neumático"
              />
            </div>

            <div className="mt-2 flex items-center gap-2.5">
              <span className="shrink-0 text-[11px] text-slate-400">
                Estrés de guía
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
                <span className="text-slate-400">Fuerza lateral: </span>
                <span className="font-semibold text-[#F0F4F8]">
                  {Math.round(centrifugalForce)} N
                </span>
                <span className="ml-1.5 text-slate-500">
                  ({Math.round(gripUsageRatio * 100)}%)
                </span>
              </div>

              <div>
                <span className="text-slate-400">Grip (mec+aero): </span>
                <span className="font-semibold text-[#2F81F7]">
                  {Math.round(gripAvailable)} N
                </span>
              </div>
            </div>

            {/* Indicador Térmico FIA de las 4 Ruedas (FL, FR, RL, RR) + Estado de Imán */}
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xs border border-slate-800/90 bg-[#0D1117]/80 px-2.5 py-1.5 font-mono text-[11px] tabular-nums">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  Temp. Gomas:
                </span>
                {(
                  [
                    { label: 'DI', temp: tireTempsC[0] },
                    { label: 'DD', temp: tireTempsC[1] },
                    { label: 'TI', temp: tireTempsC[2] },
                    { label: 'TD', temp: tireTempsC[3] },
                  ] as const
                ).map((w) => (
                  <span
                    key={w.label}
                    className={`rounded-xs border px-1.5 py-0.5 text-[10px] font-bold transition-colors ${getTireTempClasses(
                      w.temp
                    )}`}
                    title="Azul (<65°C Frío) · Verde (65-98°C Óptimo) · Ámbar/Rojo (>98°C Sobrecalentado)"
                  >
                    {w.label} {w.temp}°C
                  </span>
                ))}
              </div>
              <span
                className={`text-[10px] font-bold ${
                  tireThermalGripFactor >= 0.99
                    ? 'text-emerald-400'
                    : tireThermalGripFactor < 0.93
                      ? 'text-[#E63946]'
                      : 'text-sky-300'
                }`}
              >
                Grip {Math.round(tireThermalGripFactor * 100)}%
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default TelemetryUI;
