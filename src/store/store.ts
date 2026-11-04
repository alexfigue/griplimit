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
  AppScreenMode,
  BodyShellPart,
  CameraMode,
  CarLoadout,
  ChampionshipStandingRow,
  ChassisPart,
  CupStartPhase,
  CustomAeroArchetype,
  CustomRimStyleOption,
  GarageStoreState,
  GridStandingRow,
  LapEvaluationSummary,
  LapMedalGrade,
  LicenseAttemptSummary,
  LicenseChallengeSpec,
  LicenseMedalGrade,
  LicenseProgressRecord,
  PaintFinishType,
  PartCategory,
  PartsCatalog,
  RaceMode,
  SectorColor,
  SectorSplitInfo,
  TelemetrySnapshot,
  TelemetryStoreState,
  TrackId,
  VisualCustomizationConfig,
} from '@/types/types';

const partsCatalog: PartsCatalog = rawCatalog;

const GARAGE_STORAGE_KEY = 'griplimit_garage_v3';
const RECORDS_STORAGE_KEY = 'griplimit_records_v2';
const LICENSE_STORAGE_KEY = 'griplimit_licenses_v1';
const LEGACY_BEST_LAPS_KEY = 'griplimit_best_laps_v1';
const INITIAL_GP_CREDITS = 9999;

const CUP_VICTORY_PRIZE_BY_TRACK: Record<TrackId, number> = {
  montmelo: 450,
  'sierra-seca': 600,
  'spa-ardennes': 700,
  'monaco-harbor': 750,
  'suzuka-eight': 800,
  'neo-wangan': 850,
};

export const CHAMPIONSHIP_TRACK_ORDER: readonly TrackId[] = [
  'montmelo',
  'sierra-seca',
  'spa-ardennes',
  'monaco-harbor',
  'suzuka-eight',
  'neo-wangan',
];

export const FIA_POINTS_BY_POSITION: Record<1 | 2 | 3 | 4, number> = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
};

export const LICENSE_CHALLENGES: readonly LicenseChallengeSpec[] = [
  {
    id: 'lic-b1',
    code: 'B-1',
    title: 'Montmeló Sprint FIA',
    subtitle: '1 vuelta lanzada limpia en seco con Imán GT',
    trackId: 'montmelo',
    weatherMode: 'dry',
    magnetMode: 'gt-magnet',
    goldMs: 19600,
    silverMs: 21600,
    bronzeMs: 24800,
    rewardGoldGp: 400,
  },
  {
    id: 'lic-b2',
    code: 'B-2',
    title: 'Catalunya Wood Drift',
    subtitle: 'Control de trasera sin imán (Modo Wood) en Montmeló',
    trackId: 'montmelo',
    weatherMode: 'dry',
    magnetMode: 'wood-free',
    goldMs: 20400,
    silverMs: 22600,
    bronzeMs: 26000,
    rewardGoldGp: 450,
  },
  {
    id: 'lic-a1',
    code: 'A-1',
    title: 'Sacacorchos Sierra Seca',
    subtitle: 'Trazada de montaña y frenada en pendiente',
    trackId: 'sierra-seca',
    weatherMode: 'dry',
    magnetMode: 'gt-magnet',
    goldMs: 20800,
    silverMs: 22900,
    bronzeMs: 26200,
    rewardGoldGp: 500,
  },
  {
    id: 'lic-a2',
    code: 'A-2',
    title: 'Eau Rouge & Raidillon (Spa)',
    subtitle: 'Subida a fondo de +16.4 m y recta Kemmel en las Ardenas',
    trackId: 'spa-ardennes',
    weatherMode: 'dry',
    magnetMode: 'gt-magnet',
    goldMs: 21200,
    silverMs: 23500,
    bronzeMs: 27000,
    rewardGoldGp: 600,
  },
  {
    id: 'lic-a3',
    code: 'A-3',
    title: 'Monaco Harbor & Túnel',
    subtitle: 'Precisión milimétrica en Fairmont Hairpin y el Túnel Marino',
    trackId: 'monaco-harbor',
    weatherMode: 'dry',
    magnetMode: 'gt-magnet',
    goldMs: 19800,
    silverMs: 22000,
    bronzeMs: 25400,
    rewardGoldGp: 650,
  },
  {
    id: 'lic-s1',
    code: 'S-1',
    title: 'Suzuka Figure-8 Crossover',
    subtitle: 'Esses técnicas enlazadas, puente en 8 y curvón 130R',
    trackId: 'suzuka-eight',
    weatherMode: 'dry',
    magnetMode: 'gt-magnet',
    goldMs: 22400,
    silverMs: 24800,
    bronzeMs: 28400,
    rewardGoldGp: 750,
  },
  {
    id: 'lic-s2',
    code: 'S-2',
    title: 'Superlicencia FIA · Wangan Wood Wet',
    subtitle: 'El examen definitivo: Sin Imán (Wood) + Lluvia Nocturna en Tokio',
    trackId: 'neo-wangan',
    weatherMode: 'rain',
    magnetMode: 'wood-free',
    goldMs: 22900,
    silverMs: 25400,
    bronzeMs: 29200,
    rewardGoldGp: 950,
  },
];

