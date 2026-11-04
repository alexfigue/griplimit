import { create } from 'zustand';
import rawCatalog from '@/data/partsCatalog.json';
import { consolidateCarStats, resolveLoadoutParts } from '@/lib/carStats';
import {
  loadAllCommunityCars,
  removeStoredCommunityCar,
  rotateStoredCommunityCar,
  saveNewCommunityCar,
} from '@/lib/customCarStorage';
import type {
  BodyShellPart,
  CameraMode,
  CarLoadout,
  CupStartPhase,
  CustomAeroArchetype,
  GarageStoreState,
  LapEvaluationSummary,
  LapMedalGrade,
  PartCategory,
  PartsCatalog,
  RaceMode,
  SectorColor,
  SectorSplitInfo,
  TelemetrySnapshot,
  TelemetryStoreState,
  TrackId,
} from '@/types/types';

const partsCatalog: PartsCatalog = rawCatalog;

const GARAGE_STORAGE_KEY = 'griplimit_garage_v3';
const RECORDS_STORAGE_KEY = 'griplimit_records_v2';
const LEGACY_BEST_LAPS_KEY = 'griplimit_best_laps_v1';
const INITIAL_GP_CREDITS = 9999;

const CUP_VICTORY_PRIZE_BY_TRACK: Record<TrackId, number> = {
  montmelo: 450,
  'sierra-seca': 600,
  'neo-wangan': 850,
};

function computeAllCatalogPartIds(catalog: PartsCatalog): string[] {
  const ids: string[] = [];
  for (const b of catalog.bodies) ids.push(b.id);
  for (const e of catalog.engines) ids.push(e.id);
  for (const t of catalog.tires) ids.push(t.id);
  for (const r of catalog.rollers) ids.push(r.id);
  for (const c of catalog.chassis) ids.push(c.id);
  return ids;
}

const DEFAULT_UNLOCKED_IDS = computeAllCatalogPartIds(partsCatalog);

const initialLoadout: CarLoadout = {
  bodyId: partsCatalog.bodies[0].id,
  engineId: partsCatalog.engines[0].id,
  tiresId: partsCatalog.tires[1]?.id ?? partsCatalog.tires[0].id,
  rollersId: partsCatalog.rollers[1]?.id ?? partsCatalog.rollers[0].id,
  chassisId: partsCatalog.chassis[0].id,
};

const initialActiveParts = resolveLoadoutParts(partsCatalog, initialLoadout, []);
const initialCarStats = consolidateCarStats(
  initialActiveParts.engine,
  initialActiveParts.tires,
  initialActiveParts.chassis,
  initialActiveParts.body,
  initialActiveParts.rollers
);

interface PersistedGaragePayload {
  gpCredits: number;
  unlockedPartIds: string[];
  sandboxUnlocked: boolean;
  loadout: CarLoadout;
}

function savePersistedGarage(payload: PersistedGaragePayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GARAGE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignorar cuota de localStorage
  }
}

function loadPersistedGarage(): PersistedGaragePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GARAGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedGaragePayload>;
    const mergedUnlocked = Array.from(
      new Set([
        ...DEFAULT_UNLOCKED_IDS,
        ...(Array.isArray(parsed.unlockedPartIds) ? parsed.unlockedPartIds : []),
      ])
    );

    return {
      gpCredits:
        typeof parsed.gpCredits === 'number' && Number.isFinite(parsed.gpCredits)
          ? Math.max(0, Math.round(parsed.gpCredits))
          : INITIAL_GP_CREDITS,
      unlockedPartIds: mergedUnlocked,
      sandboxUnlocked: true,
      loadout: parsed.loadout ?? initialLoadout,
    };
  } catch {
    return null;
  }
}

/**
 * STORE 1: GARAJE CON ACCESO COMPLETO A TODOS LOS COCHES PRO (.GLB) Y PIEZAS DESDE EL INICIO
 */
