/**
 * Dominio completo v3.0 Motorsport Sim de Grip Limit:
 * - 2 Modos Oficiales: Contrarreloj (Solo + Ghost) y Modo VS IA (Duelo directo con Rival IA).
 * - Semáforo F1 de 5 Focos + Salida en Parrilla en todos los modos.
 * - Transmisión Secuencial de 6 Velocidades + Tacómetro RPM + 7 Coches Pro de 100k+ vértices desbloqueados al 100%.
 */

export type TrackId = 'montmelo' | 'sierra-seca' | 'neo-wangan';
export type LaneId = 'left' | 'right';
export type CameraMode = 'chase' | 'cockpit' | 'overhead';
export type EnvironmentStyle = 'realistic' | 'tabletop';
export type WeatherMode = 'dry' | 'rain';
export type RaceMode =
  | 'time-trial'
  | 'vs-ai'
  | 'grand-prix'
  | 'license-school'
  | 'championship';
export type MagnetMode = 'gt-magnet' | 'wood-free';
export type CupStartPhase = 'countdown' | 'green' | 'racing' | 'finished';
export type BrakeAdviceLevel = 'clear' | 'coast' | 'brake';
export type SectorColor = 'pending' | 'purple' | 'green' | 'amber';
export type LapMedalGrade = 'perfect' | 'drift-master' | 'clean' | 'completed';
export type LicenseMedalGrade = 'none' | 'bronze' | 'silver' | 'gold';
export type CustomAeroArchetype = 'balanced' | 'downforce' | 'topspeed';
export type PartCategory = 'bodies' | 'engines' | 'tires' | 'rollers' | 'chassis';

export interface LicenseChallengeSpec {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly subtitle: string;
  readonly trackId: TrackId;
  readonly weatherMode: WeatherMode;
  readonly magnetMode: MagnetMode;
  readonly goldMs: number;
  readonly silverMs: number;
  readonly bronzeMs: number;
  readonly rewardGoldGp: number;
}

export interface LicenseProgressRecord {
  readonly medal: LicenseMedalGrade;
  readonly bestTimeMs: number | null;
}

export interface GridStandingRow {
  readonly driverId: string;
  readonly name: string;
  readonly isPlayer: boolean;
  readonly position: 1 | 2 | 3 | 4;
  readonly lapCount: number;
  readonly gapToLeaderM: number;
  readonly lane: LaneId;
  readonly isDerailed: boolean;
}

export interface ChampionshipStandingRow {
  readonly driverId: string;
  readonly name: string;
  readonly isPlayer: boolean;
  readonly points: number;
  readonly wins: number;
}

export interface EnginePart {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxRpm: number;
  readonly torque: number;
  readonly weight: number;
  readonly price?: number;
}

export interface TiresPart {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly gripCoefficient: number;
  readonly weight: number;
  readonly price?: number;
}

export interface ChassisPart {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly baseWeight: number;
  readonly centerOfGravity: number;
  readonly price?: number;
}

export interface BodyShellPart {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modelPath: string;
  readonly weight: number;
  readonly downforceCoeff: number;
  readonly aeroSpeedFactor: number;
  readonly price?: number;
  readonly yawOffsetRad?: number;
  readonly isCustom?: boolean;
  readonly author?: string;
}

export interface GuideRollersPart {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weight: number;
  readonly driftMarginBonus: number;
  readonly stressRecoveryBonus: number;
  readonly price?: number;
}

export interface PartsCatalog {
  readonly engines: readonly EnginePart[];
  readonly tires: readonly TiresPart[];
  readonly chassis: readonly ChassisPart[];
  readonly bodies: readonly BodyShellPart[];
  readonly rollers: readonly GuideRollersPart[];
}

export interface CarLoadout {
  readonly engineId: string;
  readonly tiresId: string;
  readonly chassisId: string;
  readonly bodyId: string;
  readonly rollersId: string;
}

