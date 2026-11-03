import type {
  BodyShellPart,
  CarLoadout,
  ChassisPart,
  ConsolidatedCarStats,
  EnginePart,
  GuideRollersPart,
  PartsCatalog,
  ResolvedLoadoutParts,
  TiresPart,
} from '@/types/types';

export const GRAVITY_MS2 = 9.81;
export const SLOT_GUIDE_DOWNFORCE_N = 3700;

const EFFECTIVE_WHEEL_RADIUS_M = 0.16;
const FINAL_DRIVE_RATIO = 6.25;
const DRIVETRAIN_TORQUE_FACTOR = 14.8;
const COG_LOAD_TRANSFER_FACTOR = 0.85;
const BASE_DRIFT_CEILING_RATIO = 1.4;
const BASE_GUIDE_RECOVERY_RATE = 2.9;

/**
 * Consolida las 5 piezas activas del garaje (incluyendo carrocerías custom .glb de la comunidad)
 * para calcular las estadísticas físicas finales del coche.
 */
export function consolidateCarStats(
  engine: EnginePart,
  tires: TiresPart,
  chassis: ChassisPart,
  body: BodyShellPart,
  rollers: GuideRollersPart
): ConsolidatedCarStats {
  const totalWeight =
    chassis.baseWeight +
    engine.weight +
    tires.weight +
    body.weight +
    rollers.weight;

  const wheelAngularRevPerSec = engine.maxRpm / 60 / FINAL_DRIVE_RATIO;
  const rawMaxSpeedMs =
    wheelAngularRevPerSec * (2 * Math.PI * EFFECTIVE_WHEEL_RADIUS_M);
  const torqueWeightFactor =
    0.94 + Math.min(0.12, (engine.torque / totalWeight) * 0.08);
  const maxSpeedKmh =
    rawMaxSpeedMs * torqueWeightFactor * body.aeroSpeedFactor * 3.6;

  const driveForceN = engine.torque * DRIVETRAIN_TORQUE_FACTOR;
  const accelerationMs2 = driveForceN / totalWeight;

  const normalForceN = totalWeight * GRAVITY_MS2 + SLOT_GUIDE_DOWNFORCE_N;
  const cogStabilityEfficiency =
    1 / (1 + COG_LOAD_TRANSFER_FACTOR * chassis.centerOfGravity);
  const totalGripN =
    tires.gripCoefficient * normalForceN * cogStabilityEfficiency;

  const aeroGripCoeff =
    tires.gripCoefficient * body.downforceCoeff * cogStabilityEfficiency;

  return {
    TotalWeight: Number(totalWeight.toFixed(2)),
    MaxSpeed: Number(maxSpeedKmh.toFixed(1)),
    Acceleration: Number(accelerationMs2.toFixed(2)),
    TotalGrip: Number(totalGripN.toFixed(1)),
    AeroDownforceCoeff: Number(aeroGripCoeff.toFixed(3)),
    DriftCeilingRatio: Number(
      (BASE_DRIFT_CEILING_RATIO + rollers.driftMarginBonus).toFixed(2)
    ),
    GuideRecoveryRate: Number(
      (BASE_GUIDE_RECOVERY_RATE + rollers.stressRecoveryBonus).toFixed(2)
    ),
    centerOfGravity: chassis.centerOfGravity,
    maxRpm: engine.maxRpm,
    modelPath: body.modelPath,
    modelYawOffsetRad: body.yawOffsetRad ?? 0,
  };
}

export function computeDynamicGripAtSpeed(
  stats: ConsolidatedCarStats,
  speedMs: number
): number {
  return stats.TotalGrip + stats.AeroDownforceCoeff * (speedMs * speedMs);
}

export function resolveLoadoutParts(
  catalog: PartsCatalog,
  loadout: CarLoadout,
  customBodies: readonly BodyShellPart[] = []
): ResolvedLoadoutParts {
  const allBodies = [...catalog.bodies, ...customBodies];
  const engine =
    catalog.engines.find((item) => item.id === loadout.engineId) ??
    catalog.engines[0];
  const tires =
    catalog.tires.find((item) => item.id === loadout.tiresId) ??
    catalog.tires[0];
  const chassis =
    catalog.chassis.find((item) => item.id === loadout.chassisId) ??
    catalog.chassis[0];
  const body =
    allBodies.find((item) => item.id === loadout.bodyId) ?? catalog.bodies[0];
  const rollers =
    catalog.rollers.find((item) => item.id === loadout.rollersId) ??
    catalog.rollers[0];

  if (!engine || !tires || !chassis || !body || !rollers) {
    throw new Error('El catálogo de piezas del garaje está incompleto.');
  }

  return { engine, tires, chassis, body, rollers };
}