export const useGarageStore = create<GarageStoreState>((set, get) => {
  const persistCurrentGarage = (overrides?: Partial<PersistedGaragePayload>) => {
    const state = get();
    savePersistedGarage({
      gpCredits: overrides?.gpCredits ?? state.gpCredits,
      unlockedPartIds:
        overrides?.unlockedPartIds ?? [...state.unlockedPartIds],
      sandboxUnlocked: true,
      loadout: overrides?.loadout ?? state.loadout,
    });
  };

  const applyLoadout = (
    nextLoadout: CarLoadout,
    customBodiesOverride?: readonly BodyShellPart[]
  ) => {
    const state = get();
    const bodies = customBodiesOverride ?? state.customBodies;
    const activeParts = resolveLoadoutParts(state.catalog, nextLoadout, bodies);
    const normalizedLoadout: CarLoadout = {
      engineId: activeParts.engine.id,
      tiresId: activeParts.tires.id,
      chassisId: activeParts.chassis.id,
      bodyId: activeParts.body.id,
      rollersId: activeParts.rollers.id,
    };
    const carStats = consolidateCarStats(
      activeParts.engine,
      activeParts.tires,
      activeParts.chassis,
      activeParts.body,
      activeParts.rollers
    );

    set({
      loadout: normalizedLoadout,
      activeParts,
      carStats,
      ...(customBodiesOverride ? { customBodies: customBodiesOverride } : {}),
    });
    persistCurrentGarage({ loadout: normalizedLoadout });
  };

  return {
    catalog: partsCatalog,
    customBodies: [],
    loadout: initialLoadout,
    activeParts: initialActiveParts,
    carStats: initialCarStats,
    gpCredits: INITIAL_GP_CREDITS,
    unlockedPartIds: DEFAULT_UNLOCKED_IDS,
    sandboxUnlocked: true,
    isGarageOpen: false,
    isHydrated: false,

    setGarageOpen: (open: boolean) => set({ isGarageOpen: open }),

    hydrateGarage: async () => {
      if (get().isHydrated) return;

      const persisted = loadPersistedGarage();
      const communityCars = await loadAllCommunityCars();

      const targetLoadout = persisted?.loadout ?? get().loadout;
      const activeParts = resolveLoadoutParts(
        partsCatalog,
        targetLoadout,
        communityCars
      );
      const normalizedLoadout: CarLoadout = {
        engineId: activeParts.engine.id,
        tiresId: activeParts.tires.id,
        chassisId: activeParts.chassis.id,
        bodyId: activeParts.body.id,
        rollersId: activeParts.rollers.id,
      };
      const carStats = consolidateCarStats(
        activeParts.engine,
        activeParts.tires,
        activeParts.chassis,
        activeParts.body,
        activeParts.rollers
      );

      set({
        customBodies: communityCars,
        gpCredits: persisted?.gpCredits ?? INITIAL_GP_CREDITS,
        unlockedPartIds: DEFAULT_UNLOCKED_IDS,
        sandboxUnlocked: true,
        loadout: normalizedLoadout,
        activeParts,
        carStats,
        isHydrated: true,
      });
    },

    addGpCredits: (amount: number) => {
      const cleanAdd = Math.max(0, Math.round(amount));
      if (cleanAdd <= 0) return;
      const nextCredits = get().gpCredits + cleanAdd;
      set({ gpCredits: nextCredits });
      persistCurrentGarage({ gpCredits: nextCredits });
    },

    toggleSandboxUnlocked: () => {
      set({ sandboxUnlocked: true });
    },

    selectOrBuyPart: (category: PartCategory, partId: string) => {
      const state = get();
      const nextLoadout: CarLoadout = {
        ...state.loadout,
        ...(category === 'bodies' ? { bodyId: partId } : {}),
        ...(category === 'engines' ? { engineId: partId } : {}),
        ...(category === 'tires' ? { tiresId: partId } : {}),
        ...(category === 'rollers' ? { rollersId: partId } : {}),
        ...(category === 'chassis' ? { chassisId: partId } : {}),
      };

      const activeParts = resolveLoadoutParts(
        state.catalog,
        nextLoadout,
        state.customBodies
      );
      const carStats = consolidateCarStats(
        activeParts.engine,
        activeParts.tires,
        activeParts.chassis,
        activeParts.body,
        activeParts.rollers
      );

      set({
        loadout: nextLoadout,
        activeParts,
        carStats,
      });

      persistCurrentGarage({
        loadout: nextLoadout,
      });
      return true;
    },

    selectEngine: (engineId: string) =>
      applyLoadout({ ...get().loadout, engineId }),
    selectTires: (tiresId: string) =>
      applyLoadout({ ...get().loadout, tiresId }),
    selectChassis: (chassisId: string) =>
      applyLoadout({ ...get().loadout, chassisId }),
    selectBody: (bodyId: string) =>
      applyLoadout({ ...get().loadout, bodyId }),
    selectRollers: (rollersId: string) =>
      applyLoadout({ ...get().loadout, rollersId }),

    importCommunityCarGLB: async (
      file: File,
      archetype: CustomAeroArchetype,
      authorName?: string
    ) => {
      const createdBody = await saveNewCommunityCar(file, archetype, authorName);
      const nextCustomBodies = [...get().customBodies, createdBody];
      applyLoadout(
        { ...get().loadout, bodyId: createdBody.id },
        nextCustomBodies
      );
    },

    rotateCommunityCarYaw: async (bodyId: string) => {
      const updated = await rotateStoredCommunityCar(bodyId);
      if (!updated) return;
      const nextCustomBodies = get().customBodies.map((b) =>
        b.id === bodyId ? updated : b
      );
      applyLoadout(get().loadout, nextCustomBodies);
    },

    deleteCommunityCar: async (bodyId: string) => {
      await removeStoredCommunityCar(bodyId);
      const nextCustomBodies = get().customBodies.filter((b) => b.id !== bodyId);
      const currentLoadout = get().loadout;
      const nextBodyId =
        currentLoadout.bodyId === bodyId
          ? get().catalog.bodies[0].id
          : currentLoadout.bodyId;
      applyLoadout({ ...currentLoadout, bodyId: nextBodyId }, nextCustomBodies);
    },
  };
});