export interface ResolvedLoadoutParts {
  readonly engine: EnginePart;
  readonly tires: TiresPart;
  readonly chassis: ChassisPart;
  readonly body: BodyShellPart;
  readonly rollers: GuideRollersPart;
}

export interface ConsolidatedCarStats {
  readonly TotalWeight: number;
  readonly MaxSpeed: number;
  readonly Acceleration: number;
  readonly TotalGrip: number;
  readonly AeroDownforceCoeff: number;
  readonly DriftCeilingRatio: number;
  readonly GuideRecoveryRate: number;
  readonly centerOfGravity: number;
  readonly maxRpm: number;
  readonly modelPath: string;
  readonly modelYawOffsetRad: number;
}

export interface GarageStoreState {
  readonly catalog: PartsCatalog;
  readonly customBodies: readonly BodyShellPart[];
  readonly loadout: CarLoadout;
  readonly activeParts: ResolvedLoadoutParts;
  readonly carStats: ConsolidatedCarStats;
  readonly gpCredits: number;
  readonly unlockedPartIds: readonly string[];
  readonly sandboxUnlocked: boolean;
  readonly isGarageOpen: boolean;
  readonly isHydrated: boolean;
  hydrateGarage: () => Promise<void>;
  setGarageOpen: (open: boolean) => void;
  addGpCredits: (amount: number) => void;
  toggleSandboxUnlocked: () => void;
  selectOrBuyPart: (category: PartCategory, partId: string) => boolean;
  selectEngine: (engineId: string) => void;
  selectTires: (tiresId: string) => void;
  selectChassis: (chassisId: string) => void;
  selectBody: (bodyId: string) => void;
  selectRollers: (rollersId: string) => void;
  importCommunityCarGLB: (
    file: File,
    archetype: CustomAeroArchetype,
    authorName?: string
  ) => Promise<void>;
  rotateCommunityCarYaw: (bodyId: string) => Promise<void>;
  deleteCommunityCar: (bodyId: string) => Promise<void>;
}

export interface SectorSplitInfo {
  readonly timeMs: number | null;
  readonly color: SectorColor;
  readonly deltaMs: number | null;
}

export interface LapEvaluationSummary {
  readonly medal: LapMedalGrade;
  readonly title: string;
  readonly subtitle: string;
  readonly lapTimeMs: number;
  readonly earnedCredits: number;
  readonly isNewBest: boolean;
  readonly timestamp: number;
}

export interface TelemetrySnapshot {
  readonly speedMs: number;
  readonly speedKmh: number;
  readonly gear: number;
  readonly engineRpm: number;
  readonly lateralG: number;
  readonly centrifugalForce: number;
  readonly gripAvailable: number;
  readonly gripUsageRatio: number;
  readonly isDrifting: boolean;
  readonly driftAngleDeg: number;
  readonly guideStressRatio: number;
  readonly brakeAdvice: BrakeAdviceLevel;
  readonly recommendedCornerSpeedKmh: number | null;
  readonly curvatureRadius: number;
  readonly slopePercent: number;
  readonly lapProgress: number;
  readonly lapCount: number;
  readonly currentLapTimeMs: number;
  readonly lastLapTimeMs: number | null;
  readonly bestLapTimeMs: number | null;
  readonly isDerailed: boolean;
  readonly lastDerailForce: number;
  readonly throttleInput: number;
  readonly brakeInput: number;
  readonly slipstreamActive: boolean;
  readonly overVoltCharge: number;
  readonly overVoltActive: boolean;
  readonly falseStartPenalty: boolean;
  readonly turboStartActive: boolean;
  readonly gapToRivalM: number;
  readonly playerRacePosition: 1 | 2 | 3 | 4;
  readonly totalCarsInRace: 1 | 2 | 4;
  readonly rivalLapCount: number;
  readonly liveGridStandings: readonly GridStandingRow[];
  /** Temperaturas individuales de los 4 neumáticos [FL, FR, RL, RR] en °C */
  readonly tireTempsC: readonly [number, number, number, number];
  /** Multiplicador de agarre térmico actual (0.86 a 1.03) según ventana óptima (70-98 °C) */
  readonly tireThermalGripFactor: number;
}