export const INITIAL_CHAMPIONSHIP_STANDINGS: readonly ChampionshipStandingRow[] = [
  { driverId: 'player', name: 'Tú (Piloto Oficial)', isPlayer: true, points: 0, wins: 0 },
  { driverId: 'ai-1', name: 'Kai · Huracán GT3', isPlayer: false, points: 0, wins: 0 },
  { driverId: 'ai-2', name: 'Mako · Senna GTR', isPlayer: false, points: 0, wins: 0 },
  { driverId: 'ai-3', name: 'Viktor · Skyline R34', isPlayer: false, points: 0, wins: 0 },
];

export const PAINT_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  hex: number | null;
  cssHex: string;
}> = [
  { id: 'oem', label: 'Original de Fábrica', hex: null, cssHex: '#64748B' },
  { id: 'rosso-corsa', label: 'Rosso Corsa', hex: 0xd91b2e, cssHex: '#D91B2E' },
  { id: 'bayside-blue', label: 'Bayside Blue', hex: 0x1d4ed8, cssHex: '#1D4ED8' },
  { id: 'giallo-modena', label: 'Giallo Modena', hex: 0xeab308, cssHex: '#EAB308' },
  { id: 'papaya-orange', label: 'Papaya Orange', hex: 0xf97316, cssHex: '#F97316' },
  { id: 'british-green', label: 'British Racing Green', hex: 0x065f46, cssHex: '#065F46' },
  { id: 'gulf-cyan', label: 'Liquid Cyan GT', hex: 0x0284c7, cssHex: '#0284C7' },
  { id: 'championship-white', label: 'Championship White', hex: 0xf1f5f9, cssHex: '#F1F5F9' },
  { id: 'carbon-stealth', label: 'Carbon Stealth', hex: 0x1e293b, cssHex: '#1E293B' },
  { id: 'ultraviolet-gt', label: 'Ultraviolet GT3', hex: 0x7c3aed, cssHex: '#7C3AED' },
];

export const RIM_STYLE_PRESETS: ReadonlyArray<{
  id: CustomRimStyleOption;
  label: string;
  subtitle: string;
}> = [
  { id: 'default', label: 'Original OEM', subtitle: 'Llanta de serie del chasis' },
  { id: 'mesh', label: 'BBS Forged Mesh', subtitle: '10 radios cruzados GT3 Endurance' },
  { id: 'split', label: 'GT3 Split-Spoke', subtitle: '5 brazos dobles en V con tuerca central' },
  { id: 'turbine', label: 'Hyper Aero Turbine', subtitle: '10 álabes direccionales ventilados' },
  { id: 'blade', label: 'Directional Blade', subtitle: '5 aspas aerodinámicas Le Mans' },
  { id: 'classic', label: 'JDM Forged 6-Spoke', subtitle: '6 radios cóncavos estilo TE37 Time Attack' },
  { id: 'cover', label: 'F1 Aero Carbon Cover', subtitle: 'Tapacubos lenticular FIA de fibra de carbono' },
];