type BestLapsMap = Record<TrackId, number | null>;
type BestSectorsMap = Record<TrackId, [number | null, number | null, number | null]>;

interface PersistedRecordsPayload {
  bestLaps: BestLapsMap;
  bestSectors: BestSectorsMap;
}

const DEFAULT_BEST_LAPS: BestLapsMap = {
  montmelo: null,
  'sierra-seca': null,
  'neo-wangan': null,
};

const EMPTY_SECTOR_SPLITS: readonly [
  SectorSplitInfo,
  SectorSplitInfo,
  SectorSplitInfo,
] = [
  { timeMs: null, color: 'pending', deltaMs: null },
  { timeMs: null, color: 'pending', deltaMs: null },
  { timeMs: null, color: 'pending', deltaMs: null },
];

let recordsHydrated = false;

function loadPersistedRecords(): PersistedRecordsPayload {
  if (typeof window === 'undefined') {
    return {
      bestLaps: { ...DEFAULT_BEST_LAPS },
      bestSectors: {
        montmelo: [null, null, null],
        'sierra-seca': [null, null, null],
        'neo-wangan': [null, null, null],
      },
    };
  }

  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedRecordsPayload>;
      const sanitizeTuple = (
        arr: unknown
      ): [number | null, number | null, number | null] => {
        if (!Array.isArray(arr)) return [null, null, null];
        return [
          typeof arr[0] === 'number' ? arr[0] : null,
          typeof arr[1] === 'number' ? arr[1] : null,
          typeof arr[2] === 'number' ? arr[2] : null,
        ];
      };

      return {
        bestLaps: {
          montmelo:
            typeof parsed.bestLaps?.montmelo === 'number'
              ? parsed.bestLaps.montmelo
              : null,
          'sierra-seca':
            typeof parsed.bestLaps?.['sierra-seca'] === 'number'
              ? parsed.bestLaps['sierra-seca']
              : null,
          'neo-wangan':
            typeof parsed.bestLaps?.['neo-wangan'] === 'number'
              ? parsed.bestLaps['neo-wangan']
              : null,
        },
        bestSectors: {
          montmelo: sanitizeTuple(parsed.bestSectors?.montmelo),
          'sierra-seca': sanitizeTuple(parsed.bestSectors?.['sierra-seca']),
          'neo-wangan': sanitizeTuple(parsed.bestSectors?.['neo-wangan']),
        },
      };
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_BEST_LAPS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Partial<BestLapsMap>;
      return {
        bestLaps: {
          montmelo: typeof legacy.montmelo === 'number' ? legacy.montmelo : null,
          'sierra-seca':
            typeof legacy['sierra-seca'] === 'number'
              ? legacy['sierra-seca']
              : null,
          'neo-wangan': null,
        },
        bestSectors: {
          montmelo: [null, null, null],
          'sierra-seca': [null, null, null],
          'neo-wangan': [null, null, null],
        },
      };
    }
  } catch {
    // Ignorar error de parseo
  }

  return {
    bestLaps: { ...DEFAULT_BEST_LAPS },
    bestSectors: {
      montmelo: [null, null, null],
      'sierra-seca': [null, null, null],
      'neo-wangan': [null, null, null],
    },
  };
}