export interface LicenseAttemptSummary {
  readonly challengeId: string;
  readonly timeMs: number;
  readonly medal: LicenseMedalGrade;
  readonly isNewBest: boolean;
  readonly earnedGp: number;
  readonly failedByDerail: boolean;
}

export interface TelemetryStoreState extends TelemetrySnapshot {
  readonly trackId: TrackId;
  readonly playerLane: LaneId;
  readonly magnetMode: MagnetMode;
  readonly rivalEnabled: boolean;
  readonly ghostEnabled: boolean;
  readonly assistEnabled: boolean;
  readonly soundEnabled: boolean;
  readonly cameraMode: CameraMode;
  readonly environmentStyle: EnvironmentStyle;
  readonly weatherMode: WeatherMode;
  readonly raceMode: RaceMode;
  readonly cupStartPhase: CupStartPhase;
  readonly countdownLights: 0 | 1 | 2 | 3 | 4 | 5;
  readonly cupTargetLaps: number;
  readonly cupWinner: 'player' | 'rival' | null;
  readonly cupRewardGp: number;
  readonly activeLicenseId: string;
  readonly licenseProgress: Readonly<Record<string, LicenseProgressRecord>>;
  readonly lastLicenseResult: LicenseAttemptSummary | null;
  readonly championshipRoundIndex: 0 | 1 | 2;
  readonly championshipCompleted: boolean;
  readonly championshipStandings: readonly ChampionshipStandingRow[];
  readonly overVoltTriggerNonce: number;
  readonly resetNonce: number;
  readonly ghostVersionNonce: number;
  readonly bestLapByTrack: Record<TrackId, number | null>;
  readonly bestSectorsByTrack: Record<
    TrackId,
    [number | null, number | null, number | null]
  >;
  readonly currentSectors: readonly [
    SectorSplitInfo,
    SectorSplitInfo,
    SectorSplitInfo,
  ];
  readonly lastLapSummary: LapEvaluationSummary | null;
  updateTelemetry: (partial: Partial<TelemetrySnapshot>) => void;
  recordSectorSplit: (sectorIndex: 0 | 1 | 2, sectorTimeMs: number) => SectorColor;
  completeEvaluatedLap: (params: {
    lapTimeMs: number;
    derailCount: number;
    maxGuideStress: number;
    driftScoreSec: number;
    purpleSectorsInLap: number;
    goldTargetMs: number;
  }) => LapEvaluationSummary;
  bumpGhostVersion: () => void;
  setTrackId: (trackId: TrackId) => void;
  setRaceMode: (mode: RaceMode) => void;
  selectLicenseChallenge: (challengeId: string) => void;
  completeLicenseAttempt: (lapTimeMs: number, derailed: boolean) => void;
  finishGridRace: (finalStandings: readonly GridStandingRow[]) => void;
  advanceChampionshipRound: () => void;
  restartChampionship: () => void;
  startCupRace: () => void;
  exitCupRace: () => void;
  setCupCountdownState: (
    phase: CupStartPhase,
    lights: 0 | 1 | 2 | 3 | 4 | 5
  ) => void;
  finishCupRace: (winner: 'player' | 'rival') => void;
  triggerOverVolt: () => void;
  toggleMagnetMode: () => void;
  toggleWeatherMode: () => void;
  togglePlayerLane: () => void;
  toggleRival: () => void;
  toggleGhost: () => void;
  toggleAssist: () => void;
  toggleSound: () => void;
  toggleCameraMode: () => void;
  toggleEnvironmentStyle: () => void;
  requestTrackReset: () => void;
}