export const RIM_COLOR_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  hex: number | null;
  cssHex: string;
}> = [
  { id: 'oem', label: 'Original', hex: null, cssHex: '#64748B' },
  { id: 'bbs-gold', label: 'Oro Forjado BBS', hex: 0xd4af37, cssHex: '#D4AF37' },
  { id: 'forged-silver', label: 'Plata Forjado', hex: 0xdbe4ee, cssHex: '#DBE4EE' },
  { id: 'volk-bronze', label: 'Bronce Time Attack', hex: 0x926c44, cssHex: '#926C44' },
  { id: 'gunmetal', label: 'Titanio Gunmetal', hex: 0x475569, cssHex: '#475569' },
  { id: 'satin-black', label: 'Negro Satinado', hex: 0x1e293b, cssHex: '#1E293B' },
];

export const CALIPER_COLOR_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  hex: number | null;
  cssHex: string;
}> = [
  { id: 'oem', label: 'Original', hex: null, cssHex: '#64748B' },
  { id: 'brembo-red', label: 'Rojo Brembo', hex: 0xef4444, cssHex: '#EF4444' },
  { id: 'ceramic-gold', label: 'Amarillo Cerámico', hex: 0xfacc15, cssHex: '#FACC15' },
  { id: 'acid-green', label: 'Verde Acid Hybrid', hex: 0x22c55e, cssHex: '#22C55E' },
  { id: 'endurance-blue', label: 'Azul Nismo / Ford', hex: 0x0284c7, cssHex: '#0284C7' },
  { id: 'papaya-caliper', label: 'Naranja McLaren', hex: 0xf97316, cssHex: '#F97316' },
];