function savePersistedRecords(payload: PersistedRecordsPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignorar cuota en modo incógnito
  }
}

const INITIAL_TELEMETRY_SNAPSHOT: TelemetrySnapshot = {
  speedMs: 0,
  speedKmh: 0,
  gear: 0,
  engineRpm: 1650,
  lateralG: 0,
  centrifugalForce: 0,
  gripAvailable: initialCarStats.TotalGrip,
  gripUsageRatio: 0,
  isDrifting: false,
  driftAngleDeg: 0,
  guideStressRatio: 0,
  brakeAdvice: 'clear',
  recommendedCornerSpeedKmh: null,
  curvatureRadius: Infinity,
  slopePercent: 0,
  lapProgress: 0,
  lapCount: 1,
  currentLapTimeMs: 0,
  lastLapTimeMs: null,
  bestLapTimeMs: null,
  isDerailed: false,
  lastDerailForce: 0,
  throttleInput: 0,
  brakeInput: 0,
  slipstreamActive: false,
  overVoltCharge: 0.5,
  overVoltActive: false,
  falseStartPenalty: false,
  turboStartActive: false,
  gapToRivalM: 0,
  playerRacePosition: 1,
  rivalLapCount: 1,
  tireTempsC: [56, 56, 56, 56],
  tireThermalGripFactor: 0.96,
};

/**
 * STORE 2: TELEMETRÍA EN TIEMPO REAL, 2 MODOS DE JUEGO (CONTRARRELOJ / VS IA) Y SEMÁFORO F1
 */
