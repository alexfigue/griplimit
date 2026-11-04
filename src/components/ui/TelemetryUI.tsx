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
  const appScreen = useTelemetryStore((s) => s.appScreen);
  const setAppScreen = useTelemetryStore((s) => s.setAppScreen);
  const totalCarsInRace = useTelemetryStore((s) => s.totalCarsInRace);
  const liveGridStandings = useTelemetryStore((s) => s.liveGridStandings);
  const cupStartPhase = useTelemetryStore((s) => s.cupStartPhase);
  const countdownLights = useTelemetryStore((s) => s.countdownLights);
  const cupTargetLaps = useTelemetryStore((s) => s.cupTargetLaps);
  const cupRewardGp = useTelemetryStore((s) => s.cupRewardGp);
  const leaderFinishedTimerSec = useTelemetryStore(
    (s) => s.leaderFinishedTimerSec
  );
  const playerDidNotFinish = useTelemetryStore((s) => s.playerDidNotFinish);
  const bestLapByTrack = useTelemetryStore((s) => s.bestLapByTrack);

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
  const bestSectorsByTrack = useTelemetryStore((s) => s.bestSectorsByTrack);
  const currentSectors = useTelemetryStore((s) => s.currentSectors);
  const lastLapSummary = useTelemetryStore((s) => s.lastLapSummary);
  const lastLapSpeedTrace = useTelemetryStore((s) => s.lastLapSpeedTrace);
  const bestLapSpeedTracesByTrack = useTelemetryStore(
    (s) => s.bestLapSpeedTracesByTrack
  );
  const telemetryPanelOpen = useTelemetryStore((s) => s.telemetryPanelOpen);
  const toggleTelemetryPanel = useTelemetryStore((s) => s.toggleTelemetryPanel);
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
  const activeParts = useGarageStore((s) => s.activeParts);
  const carStats = useGarageStore((s) => s.carStats);
  const isGarageOpen = useGarageStore((s) => s.isGarageOpen);
  const setGarageOpen = useGarageStore((s) => s.setGarageOpen);

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
      ? 'GT Baja [C]'
      : cameraMode === 'cockpit'
        ? 'Capó [C]'
        : 'Cenital [C]';

  const modeTitleLabel =
    raceMode === 'time-trial'
      ? '⏱️ Contrarreloj'
      : raceMode === 'vs-ai'
        ? '🏁 Duelo 1vs1'
        : raceMode === 'grand-prix'
          ? '🏎️ Gran Premio (4)'
          : raceMode === 'license-school'
            ? `🎓 Licencia ${activeLicense.code}`
            : `🏆 Mundial R${championshipRoundIndex + 1}/${CHAMPIONSHIP_TRACK_ORDER.length}`;

  // 1. MODO AISLADO DE GARAJE Y PINTURA 3D (Oculta todo el HUD de carrera para evitar clics accidentales)
  if (isGarageOpen) {
    return <GaragePanel />;
  }

  // 2. MENÚ PRINCIPAL / PADDOCK HUB 3D (Showroom 360° de fondo antes de salir a pista)
  if (appScreen === 'main-menu') {
    return (
      <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between select-none">
        {/* Barra Superior del Paddock Hub */}
        <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-[#0D1117]/92 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="rounded-xs bg-[#E63946] px-2 py-0.5 font-display text-xs font-black tracking-wider text-white uppercase">
              GRIP LIMIT
            </span>
            <div>
              <span className="font-display text-sm font-bold text-[#F0F4F8]">
                FIA Slot Motorsport Simulator 3D
              </span>
              <span className="ml-2 hidden font-mono text-[11px] text-slate-400 sm:inline">
                Paddock Oficial & Showroom 360°
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={toggleWeatherMode}
              className={`rounded-xs border px-2.5 py-1 font-semibold transition-colors ${
                weatherMode === 'rain'
                  ? 'border-sky-400/80 bg-sky-500/20 text-sky-200'
                  : 'border-slate-700 bg-[#151B24] text-slate-200 hover:border-slate-500'
              }`}
            >
              {weatherMode === 'rain' ? '🌧️ Clima: Lluvia' : '☀️ Clima: Seco'}
            </button>
            <button
              type="button"
              onClick={toggleMagnetMode}
              className={`rounded-xs border px-2.5 py-1 font-semibold transition-colors ${
                magnetMode === 'wood-free'
                  ? 'border-[#F59E0B]/80 bg-[#F59E0B]/20 text-amber-200'
                  : 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
              }`}
            >
              {magnetMode === 'gt-magnet'
                ? '🧲 Tracción: Imán GT'
                : '🪵 Tracción: Sin Imán (Wood)'}
            </button>
            <button
              type="button"
              onClick={toggleEnvironmentStyle}
              className="rounded-xs border border-slate-700 bg-[#151B24] px-2.5 py-1 text-slate-200 hover:border-slate-500"
            >
              {environmentStyle === 'realistic'
                ? '🏟️ Entorno: Circuito Real'
                : '🪵 Entorno: Maqueta Salón'}
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                toggleSound();
              }}
              className="rounded-xs border border-slate-700 bg-[#151B24] px-2.5 py-1 text-slate-200 hover:border-slate-500"
            >
              🔊 Audio: {soundEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </header>

        {/* Cuerpo Principal del Paddock Hub: Panel Izquierdo de Competición + Vista 3D Derecha */}
        <div className="flex flex-1 flex-col justify-between gap-4 overflow-y-auto p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-3.5 rounded-md border border-slate-700/90 bg-[#0D1117]/92 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
            {/* Paso 1: Selector de Modo de Juego */}
            <div>
              <span className="font-mono text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
                1. Selecciona Disciplina de Competición
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    {
                      id: 'grand-prix',
                      title: '🏎️ Gran Premio',
                      sub: '4 Coches · 3 Vueltas',
                      activeCls: 'border-emerald-400 bg-emerald-500/20 text-white',
                    },
                    {
                      id: 'championship',
                      title: '🏆 Mundial FIA',
                      sub: '6 Rondas · Podio P1-P3',
                      activeCls: 'border-[#F59E0B] bg-[#F59E0B]/20 text-white',
                    },
                    {
                      id: 'vs-ai',
                      title: '🏁 Duelo 1vs1',
                      sub: 'Contra Jefe de Pista',
                      activeCls: 'border-[#E63946] bg-[#E63946]/20 text-white',
                    },
                    {
                      id: 'license-school',
                      title: '🎓 Licencias FIA',
                      sub: '7 Pruebas Oficiales',
                      activeCls: 'border-purple-400 bg-purple-500/20 text-white',
                    },
                    {
                      id: 'time-trial',
                      title: '⏱️ Contrarreloj',
                      sub: 'Récords + Fantasma',
                      activeCls: 'border-[#2F81F7] bg-[#2F81F7]/20 text-white',
                    },
                  ] as const
                ).map((m) => {
                  const active = raceMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        soundEngine.unlock();
                        setRaceMode(m.id);
                      }}
                      className={`flex flex-col items-start rounded-xs border p-2.5 text-left transition-all ${
                        active
                          ? m.activeCls
                          : 'border-slate-800 bg-[#151B24]/90 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className="font-display text-xs font-bold">
                        {m.title}
                      </span>
                      <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {m.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paso 2: Selector de Circuito / Prueba de Licencia / Calendario del Mundial */}
            <div>
              <span className="font-mono text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
                {raceMode === 'license-school'
                  ? '2. Selecciona Examen de Licencia FIA (1 Vuelta Sin Salidas de Carril)'
                  : raceMode === 'championship'
                    ? `2. Calendario Oficial del Campeonato Mundial FIA (Ronda Actual: R${championshipRoundIndex + 1}/${CHAMPIONSHIP_TRACK_ORDER.length})`
                    : '2. Selecciona Circuito Oficial 3D'}
              </span>

              {raceMode === 'license-school' ? (
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
                        className={`flex items-center justify-between rounded-xs border px-3 py-2 text-left transition-colors ${
                          active
                            ? 'border-purple-400 bg-purple-500/20 text-white'
                            : 'border-slate-800 bg-[#151B24]/85 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div>
                          <span className="font-mono text-xs font-bold text-purple-300">
                            [{lic.code}]
                          </span>{' '}
                          <span className="font-display text-xs font-bold">
                            {lic.title}
                          </span>
                          <span className="block font-mono text-[10px] text-slate-400">
                            {CIRCUITS[lic.trackId].name} · Oro:{' '}
                            {(lic.goldMs / 1000).toFixed(2)}s
                          </span>
                        </div>
                        <span className="text-base">
                          {getLicenseMedalEmoji(rec?.medal ?? 'none')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : raceMode === 'championship' ? (
                <div className="mt-1.5 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {CHAMPIONSHIP_TRACK_ORDER.map((tId, idx) => {
                      const isCurrent = idx === championshipRoundIndex;
                      const isPast = idx < championshipRoundIndex;
                      return (
                        <div
                          key={tId}
                          className={`rounded-xs border px-2.5 py-2 font-mono text-xs ${
                            isCurrent
                              ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-white font-bold'
                              : isPast
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-slate-800 bg-[#151B24]/60 text-slate-400'
                          }`}
                        >
                          <span className="block text-[10px] uppercase">
                            Ronda {idx + 1}{' '}
                            {isCurrent ? '· ACTUAL' : isPast ? '· ✓' : ''}
                          </span>
                          <span className="font-display text-xs font-bold">
                            {CIRCUITS[tId].name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between rounded-xs border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-mono text-[11px] text-amber-200">
                    <span>
                      ⚠️ Regla FIA: Debes terminar en el Podio (P1–P3) dentro de los 30s tras el líder para avanzar de ronda.
                    </span>
                    <button
                      type="button"
                      onClick={restartChampionship}
                      className="shrink-0 rounded-xs border border-amber-400/50 bg-[#0D1117] px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:border-amber-300"
                    >
                      Reiniciar Mundial
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(CIRCUITS) as TrackId[]).map((id) => {
                    const active = id === trackId;
                    const recMs = bestLapByTrack[id];
                    const circuitBoss = CUP_BOSS_BY_TRACK[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          soundEngine.unlock();
                          setTrackId(id);
                        }}
                        className={`flex flex-col items-start rounded-xs border p-2.5 text-left transition-all ${
                          active
                            ? 'border-cyan-400 bg-cyan-500/15 text-white shadow-md'
                            : 'border-slate-800 bg-[#151B24]/85 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <span className="font-display text-xs font-bold">
                          {CIRCUITS[id].name}
                        </span>
                        <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {raceMode === 'vs-ai'
                            ? `Rival: ${circuitBoss.name.split(' · ')[0]}`
                            : `Oro: ${(CIRCUITS[id].goldTargetMs / 1000).toFixed(1)}s`}
                        </span>
                        <span className="mt-1 font-mono text-[10px] font-semibold text-[#F59E0B]">
                          Récord: {recMs ? formatLapTime(recMs) : '--:--.---'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paso 3: Botones Principales de Acción (Garaje 3D y Salir a Pista) */}
            <div className="mt-1 flex flex-col gap-2.5 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  setGarageOpen(true);
                }}
                className="flex items-center justify-center gap-2 rounded-md border border-[#2F81F7] bg-[#151B24] px-4 py-3 font-display text-xs font-bold text-[#F0F4F8] transition-colors hover:bg-[#2F81F7]/20"
              >
                🔧 GARAJE, REGLAJE & PINTURA 3D ({activeParts.body.name})
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  setAppScreen('racing');
                }}
                className="flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-6 py-3 font-display text-sm font-black tracking-wide text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.4)] transition-all hover:bg-emerald-400"
              >
                🏁 SALIR A PISTA →
              </button>
            </div>
          </div>

          {/* Tarjeta Derecha de Ficha Técnica del Coche en Showroom 360° */}
          <div className="pointer-events-auto hidden w-80 flex-col gap-2 rounded-md border border-slate-800/90 bg-[#0D1117]/88 p-4 font-mono text-xs backdrop-blur-md lg:flex">
            <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
              🎥 Vehículo Equipado en Showroom
            </span>
            <h3 className="font-display text-base font-extrabold text-white">
              {activeParts.body.name}
            </h3>
            <div className="my-1 h-px bg-slate-800" />
            <div className="flex justify-between">
              <span className="text-slate-400">Velocidad Punta:</span>
              <span className="font-bold text-white">{carStats.MaxSpeed} km/h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Aceleración:</span>
              <span className="font-bold text-white">
                {carStats.Acceleration} m/s²
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Peso Total:</span>
              <span className="font-bold text-white">
                {carStats.TotalWeight} kg
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Agarre Base:</span>
              <span className="font-bold text-[#2F81F7]">
                {Math.round(carStats.TotalGrip)} N
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Motor:</span>
              <span className="text-slate-200">{activeParts.engine.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Compuesto:</span>
              <span className="text-slate-200">{activeParts.tires.name}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. PANTALLA EN CARRERA (HUD Broadcast con una única Barra Superior limpia arriba del todo)
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between select-none">
      {/* BARRA SUPERIOR BROADCAST ÚNICA (Arriba del todo, de extremo a extremo, sin dobles filas desalineadas) */}
      <div className="flex flex-col items-center">
        <header className="pointer-events-auto flex w-full flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 bg-[#0D1117]/94 px-3 py-1.5 backdrop-blur-md">
          {/* Izquierda: Botón Menú Principal + Modo/Circuito + Parrilla P1-P4 Compacta */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundEngine.silenceAll();
                setAppScreen('main-menu');
              }}
              className="rounded-xs border border-slate-700 bg-[#151B24] px-2.5 py-1 font-display text-xs font-bold text-slate-100 transition-colors hover:border-cyan-400 hover:text-cyan-300"
            >
              ☰ Menú
            </button>

            <div className="flex items-center gap-1.5 rounded-xs border border-slate-800 bg-[#151B24] px-2.5 py-1 font-display text-xs font-bold text-slate-200">
              <span>{modeTitleLabel}</span>
              <span className="text-slate-600">·</span>
              <span className="text-cyan-300">{CIRCUITS[trackId].name}</span>
            </div>

            {isAiRaceMode && liveGridStandings.length > 0 && (
              <div className="hidden items-center gap-1 font-mono text-[11px] tabular-nums xl:flex">
                {liveGridStandings.map((row) => (
                  <span
                    key={row.driverId}
                    className={`rounded-xs border px-1.5 py-0.5 ${
                      row.isPlayer
                        ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-100 font-bold'
                        : 'border-slate-800 bg-[#151B24] text-slate-300'
                    }`}
                  >
                    <strong className="text-amber-300">P{row.position}</strong>{' '}
                    {row.name.split(' · ')[0]}{' '}
                    <span className="text-[10px] text-slate-400">
                      {row.position === 1
                        ? 'LÍDER'
                        : `-${row.gapToLeaderM.toFixed(0)}m`}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Centro: Cronometraje Oficial + Sectores S1/S2/S3 + Cuenta Atrás de 30s si el Líder cruzó meta */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
            {leaderFinishedTimerSec !== null &&
              cupStartPhase !== 'finished' && (
                <span className="animate-pulse rounded-xs border border-[#E63946] bg-[#E63946]/30 px-2.5 py-1 font-mono text-xs font-black text-red-100 shadow-[0_0_14px_rgba(230,57,70,0.5)]">
                  🏁 LÍDER EN META · TIEMPO LÍMITE:{' '}
                  {leaderFinishedTimerSec.toFixed(1)}s
                </span>
              )}

            {isAiRaceMode && (
              <div className="flex items-baseline gap-1">
                <span className="text-[10px] text-slate-400">POS</span>
                <span
                  className={`text-sm font-bold ${
                    playerRacePosition <= 3
                      ? 'text-emerald-400'
                      : 'text-[#E63946]'
                  }`}
                >
                  P{playerRacePosition}/{totalCarsInRace}
                </span>
              </div>
            )}

            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-slate-400">VUELTA</span>
              <span className="text-sm font-bold text-[#F0F4F8]">
                {raceMode === 'time-trial'
                  ? lapCount
                  : `${Math.min(lapCount, cupTargetLaps)}/${cupTargetLaps}`}
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-slate-400">CRONO</span>
              <span className="text-sm font-bold text-[#F0F4F8]">
                {formatLapTime(currentLapTimeMs)}
              </span>
            </div>

            <div className="hidden items-center gap-1 sm:flex">
              {(['S1', 'S2', 'S3'] as const).map((label, idx) => {
                const split = currentSectors[idx];
                return (
                  <span
                    key={label}
                    className={`rounded-xs border px-1.5 py-0.5 text-[10px] font-semibold ${getSectorBadgeClasses(
                      split.color
                    )}`}
                  >
                    {label} {formatSectorSeconds(split.timeMs)}
                  </span>
                );
              })}
            </div>

            <div className="hidden items-baseline gap-1 md:flex">
              <span className="text-[10px] text-slate-400">
                {raceMode === 'license-school' ? 'ORO' : 'RÉCORD'}
              </span>
              <span className="text-xs font-bold text-[#F59E0B]">
                {raceMode === 'license-school'
                  ? formatLapTime(activeLicense.goldMs)
                  : bestLapTimeMs !== null
                    ? formatLapTime(bestLapTimeMs)
                    : '--:--.---'}
              </span>
            </div>
          </div>

          {/* Derecha: Fila única de Controles Rápidos + Botón Garaje */}
          <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                requestTrackReset();
              }}
              className="rounded-xs border border-amber-500/60 bg-amber-500/15 px-2 py-1 font-bold text-amber-200 hover:bg-amber-500/25"
            >
              {isDerailed && raceMode !== 'license-school'
                ? 'Reencarrilar [R]'
                : '🚦 Salida [R]'}
            </button>
            <button
              type="button"
              onClick={toggleCameraMode}
              className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1 text-slate-200 hover:border-[#2F81F7]"
            >
              🎥 {cameraLabel}
            </button>
            <button
              type="button"
              onClick={toggleMagnetMode}
              className={`rounded-xs border px-2 py-1 font-bold ${
                magnetMode === 'wood-free'
                  ? 'border-[#F59E0B]/80 bg-[#F59E0B]/20 text-amber-200'
                  : 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
              }`}
            >
              {magnetMode === 'gt-magnet' ? '🧲 Imán [I]' : '🪵 Wood [I]'}
            </button>
            <button
              type="button"
              onClick={toggleWeatherMode}
              className={`rounded-xs border px-2 py-1 ${
                weatherMode === 'rain'
                  ? 'border-sky-400/80 bg-sky-500/25 text-sky-100'
                  : 'border-slate-700 bg-[#151B24] text-slate-200'
              }`}
            >
              {weatherMode === 'rain' ? '🌧️ Lluvia [V]' : '☀️ Seco [V]'}
            </button>
            <button
              type="button"
              onClick={toggleAssist}
              className={`hidden rounded-xs border px-2 py-1 lg:inline-block ${
                assistEnabled
                  ? 'border-[#2F81F7]/70 bg-[#2F81F7]/20 text-white'
                  : 'border-slate-700 bg-[#151B24] text-slate-400'
              }`}
            >
              Trazada [H]
            </button>
            <button
              type="button"
              onClick={toggleGhost}
              className={`hidden rounded-xs border px-2 py-1 lg:inline-block ${
                ghostEnabled
                  ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700 bg-[#151B24] text-slate-400'
              }`}
            >
              Fantasma [G]
            </button>
            <button
              type="button"
              onClick={togglePlayerLane}
              className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1 text-slate-200"
            >
              Carril {playerLane === 'left' ? 'Izq' : 'Der'} [L]
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                toggleSound();
              }}
              className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1 text-slate-200"
            >
              {soundEnabled ? '🔊 [M]' : '🔇 [M]'}
            </button>
            <button
              type="button"
              onClick={toggleTelemetryPanel}
              className={`rounded-xs border px-2 py-1 font-bold ${
                telemetryPanelOpen
                  ? 'border-cyan-400 bg-cyan-500/25 text-cyan-100'
                  : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
              }`}
            >
              📊 [T]
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.silenceAll();
                setGarageOpen(true);
              }}
              className="rounded-xs border border-[#2F81F7] bg-[#2F81F7]/20 px-2.5 py-1 font-display font-bold text-white hover:bg-[#2F81F7]/35"
            >
              🔧 Garaje
            </button>
          </div>
        </header>

        {/* TOAST SUPERIOR DE VUELTA COMPLETADA (Debajo de la barra superior, NUNCA tapando el centro de la pantalla) */}
        {showLapMedalBanner && lastLapSummary && (
          <div
            className={`mt-1.5 flex items-center gap-3 rounded-full border px-4 py-1 shadow-lg backdrop-blur-md ${
              getMedalBannerClasses(lastLapSummary.medal).border
            }`}
          >
            {lastLapSummary.isNewBest && (
              <span className="rounded-full bg-cyan-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-200">
                ★ NUEVO RÉCORD
              </span>
            )}
            <span className="font-display text-xs font-bold text-white">
              {lastLapSummary.title}
            </span>
            <span
              className={`font-mono text-xs font-bold tabular-nums ${
                getMedalBannerClasses(lastLapSummary.medal).accent
              }`}
            >
              {formatLapTime(lastLapSummary.lapTimeMs)}
            </span>
            <span className="hidden font-mono text-[11px] text-slate-300 sm:inline">
              · {lastLapSummary.subtitle}
            </span>
          </div>
        )}
      </div>

      {/* ZONA CENTRAL: SEMÁFORO OFICIAL F1 (5 Focos Rojos -> ¡VERDE SALIDA!), Modales de Final de Carrera / Licencias / Campeonato / Telemetría */}
      <div className="mx-auto flex flex-col items-center gap-2">
        {telemetryPanelOpen && (
          <div className="pointer-events-auto w-full max-w-2xl rounded-md border-2 border-cyan-400/80 bg-[#0D1117]/97 p-4 text-left shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="font-mono text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
                  📊 Telemetría FIA & Ingeniero de Pista · {CIRCUITS[trackId].name}
                </span>
                <h2 className="font-display text-base font-bold text-[#F0F4F8]">
                  Comparativa de Curva de Velocidad y Sectores (Última Vuelta vs Récord)
                </h2>
              </div>
              <button
                type="button"
                onClick={toggleTelemetryPanel}
                className="rounded-xs border border-slate-700 bg-[#151B24] px-2.5 py-1 font-mono text-xs font-bold text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                Cerrar [T]
              </button>
            </div>

            {/* Gráfico SVG Dual de Velocidad a lo largo de los 32 puntos del circuito */}
            {(() => {
              const bestTrace = bestLapSpeedTracesByTrack[trackId] ?? [];
              const lastTrace = lastLapSpeedTrace ?? [];
              const hasAnyTrace = bestTrace.length > 0 || lastTrace.length > 0;
              const chartMaxKmh = Math.max(220, maxSpeedKmh + 15);
              const w = 560;
              const h = 150;

              const buildPoints = (trace: readonly number[]) => {
                if (trace.length === 0) return '';
                return trace
                  .map((v, idx) => {
                    const x = (idx / Math.max(1, trace.length - 1)) * w;
                    const y = h - Math.min(1, Math.max(0, v / chartMaxKmh)) * (h - 18) - 8;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ');
              };

              const bestPoints = buildPoints(bestTrace);
              const lastPoints = buildPoints(lastTrace);

              const lastMax =
                lastTrace.length > 0 ? Math.max(...lastTrace) : Math.round(speedKmh);
              const bestMax =
                bestTrace.length > 0 ? Math.max(...bestTrace) : lastMax;

              return (
                <div className="mt-3 rounded-xs border border-slate-800 bg-[#151B24]/90 p-3">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                        <span className="inline-block h-2 w-4 rounded-xs bg-cyan-400" />
                        Última Vuelta{' '}
                        {lastLapTimeMs !== null
                          ? `(${formatLapTime(lastLapTimeMs)} · Vmax ${lastMax} km/h)`
                          : '(Completa 1 vuelta)'}
                      </span>
                      <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                        <span className="inline-block h-2 w-4 rounded-xs bg-[#F59E0B]" />
                        Récord Personal{' '}
                        {bestLapTimeMs !== null
                          ? `(${formatLapTime(bestLapTimeMs)} · Vmax ${bestMax} km/h)`
                          : '(--:--.---)'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Escala: 0 – {chartMaxKmh} km/h
                    </span>
                  </div>

                  <div className="relative">
                    <svg
                      viewBox={`0 0 ${w} ${h}`}
                      className="h-36 w-full overflow-visible rounded-xs border border-slate-800/90 bg-[#090D14]"
                    >
                      {/* Líneas horizontales guía de velocidad */}
                      {[0.25, 0.5, 0.75].map((ratio) => (
                        <line
                          key={ratio}
                          x1={0}
                          y1={h * ratio}
                          x2={w}
                          y2={h * ratio}
                          stroke="#1E293B"
                          strokeDasharray="3 3"
                          strokeWidth={1}
                        />
                      ))}

                      {/* Divisiones verticales de Sectores S1 / S2 / S3 */}
                      <line
                        x1={w / 3}
                        y1={0}
                        x2={w / 3}
                        y2={h}
                        stroke="#334155"
                        strokeDasharray="4 4"
                        strokeWidth={1.2}
                      />
                      <line
                        x1={(w * 2) / 3}
                        y1={0}
                        x2={(w * 2) / 3}
                        y2={h}
                        stroke="#334155"
                        strokeDasharray="4 4"
                        strokeWidth={1.2}
                      />

                      <text x={12} y={14} fill="#64748B" fontSize="10" fontFamily="monospace">
                        SECTOR 1
                      </text>
                      <text
                        x={w / 3 + 12}
                        y={14}
                        fill="#64748B"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        SECTOR 2
                      </text>
                      <text
                        x={(w * 2) / 3 + 12}
                        y={14}
                        fill="#64748B"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        SECTOR 3
                      </text>

                      {/* Traza del Récord Personal (Ámbar/Oro) */}
                      {bestPoints && (
                        <polyline
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth={2.2}
                          strokeOpacity={0.85}
                          points={bestPoints}
                        />
                      )}

                      {/* Traza de la Última Vuelta (Cian) */}
                      {lastPoints && (
                        <polyline
                          fill="none"
                          stroke="#22D3EE"
                          strokeWidth={2.5}
                          points={lastPoints}
                        />
                      )}
                    </svg>

                    {!hasAnyTrace && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="rounded-xs bg-[#0D1117]/90 px-3 py-1.5 font-mono text-xs text-slate-300">
                          Completa una vuelta para registrar la curva de velocidad en los 32 puntos del circuito
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Tabla Comparativa de Sectores S1 / S2 / S3 y Diagnóstico del Ingeniero de Pista */}
            {(() => {
              const bestSectors = bestSectorsByTrack[trackId] ?? [null, null, null];
              const avgTemp =
                (tireTempsC[0] + tireTempsC[1] + tireTempsC[2] + tireTempsC[3]) / 4;

              // Calcular en qué sector se pierde más tiempo respecto al récord
              let worstSectorIdx: 0 | 1 | 2 | null = null;
              let worstDeltaMs = -Infinity;
              for (const idx of [0, 1, 2] as const) {
                const cur = currentSectors[idx]?.timeMs;
                const best = bestSectors[idx];
                if (cur !== null && best !== null) {
                  const d = cur - best;
                  if (d > worstDeltaMs) {
                    worstDeltaMs = d;
                    worstSectorIdx = idx;
                  }
                }
              }

              const engineerTip =
                avgTemp > 104
                  ? `Tus neumáticos traseros (${tireTempsC[2]}°C / ${tireTempsC[3]}°C) sufren sobrecalentamiento térmico. Modula el gatillo a la salida de las curvas lentas o monta compuesto Medio/Duro en el Garaje.`
                  : avgTemp < 64
                    ? `Gomas frías (${Math.round(avgTemp)}°C · Grip ×${tireThermalGripFactor.toFixed(2)}). Apoya con decisión en las curvas enlazadas del Sector 1 para meterlas en la ventana óptima (70°C–95°C).`
                    : worstSectorIdx !== null && worstDeltaMs > 80
                      ? `Estás cediendo +${(worstDeltaMs / 1000).toFixed(2)}s en el Sector ${worstSectorIdx + 1} respecto a tu mejor parcial. Toma como referencia los carteles FIA de 150m/100m/50m para clavar la frenada antes del vértice.`
                      : magnetMode === 'wood-free'
                        ? `Conducción en modo Sin Imán (Wood) impecable. Aprovecha el +36% de techo de guiñada para rotar el chasis antes del vértice y abrir gas con el coche ya encarado.`
                        : `Ventana térmica óptima (${Math.round(avgTemp)}°C · Grip ×${tireThermalGripFactor.toFixed(2)}). Usa el cambio de carril [L] en rectas para coger el rebufo (+8% punta) o trazar por el radio exterior en horquillas cerradas.`;

              return (
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {(['Sector 1', 'Sector 2', 'Sector 3'] as const).map(
                    (secTitle, idx) => {
                      const curMs = currentSectors[idx]?.timeMs ?? null;
                      const bestMs = bestSectors[idx] ?? null;
                      const deltaMs =
                        curMs !== null && bestMs !== null ? curMs - bestMs : null;

                      return (
                        <div
                          key={secTitle}
                          className="rounded-xs border border-slate-800 bg-[#151B24]/85 p-2.5 font-mono text-xs tabular-nums"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-300">
                              {secTitle}
                            </span>
                            {deltaMs !== null && (
                              <span
                                className={`rounded-xs px-1.5 py-0.5 text-[10px] font-bold ${
                                  deltaMs <= 0
                                    ? 'bg-purple-500/25 text-purple-200'
                                    : deltaMs <= 180
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {deltaMs <= 0 ? '' : '+'}
                                {(deltaMs / 1000).toFixed(2)}s
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-[10px] text-slate-400">
                              Actual:
                            </span>
                            <span className="font-bold text-[#F0F4F8]">
                              {formatSectorSeconds(curMs)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[10px] text-slate-400">
                              Récord S{idx + 1}:
                            </span>
                            <span className="font-semibold text-[#F59E0B]">
                              {formatSectorSeconds(bestMs)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                  )}

                  {/* Diagnóstico del Ingeniero de Pista */}
                  <div className="rounded-xs border border-cyan-500/40 bg-cyan-950/25 p-2.5 sm:col-span-3">
                    <span className="block font-mono text-[10px] font-bold tracking-wider text-cyan-300 uppercase">
                      🎧 Ingeniero de Pista FIA · Diagnóstico en Tiempo Real
                    </span>
                    <p className="mt-1 text-xs text-slate-200">{engineerTip}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {(cupStartPhase === 'countdown' || cupStartPhase === 'green') && (
          <div className="rounded-md border-2 border-slate-700 bg-[#0D1117]/95 px-7 py-4 text-center shadow-2xl backdrop-blur-md">
            <span className="font-mono text-[11px] font-bold tracking-wider text-slate-300 uppercase">
              {raceMode === 'license-school'
                ? `🎓 LICENCIA FIA ${activeLicense.code} · ${activeLicense.title} (${activeLicense.subtitle})`
                : raceMode === 'championship'
                  ? `🏆 CAMPEONATO FIA · RONDA ${championshipRoundIndex + 1}/${CHAMPIONSHIP_TRACK_ORDER.length} · ${CIRCUITS[trackId].name} (Parrilla 4 Coches)`
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
              !playerDidNotFinish && playerRacePosition === 1
                ? 'border-emerald-400 bg-[#151B24]/97'
                : playerDidNotFinish ||
                    (raceMode === 'championship' && playerRacePosition > 3)
                  ? 'border-[#E63946] bg-[#151B24]/97'
                  : 'border-slate-600 bg-[#151B24]/97'
            }`}
          >
            <span
              className={`inline-block rounded-xs px-2.5 py-0.5 font-mono text-xs font-bold ${
                playerDidNotFinish
                  ? 'bg-[#E63946] text-white'
                  : playerRacePosition === 1
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-amber-500 text-slate-950'
              }`}
            >
              {playerDidNotFinish
                ? '⏱️ DNF · TIEMPO LÍMITE AGOTADO (30s TRAS EL LÍDER)'
                : raceMode === 'championship'
                  ? championshipCompleted
                    ? '🏆 ¡FINAL DEL CAMPEONATO MUNDIAL FIA!'
                    : playerRacePosition <= 3
                      ? `🏆 RONDA ${championshipRoundIndex + 1}/${CHAMPIONSHIP_TRACK_ORDER.length} CLASIFICADA · P${playerRacePosition}`
                      : `❌ RONDA ${championshipRoundIndex + 1} NO SUPERADA · P${playerRacePosition} (FUERA DE PODIO)`
                  : playerRacePosition === 1
                    ? '🏆 ¡VICTORIA EN GRAN PREMIO!'
                    : `🏁 ${playerRacePosition}.ª POSICIÓN FINAL (+${cupRewardGp} GP)`}
            </span>

            <p className="mt-2 font-display text-xl font-bold text-[#F0F4F8]">
              {playerDidNotFinish
                ? 'No cruzaste la línea de meta antes de que expiraran los 30s reglamentarios'
                : raceMode === 'championship' && championshipCompleted
                  ? championshipStandings[0]?.isPlayer
                    ? '¡ERES EL CAMPEÓN DEL MUNDO FIA SLOT!'
                    : `Campeón FIA: ${championshipStandings[0]?.name}`
                  : playerRacePosition === 1
                    ? `¡Cruzaste la meta en P1 en ${CIRCUITS[trackId].name}!`
                    : `Finalizaste P${playerRacePosition} de ${totalCarsInRace} coches en pista`}
            </p>

            {raceMode === 'championship' &&
              (playerDidNotFinish || playerRacePosition > 3) && (
                <p className="mt-1.5 rounded-xs border border-[#E63946]/60 bg-[#E63946]/15 px-3 py-1 font-mono text-xs text-red-200">
                  Requisito FIA: Necesitas acabar en el Podio (P1, P2 o P3) dentro del tiempo límite para avanzar a la siguiente ronda.
                </p>
              )}

            {/* Tabla de Clasificación de la Carrera o General del Campeonato FIA */}
            <div className="mt-3 rounded-xs border border-slate-800 bg-[#0D1117]/90 p-2.5 text-left font-mono text-xs">
              <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {raceMode === 'championship' &&
                !playerDidNotFinish &&
                playerRacePosition <= 3
                  ? 'Clasificación General del Campeonato FIA (Puntos 25-18-15-12)'
                  : 'Clasificación Oficial en Meta'}
              </div>
              {raceMode === 'championship' &&
              !playerDidNotFinish &&
              playerRacePosition <= 3
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
                        {row.isPlayer && playerDidNotFinish
                          ? 'DNF'
                          : `P${row.position}`}{' '}
                        · {row.name}
                      </span>
                      <span>
                        {row.isPlayer && playerDidNotFinish
                          ? 'TIEMPO AGOTADO'
                          : row.position === 1
                            ? 'GANADOR'
                            : `+${row.gapToLeaderM.toFixed(1)} m`}
                      </span>
                    </div>
                  ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
              {raceMode === 'championship' ? (
                !playerDidNotFinish && playerRacePosition <= 3 ? (
                  !championshipCompleted ? (
                    <button
                      type="button"
                      onClick={advanceChampionshipRound}
                      className="rounded-xs bg-[#F59E0B] px-4 py-1.5 font-display text-xs font-bold text-slate-950 hover:bg-amber-400"
                    >
                      Siguiente Ronda (R{championshipRoundIndex + 2}/
                      {CHAMPIONSHIP_TRACK_ORDER.length}:{' '}
                      {
                        CIRCUITS[
                          CHAMPIONSHIP_TRACK_ORDER[
                            Math.min(
                              CHAMPIONSHIP_TRACK_ORDER.length - 1,
                              championshipRoundIndex + 1
                            )
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
                    onClick={requestTrackReset}
                    className="rounded-xs bg-amber-500 px-4 py-1.5 font-display text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    Repetir Ronda [R]
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={requestTrackReset}
                  className="rounded-xs bg-emerald-500 px-3.5 py-1.5 font-display text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Repetir Carrera [R]
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  soundEngine.silenceAll();
                  setAppScreen('main-menu');
                }}
                className="rounded-xs border border-slate-700 bg-[#0D1117] px-3.5 py-1.5 font-display text-xs font-semibold text-slate-300 hover:border-slate-500"
              >
                Volver al Menú Principal
              </button>
            </div>
          </div>
        )}

        {isDerailed && (
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
        )}

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
      <div className="flex flex-col-reverse items-stretch justify-between gap-4 p-3 sm:flex-row sm:items-end sm:p-5">
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