const DEFAULT_VISUAL_CONFIG: VisualCustomizationConfig = {
  paintHex: null,
  paintFinish: 'gloss-clearcoat',
  rimStyle: 'default',
  rimColorHex: null,
  caliperColorHex: null,
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
  visualConfig?: VisualCustomizationConfig;
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

    const parsedVis = parsed.visualConfig;
    const visualConfig: VisualCustomizationConfig = {
      paintHex:
        typeof parsedVis?.paintHex === 'number' ? parsedVis.paintHex : null,
      paintFinish:
        parsedVis?.paintFinish === 'satin-matte'
          ? ('satin-matte' as PaintFinishType)
          : ('gloss-clearcoat' as PaintFinishType),
      rimStyle:
        parsedVis?.rimStyle &&
        ['default', 'mesh', 'split', 'turbine', 'cover', 'classic', 'blade'].includes(
          parsedVis.rimStyle
        )
          ? parsedVis.rimStyle
          : 'default',
      rimColorHex:
        typeof parsedVis?.rimColorHex === 'number'
          ? parsedVis.rimColorHex
          : null,
      caliperColorHex:
        typeof parsedVis?.caliperColorHex === 'number'
          ? parsedVis.caliperColorHex
          : null,
    };

    return {
      gpCredits:
        typeof parsed.gpCredits === 'number' && Number.isFinite(parsed.gpCredits)
          ? Math.max(0, Math.round(parsed.gpCredits))
          : INITIAL_GP_CREDITS,
      unlockedPartIds: mergedUnlocked,
      sandboxUnlocked: true,
      loadout: parsed.loadout ?? initialLoadout,
      visualConfig,
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
      visualConfig: overrides?.visualConfig ?? state.visualConfig,
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
    visualConfig: DEFAULT_VISUAL_CONFIG,
    gpCredits: INITIAL_GP_CREDITS,
    unlockedPartIds: DEFAULT_UNLOCKED_IDS,
    sandboxUnlocked: true,
    isGarageOpen: false,
    isHydrated: false,

    setGarageOpen: (open: boolean) => set({ isGarageOpen: open }),

    updateVisualConfig: (partial: Partial<VisualCustomizationConfig>) => {
      const nextVisual: VisualCustomizationConfig = {
        ...get().visualConfig,
        ...partial,
      };
      set({ visualConfig: nextVisual });
      persistCurrentGarage({ visualConfig: nextVisual });
    },

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
        visualConfig: persisted?.visualConfig ?? DEFAULT_VISUAL_CONFIG,
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
type BestSpeedTracesMap = Record<TrackId, readonly number[]>;

interface PersistedRecordsPayload {
  bestLaps: BestLapsMap;
  bestSectors: BestSectorsMap;
  bestSpeedTraces: BestSpeedTracesMap;
}

const DEFAULT_BEST_LAPS: BestLapsMap = {
  montmelo: null,
  'sierra-seca': null,
  'neo-wangan': null,
  'spa-ardennes': null,
  'monaco-harbor': null,
  'suzuka-eight': null,
};

const DEFAULT_BEST_SECTORS: BestSectorsMap = {
  montmelo: [null, null, null],
  'sierra-seca': [null, null, null],
  'neo-wangan': [null, null, null],
  'spa-ardennes': [null, null, null],
  'monaco-harbor': [null, null, null],
  'suzuka-eight': [null, null, null],
};

const DEFAULT_BEST_SPEED_TRACES: BestSpeedTracesMap = {
  montmelo: [],
  'sierra-seca': [],
  'neo-wangan': [],
  'spa-ardennes': [],
  'monaco-harbor': [],
  'suzuka-eight': [],
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
      bestSectors: { ...DEFAULT_BEST_SECTORS },
      bestSpeedTraces: { ...DEFAULT_BEST_SPEED_TRACES },
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

      const sanitizeTrace = (arr: unknown): readonly number[] => {
        if (!Array.isArray(arr)) return [];
        return arr.filter(
          (v): v is number => typeof v === 'number' && Number.isFinite(v)
        );
      };

      const numOrNull = (val: unknown): number | null =>
        typeof val === 'number' ? val : null;

      return {
        bestLaps: {
          montmelo: numOrNull(parsed.bestLaps?.montmelo),
          'sierra-seca': numOrNull(parsed.bestLaps?.['sierra-seca']),
          'neo-wangan': numOrNull(parsed.bestLaps?.['neo-wangan']),
          'spa-ardennes': numOrNull(parsed.bestLaps?.['spa-ardennes']),
          'monaco-harbor': numOrNull(parsed.bestLaps?.['monaco-harbor']),
          'suzuka-eight': numOrNull(parsed.bestLaps?.['suzuka-eight']),
        },
        bestSectors: {
          montmelo: sanitizeTuple(parsed.bestSectors?.montmelo),
          'sierra-seca': sanitizeTuple(parsed.bestSectors?.['sierra-seca']),
          'neo-wangan': sanitizeTuple(parsed.bestSectors?.['neo-wangan']),
          'spa-ardennes': sanitizeTuple(parsed.bestSectors?.['spa-ardennes']),
          'monaco-harbor': sanitizeTuple(parsed.bestSectors?.['monaco-harbor']),
          'suzuka-eight': sanitizeTuple(parsed.bestSectors?.['suzuka-eight']),
        },
        bestSpeedTraces: {
          montmelo: sanitizeTrace(parsed.bestSpeedTraces?.montmelo),
          'sierra-seca': sanitizeTrace(parsed.bestSpeedTraces?.['sierra-seca']),
          'neo-wangan': sanitizeTrace(parsed.bestSpeedTraces?.['neo-wangan']),
          'spa-ardennes': sanitizeTrace(parsed.bestSpeedTraces?.['spa-ardennes']),
          'monaco-harbor': sanitizeTrace(parsed.bestSpeedTraces?.['monaco-harbor']),
          'suzuka-eight': sanitizeTrace(parsed.bestSpeedTraces?.['suzuka-eight']),
        },
      };
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_BEST_LAPS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Partial<BestLapsMap>;
      return {
        bestLaps: {
          ...DEFAULT_BEST_LAPS,
          montmelo: typeof legacy.montmelo === 'number' ? legacy.montmelo : null,
          'sierra-seca':
            typeof legacy['sierra-seca'] === 'number'
              ? legacy['sierra-seca']
              : null,
        },
        bestSectors: { ...DEFAULT_BEST_SECTORS },
        bestSpeedTraces: { ...DEFAULT_BEST_SPEED_TRACES },
      };
    }
  } catch {
    // Ignorar error de parseo
  }

  return {
    bestLaps: { ...DEFAULT_BEST_LAPS },
    bestSectors: { ...DEFAULT_BEST_SECTORS },
    bestSpeedTraces: { ...DEFAULT_BEST_SPEED_TRACES },
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

function createInitialLicenseProgress(): Record<string, LicenseProgressRecord> {
  const base: Record<string, LicenseProgressRecord> = {};
  for (const lic of LICENSE_CHALLENGES) {
    base[lic.id] = { medal: 'none', bestTimeMs: null };
  }
  return base;
}

function loadPersistedLicenseProgress(): Record<string, LicenseProgressRecord> {
  const fallback = createInitialLicenseProgress();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<
      string,
      Partial<LicenseProgressRecord>
    >;
    for (const lic of LICENSE_CHALLENGES) {
      const entry = parsed?.[lic.id];
      if (entry) {
        const medal: LicenseMedalGrade =
          entry.medal === 'gold' ||
          entry.medal === 'silver' ||
          entry.medal === 'bronze'
            ? entry.medal
            : 'none';
        const bestTimeMs =
          typeof entry.bestTimeMs === 'number' &&
          Number.isFinite(entry.bestTimeMs)
            ? entry.bestTimeMs
            : null;
        fallback[lic.id] = { medal, bestTimeMs };
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function savePersistedLicenseProgress(
  progress: Readonly<Record<string, LicenseProgressRecord>>
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignorar cuota
  }
}

const MEDAL_RANK: Record<LicenseMedalGrade, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

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
  totalCarsInRace: 2,
  rivalLapCount: 1,
  liveGridStandings: [],
  tireTempsC: [56, 56, 56, 56],
  tireThermalGripFactor: 0.96,
};

/**
 * STORE 2: TELEMETRÍA EN TIEMPO REAL, 5 MODOS SINGLE-PLAYER Y SEMÁFORO F1
 */
export const useTelemetryStore = create<TelemetryStoreState>((set, get) => {
  const ensureRecordsLoaded = (): PersistedRecordsPayload => {
    const state = get();
    if (recordsHydrated) {
      return {
        bestLaps: state.bestLapByTrack,
        bestSectors: state.bestSectorsByTrack,
        bestSpeedTraces: state.bestLapSpeedTracesByTrack,
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
    raceMode: 'grand-prix',
    appScreen: 'main-menu',
    totalCarsInRace: 4,
    cupStartPhase: 'countdown',
    countdownLights: 1,
    cupTargetLaps: 3,
    cupWinner: null,
    cupRewardGp: 0,
    leaderFinishedTimerSec: null,
    playerDidNotFinish: false,
    activeLicenseId: LICENSE_CHALLENGES[0].id,
    licenseProgress: loadPersistedLicenseProgress(),
    lastLicenseResult: null,
    championshipRoundIndex: 0,
    championshipCompleted: false,
    championshipStandings: INITIAL_CHAMPIONSHIP_STANDINGS,
    overVoltTriggerNonce: 0,
    resetNonce: 0,
    ghostVersionNonce: 0,
    bestLapByTrack: { ...DEFAULT_BEST_LAPS },
    bestSectorsByTrack: { ...DEFAULT_BEST_SECTORS },
    currentSectors: EMPTY_SECTOR_SPLITS,
    lastLapSummary: null,
    lastLapSpeedTrace: [],
    bestLapSpeedTracesByTrack: { ...DEFAULT_BEST_SPEED_TRACES },
    telemetryPanelOpen: false,

    updateTelemetry: (partial) => set(partial),

    toggleTelemetryPanel: () =>
      set((state) => ({ telemetryPanelOpen: !state.telemetryPanelOpen })),

    recordSectorSplit: (sectorIndex: 0 | 1 | 2, sectorTimeMs: number) => {
      const state = get();
      const { bestLaps, bestSectors, bestSpeedTraces } = ensureRecordsLoaded();
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
          bestSpeedTraces,
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
        bestLapSpeedTracesByTrack: bestSpeedTraces,
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
      speedTraceKmh,
    }) => {
      const state = get();
      const { bestLaps, bestSectors, bestSpeedTraces } = ensureRecordsLoaded();

      const prevBest = bestLaps[state.trackId];
      const isNewBest = prevBest === null || lapTimeMs < prevBest;
      const nextBest = isNewBest ? lapTimeMs : prevBest;

      const updatedBestLaps: BestLapsMap = {
        ...bestLaps,
        [state.trackId]: nextBest,
      };

      const cleanTrace =
        Array.isArray(speedTraceKmh) && speedTraceKmh.length > 0
          ? [...speedTraceKmh]
          : state.lastLapSpeedTrace;

      const updatedBestTraces: BestSpeedTracesMap =
        isNewBest && cleanTrace.length > 0
          ? {
              ...bestSpeedTraces,
              [state.trackId]: cleanTrace,
            }
          : bestSpeedTraces;

      savePersistedRecords({
        bestLaps: updatedBestLaps,
        bestSectors,
        bestSpeedTraces: updatedBestTraces,
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
        lastLapSpeedTrace: cleanTrace,
        bestLapSpeedTracesByTrack: updatedBestTraces,
        lastLapSummary: summary,
      });

      return summary;
    },

    bumpGhostVersion: () =>
      set((state) => ({
        ghostVersionNonce: state.ghostVersionNonce + 1,
      })),

    setAppScreen: (screen: AppScreenMode) => {
      useGarageStore.getState().setGarageOpen(false);
      const state = get();
      const { bestLaps } = ensureRecordsLoaded();

      set({
        appScreen: screen,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: false,
        lastLicenseResult: null,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        currentLapTimeMs: 0,
        bestLapTimeMs: bestLaps[state.trackId],
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
      });
    },

    setTrackId: (trackId: TrackId) => {
      const { bestLaps, bestSectors, bestSpeedTraces } = ensureRecordsLoaded();

      set((state) => ({
        trackId,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: false,
        lastLicenseResult: null,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        currentLapTimeMs: 0,
        lastLapTimeMs: null,
        bestLapTimeMs: bestLaps[trackId],
        bestLapByTrack: bestLaps,
        bestSectorsByTrack: bestSectors,
        bestLapSpeedTracesByTrack: bestSpeedTraces,
        lastLapSpeedTrace: [],
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
      const state = get();
      const { bestLaps } = ensureRecordsLoaded();

      let nextTrackId = state.trackId;
      let nextWeather = state.weatherMode;
      let nextMagnet = state.magnetMode;
      let targetLaps = 3;
      let totalCars: 1 | 2 | 4 = 1;

      if (mode === 'vs-ai') {
        totalCars = 2;
        targetLaps = 3;
      } else if (mode === 'grand-prix') {
        totalCars = 4;
        targetLaps = 3;
      } else if (mode === 'championship') {
        totalCars = 4;
        targetLaps = 3;
        nextTrackId = CHAMPIONSHIP_TRACK_ORDER[state.championshipRoundIndex];
      } else if (mode === 'license-school') {
        totalCars = 1;
        targetLaps = 1;
        const activeChallenge =
          LICENSE_CHALLENGES.find((c) => c.id === state.activeLicenseId) ??
          LICENSE_CHALLENGES[0];
        nextTrackId = activeChallenge.trackId;
        nextWeather = activeChallenge.weatherMode;
        nextMagnet = activeChallenge.magnetMode;
      }

      set({
        raceMode: mode,
        trackId: nextTrackId,
        weatherMode: nextWeather,
        magnetMode: nextMagnet,
        rivalEnabled:
          mode === 'vs-ai' || mode === 'grand-prix' || mode === 'championship',
        totalCarsInRace: totalCars,
        cupTargetLaps: targetLaps,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: false,
        lastLicenseResult: null,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        playerRacePosition: totalCars === 4 ? 4 : 1,
        gapToRivalM: 0,
        currentLapTimeMs: 0,
        bestLapTimeMs: bestLaps[nextTrackId],
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
      });
    },

    selectLicenseChallenge: (challengeId: string) => {
      const challenge =
        LICENSE_CHALLENGES.find((c) => c.id === challengeId) ??
        LICENSE_CHALLENGES[0];
      const { bestLaps } = ensureRecordsLoaded();

      set((state) => ({
        raceMode: 'license-school',
        activeLicenseId: challenge.id,
        trackId: challenge.trackId,
        weatherMode: challenge.weatherMode,
        magnetMode: challenge.magnetMode,
        rivalEnabled: false,
        totalCarsInRace: 1,
        cupTargetLaps: 1,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: false,
        lastLicenseResult: null,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        currentLapTimeMs: 0,
        bestLapTimeMs: bestLaps[challenge.trackId],
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
      }));
    },

    completeLicenseAttempt: (lapTimeMs: number, derailed: boolean) => {
      const state = get();
      if (
        state.raceMode !== 'license-school' ||
        state.cupStartPhase === 'finished'
      ) {
        return;
      }

      const challenge =
        LICENSE_CHALLENGES.find((c) => c.id === state.activeLicenseId) ??
        LICENSE_CHALLENGES[0];

      let achievedMedal: LicenseMedalGrade = 'none';
      if (!derailed) {
        if (lapTimeMs <= challenge.goldMs) {
          achievedMedal = 'gold';
        } else if (lapTimeMs <= challenge.silverMs) {
          achievedMedal = 'silver';
        } else if (lapTimeMs <= challenge.bronzeMs) {
          achievedMedal = 'bronze';
        }
      }

      const currentProgress =
        state.licenseProgress[challenge.id] ?? {
          medal: 'none',
          bestTimeMs: null,
        };

      const isNewBest =
        !derailed &&
        (currentProgress.bestTimeMs === null ||
          lapTimeMs < currentProgress.bestTimeMs);

      const nextBestTime = isNewBest ? lapTimeMs : currentProgress.bestTimeMs;
      const nextBestMedal =
        MEDAL_RANK[achievedMedal] > MEDAL_RANK[currentProgress.medal]
          ? achievedMedal
          : currentProgress.medal;

      const updatedProgress: Record<string, LicenseProgressRecord> = {
        ...state.licenseProgress,
        [challenge.id]: {
          medal: nextBestMedal,
          bestTimeMs: nextBestTime,
        },
      };
      savePersistedLicenseProgress(updatedProgress);

      const earnedGp =
        achievedMedal === 'gold'
          ? challenge.rewardGoldGp
          : achievedMedal === 'silver'
            ? Math.round(challenge.rewardGoldGp * 0.6)
            : achievedMedal === 'bronze'
              ? Math.round(challenge.rewardGoldGp * 0.35)
              : 0;

      if (earnedGp > 0) {
        useGarageStore.getState().addGpCredits(earnedGp);
      }

      const summary: LicenseAttemptSummary = {
        challengeId: challenge.id,
        timeMs: lapTimeMs,
        medal: achievedMedal,
        isNewBest,
        earnedGp,
        failedByDerail: derailed,
      };

      set({
        cupStartPhase: 'finished',
        licenseProgress: updatedProgress,
        lastLicenseResult: summary,
      });
    },

    notifyAiLeaderFinished: () => {
      const state = get();
      if (
        state.cupStartPhase !== 'finished' &&
        state.leaderFinishedTimerSec === null
      ) {
        set({ leaderFinishedTimerSec: 30 });
      }
    },

    finishGridRace: (
      finalStandings: readonly GridStandingRow[],
      didNotFinish = false
    ) => {
      const state = get();
      if (state.cupStartPhase === 'finished') return;

      const playerRow = finalStandings.find((r) => r.isPlayer);
      const playerPos: 1 | 2 | 3 | 4 = didNotFinish
        ? 4
        : (playerRow?.position ?? 4);
      const isPlayerWinner = !didNotFinish && playerPos === 1;
      const qualifiedOnPodium = !didNotFinish && playerPos <= 3;

      const basePrize = CUP_VICTORY_PRIZE_BY_TRACK[state.trackId];
      const reward = didNotFinish
        ? 0
        : playerPos === 1
          ? basePrize
          : playerPos === 2
            ? Math.round(basePrize * 0.65)
            : playerPos === 3
              ? Math.round(basePrize * 0.45)
              : 140;

      if (reward > 0) {
        useGarageStore.getState().addGpCredits(reward);
      }

      if (state.raceMode === 'championship') {
        // Solo se consolidan puntos de la ronda si el jugador logra Podio (P1-P3) dentro del tiempo límite
        if (!qualifiedOnPodium) {
          set({
            cupStartPhase: 'finished',
            cupWinner: 'rival',
            cupRewardGp: 0,
            leaderFinishedTimerSec: null,
            playerDidNotFinish: didNotFinish,
            playerRacePosition: playerPos,
            liveGridStandings: finalStandings,
            championshipCompleted: false,
          });
          return;
        }

        const updatedChampionship = state.championshipStandings
          .map((row) => {
            const match = finalStandings.find(
              (s) => s.driverId === row.driverId
            );
            const pos: 1 | 2 | 3 | 4 = match?.position ?? 4;
            const addPts = FIA_POINTS_BY_POSITION[pos];
            return {
              ...row,
              points: row.points + addPts,
              wins: row.wins + (pos === 1 ? 1 : 0),
            };
          })
          .sort((a, b) => b.points - a.points || b.wins - a.wins);

        const isFinalRound =
          state.championshipRoundIndex >= CHAMPIONSHIP_TRACK_ORDER.length - 1;
        if (isFinalRound && updatedChampionship[0]?.isPlayer) {
          useGarageStore.getState().addGpCredits(1500);
        }

        set({
          cupStartPhase: 'finished',
          cupWinner: isPlayerWinner ? 'player' : 'rival',
          cupRewardGp: reward,
          leaderFinishedTimerSec: null,
          playerDidNotFinish: false,
          playerRacePosition: playerPos,
          liveGridStandings: finalStandings,
          championshipStandings: updatedChampionship,
          championshipCompleted: isFinalRound,
        });
        return;
      }

      set({
        cupStartPhase: 'finished',
        cupWinner: isPlayerWinner ? 'player' : 'rival',
        cupRewardGp: reward,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: didNotFinish,
        playerRacePosition: playerPos,
        liveGridStandings: finalStandings,
      });
    },

    advanceChampionshipRound: () => {
      const state = get();
      if (state.playerDidNotFinish || state.playerRacePosition > 3) {
        return;
      }
      const maxRoundIdx = CHAMPIONSHIP_TRACK_ORDER.length - 1;
      const nextRound = Math.min(maxRoundIdx, state.championshipRoundIndex + 1);
      const nextTrack = CHAMPIONSHIP_TRACK_ORDER[nextRound];
      const { bestLaps } = ensureRecordsLoaded();

      set({
        raceMode: 'championship',
        championshipRoundIndex: nextRound,
        championshipCompleted: false,
        trackId: nextTrack,
        rivalEnabled: true,
        totalCarsInRace: 4,
        cupTargetLaps: 3,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: false,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        playerRacePosition: 4,
        gapToRivalM: 0,
        currentLapTimeMs: 0,
        bestLapTimeMs: bestLaps[nextTrack],
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
      });
    },

    restartChampionship: () => {
      const firstTrack = CHAMPIONSHIP_TRACK_ORDER[0];
      const { bestLaps } = ensureRecordsLoaded();

      set((state) => ({
        raceMode: 'championship',
        championshipRoundIndex: 0,
        championshipCompleted: false,
        championshipStandings: INITIAL_CHAMPIONSHIP_STANDINGS,
        trackId: firstTrack,
        rivalEnabled: true,
        totalCarsInRace: 4,
        cupTargetLaps: 3,
        cupStartPhase: 'countdown',
        countdownLights: 1,
        cupWinner: null,
        cupRewardGp: 0,
        leaderFinishedTimerSec: null,
        playerDidNotFinish: false,
        resetNonce: state.resetNonce + 1,
        lapCount: 1,
        rivalLapCount: 1,
        playerRacePosition: 4,
        gapToRivalM: 0,
        currentLapTimeMs: 0,
        bestLapTimeMs: bestLaps[firstTrack],
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
        leaderFinishedTimerSec: null,
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
        get().raceMode === 'time-trial' ? 'grand-prix' : 'time-trial';
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
        // En Escuela de Licencias, [R] siempre reinicia el intento desde el Semáforo F1
        if (state.isDerailed && state.raceMode !== 'license-school') {
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
          leaderFinishedTimerSec: null,
          playerDidNotFinish: false,
          lastLicenseResult: null,
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