export const useTelemetryStore = create<TelemetryStoreState>((set, get) => {
  const ensureRecordsLoaded = (): PersistedRecordsPayload => {
    const state = get();
    if (recordsHydrated) {
      return {
        bestLaps: state.bestLapByTrack,
        bestSectors: state.bestSectorsByTrack,
      };
    }
    const loaded = loadPersistedRecords();
    recordsHydrated = true;
    return loaded;
  };

  return {
    ...INITIAL_TELEMETRY_SNAPSHOT,
    trackId: 'montmelo',
    playerLane: 'left',
    magnetMode: 'gt-magnet',
    rivalEnabled: true,
    ghostEnabled: true,
    assistEnabled: true,
    soundEnabled: true,
    cameraMode: 'chase',
    environmentStyle: 'realistic',
    weatherMode: 'dry',
    raceMode: 'vs-ai',
    cupStartPhase: 'countdown',
    countdownLights: 1,
    cupTargetLaps: 3,
    cupWinner: null,
    cupRewardGp: 0,
    overVoltTriggerNonce: 0,
    resetNonce: 0,
    ghostVersionNonce: 0,
    bestLapByTrack: { ...DEFAULT_BEST_LAPS },
    bestSectorsByTrack: {
      montmelo: [null, null, null],
      'sierra-seca': [null, null, null],
      'neo-wangan': [null, null, null],
    },
    currentSectors: EMPTY_SECTOR_SPLITS,
    lastLapSummary: null,

    updateTelemetry: (partial) => set(partial),

    recordSectorSplit: (sectorIndex: 0 | 1 | 2, sectorTimeMs: number) => {
      const state = get();
      const { bestLaps, bestSectors } = ensureRecordsLoaded();
      const trackTuple: [number | null, number | null, number | null] = [
        ...bestSectors[state.trackId],
      ];

      const prevBest = trackTuple[sectorIndex];
      let color: SectorColor;
      const deltaMs = prevBest !== null ? sectorTimeMs - prevBest : null;

      if (prevBest === null || sectorTimeMs < prevBest) {
        color = 'purple';
        trackTuple[sectorIndex] = sectorTimeMs;
      } else if (sectorTimeMs <= prevBest * 1.035) {
        color = 'green';
      } else {
        color = 'amber';
      }

      const nextBestSectors: BestSectorsMap = {
        ...bestSectors,
        [state.trackId]: trackTuple,
      };

      if (color === 'purple') {
        savePersistedRecords({
          bestLaps,
          bestSectors: nextBestSectors,
        });
      }

      const splitEntry: SectorSplitInfo = {
        timeMs: sectorTimeMs,
        color,
        deltaMs,
      };

      const baseSplits: [SectorSplitInfo, SectorSplitInfo, SectorSplitInfo] =
        sectorIndex === 0
          ? [
              splitEntry,
              { timeMs: null, color: 'pending', deltaMs: null },
              { timeMs: null, color: 'pending', deltaMs: null },
            ]
          : [
              state.currentSectors[0],
              sectorIndex === 1 ? splitEntry : state.currentSectors[1],
              sectorIndex === 2 ? splitEntry : state.currentSectors[2],
            ];

      set({
        bestLapByTrack: bestLaps,
        bestSectorsByTrack: nextBestSectors,
        currentSectors: baseSplits,
      });

      return color;
    },

    completeEvaluatedLap: ({
      lapTimeMs,
      derailCount,
      maxGuideStress,
      driftScoreSec,
      purpleSectorsInLap,
      goldTargetMs,
    }) => {
      const state = get();
      const { bestLaps, bestSectors } = ensureRecordsLoaded();

      const prevBest = bestLaps[state.trackId];
      const isNewBest = prevBest === null || lapTimeMs < prevBest;
      const nextBest = isNewBest ? lapTimeMs : prevBest;

      const updatedBestLaps: BestLapsMap = {
        ...bestLaps,
        [state.trackId]: nextBest,
      };

      savePersistedRecords({
        bestLaps: updatedBestLaps,
        bestSectors,
      });

      let medal: LapMedalGrade;
      let title: string;
      let subtitle: string;
      let baseCredits: number;

      if (
        derailCount === 0 &&
        maxGuideStress < 0.88 &&
        (isNewBest || purpleSectorsInLap >= 2 || lapTimeMs <= goldTargetMs)
      ) {
        medal = 'perfect';
        title = '¡VUELTA RÁPIDA DE CLASIFICACIÓN!';
        subtitle = 'Trazada limpia al límite de adherencia en los 3 sectores';
        baseCredits = 350;
      } else if (derailCount === 0 && driftScoreSec >= 1.8) {
        medal = 'drift-master';
        title = 'CONTROL DE SOBREVIRAJE PRO';
        subtitle = `${driftScoreSec.toFixed(1)} s al límite de deslizamiento sin perder el carril`;
        baseCredits = 230;
      } else if (derailCount === 0) {
        medal = 'clean';
        title = 'VUELTA LIMPIA';
        subtitle = 'Sin incidencias ni salidas de pista';
        baseCredits = 140;
      } else {
        medal = 'completed';
        title = 'VUELTA COMPLETADA';
        subtitle = `${derailCount} salida${derailCount === 1 ? '' : 's'} de pista · Anticipa la frenada antes del vértice`;
        baseCredits = 65;
      }

      const earnedCredits = Math.round(baseCredits);
      useGarageStore.getState().addGpCredits(earnedCredits);

      const summary: LapEvaluationSummary = {
        medal,
        title,
        subtitle,
        lapTimeMs,
        earnedCredits,
        isNewBest,
        timestamp: Date.now(),
      };

      set({
        lastLapTimeMs: lapTimeMs,
        bestLapTimeMs: nextBest,
        bestLapByTrack: updatedBestLaps,
        bestSectorsByTrack: bestSectors,
        lastLapSummary: summary,
      });

      return summary;
    },

    bumpGhostVersion: () =>
      set((state) => ({
        ghostVersionNonce: state.ghostVersionNonce + 1,
      })),

    setTrackId: (trackId: TrackId) => {
      const { bestLaps, bestSectors } = ensureRecordsLoaded();

      set((state) => ({
        trackId,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        currentLapTimeMs: 0,
        lastLapTimeMs: null,
        bestLapTimeMs: bestLaps[trackId],
        bestLapByTrack: bestLaps,
        bestSectorsByTrack: bestSectors,
        currentSectors: EMPTY_SECTOR_SPLITS,
        lastLapSummary: null,
        isDerailed: false,
        isDrifting: false,
        driftAngleDeg: 0,
        guideStressRatio: 0,
        brakeAdvice: 'clear',
        recommendedCornerSpeedKmh: null,
        speedMs: 0,
        speedKmh: 0,
        gear: 0,
        engineRpm: 1650,
        lateralG: 0,
        centrifugalForce: 0,
        gripUsageRatio: 0,
        slipstreamActive: false,
        overVoltActive: false,
        falseStartPenalty: false,
        turboStartActive: false,
      }));
    },

    setRaceMode: (mode: RaceMode) => {
      useGarageStore.getState().setGarageOpen(false);
      set((state) => ({
        raceMode: mode,
        rivalEnabled: mode === 'vs-ai',
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        playerRacePosition: 1,
        gapToRivalM: 0,
        currentLapTimeMs: 0,
        currentSectors: EMPTY_SECTOR_SPLITS,
        lastLapSummary: null,
        isDerailed: false,
        isDrifting: false,
        driftAngleDeg: 0,
        guideStressRatio: 0,
        speedMs: 0,
        speedKmh: 0,
        gear: 0,
        engineRpm: 1650,
        lateralG: 0,
        centrifugalForce: 0,
        gripUsageRatio: 0,
        slipstreamActive: false,
        overVoltActive: false,
        falseStartPenalty: false,
        turboStartActive: false,
      }));
    },

    startCupRace: () => {
      get().setRaceMode('vs-ai');
    },

    exitCupRace: () => {
      get().setRaceMode('time-trial');
    },

    setCupCountdownState: (
      phase: CupStartPhase,
      lights: 0 | 1 | 2 | 3 | 4 | 5
    ) =>
      set({
        cupStartPhase: phase,
        countdownLights: lights,
      }),

    finishCupRace: (winner: 'player' | 'rival') => {
      const state = get();
      if (state.cupStartPhase === 'finished') return;

      const reward =
        winner === 'player'
          ? CUP_VICTORY_PRIZE_BY_TRACK[state.trackId]
          : 150;

      useGarageStore.getState().addGpCredits(reward);

      set({
        cupStartPhase: 'finished',
        cupWinner: winner,
        cupRewardGp: reward,
      });
    },

    triggerOverVolt: () =>
      set((state) => ({
        overVoltTriggerNonce: state.overVoltTriggerNonce + 1,
      })),

    toggleMagnetMode: () =>
      set((state) => ({
        magnetMode: state.magnetMode === 'gt-magnet' ? 'wood-free' : 'gt-magnet',
      })),

    toggleWeatherMode: () =>
      set((state) => ({
        weatherMode: state.weatherMode === 'dry' ? 'rain' : 'dry',
      })),

    togglePlayerLane: () =>
      set((state) => ({
        playerLane: state.playerLane === 'left' ? 'right' : 'left',
      })),

    toggleRival: () => {
      const nextMode: RaceMode =
        get().raceMode === 'vs-ai' ? 'time-trial' : 'vs-ai';
      get().setRaceMode(nextMode);
    },

    toggleGhost: () =>
      set((state) => ({
        ghostEnabled: !state.ghostEnabled,
      })),

    toggleAssist: () =>
      set((state) => ({
        assistEnabled: !state.assistEnabled,
      })),

    toggleSound: () =>
      set((state) => ({
        soundEnabled: !state.soundEnabled,
      })),

    toggleCameraMode: () =>
      set((state) => {
        const order: CameraMode[] = ['chase', 'cockpit', 'overhead'];
        const nextIdx = (order.indexOf(state.cameraMode) + 1) % order.length;
        return { cameraMode: order[nextIdx] };
      }),

    toggleEnvironmentStyle: () =>
      set((state) => ({
        environmentStyle:
          state.environmentStyle === 'realistic' ? 'tabletop' : 'realistic',
      })),

    requestTrackReset: () =>
      set((state) => {
        // Si el coche está descarrilado, lo reencarrila en marcha; si está en pista, reinicia la Salida en Parrilla con Semáforo F1
        if (state.isDerailed) {
          return {
            resetNonce: state.resetNonce + 1,
            isDerailed: false,
            isDrifting: false,
            driftAngleDeg: 0,
            guideStressRatio: 0,
            speedMs: 0,
            speedKmh: 0,
            gear: 1,
            engineRpm: 1800,
            centrifugalForce: 0,
            gripUsageRatio: 0,
          };
        }
        return {
          cupStartPhase: 'countdown',
          countdownLights: 1,
          cupWinner: null,
          resetNonce: state.resetNonce + 1,
          lapCount: 1,
          rivalLapCount: 1,
          currentLapTimeMs: 0,
          currentSectors: EMPTY_SECTOR_SPLITS,
          isDerailed: false,
          isDrifting: false,
          driftAngleDeg: 0,
          guideStressRatio: 0,
          brakeAdvice: 'clear',
          recommendedCornerSpeedKmh: null,
          speedMs: 0,
          speedKmh: 0,
          gear: 0,
          engineRpm: 1650,
          lateralG: 0,
          centrifugalForce: 0,
          gripUsageRatio: 0,
          falseStartPenalty: false,
          turboStartActive: false,
        };
      }),
  };
});
