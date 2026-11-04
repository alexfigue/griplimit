'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CarModel, type CarVisualMotionState } from '@/components/canvas/CarModel';
import { PredictiveBrakingLine } from '@/components/canvas/PredictiveBrakingLine';
import {
  buildLiveGridStandings,
  livePlayerProgress,
  liveRivalGridState,
  liveRivalState,
} from '@/components/canvas/RivalCar';
import {
  SkidmarksRibbon,
  type SkidmarkEmitterState,
} from '@/components/canvas/SkidmarksRibbon';
import { useControls } from '@/hooks/useControls';
import { computeDynamicGripAtSpeed, GRAVITY_MS2 } from '@/lib/carStats';
import {
  ActiveLapGhostBuffer,
  liveLapClock,
  saveBestGhostForTrack,
} from '@/lib/ghostRecorder';
import {
  CIRCUITS,
  computeEffectiveLaneRadius,
  evaluateSplineKinematics,
  getLaneLateralOffsetM,
  getTrackCurve,
  getTrackLUT,
  scanUpcomingBrakingAdvice,
  type SplineKinematicsResult,
} from '@/lib/montmeloSpline';
import { soundEngine } from '@/lib/soundEngine';
import { useGarageStore, useTelemetryStore } from '@/store/store';

const SLOT_BRAKE_DECEL_MS2 = 34.0;
const ENGINE_COAST_BRAKE_MS2 = 7.2;
const AERO_DRAG_COEFF = 0.0022;
const DERAIL_RECOVERY_SECONDS = 1.75;
const GRAVEL_DECEL_MS2 = 25.0;

const DRIFT_ONSET_GRIP_RATIO = 0.85;
const DRIFT_FULL_ANGLE_RATIO = 1.28;
const MAX_SLOT_DRIFT_YAW_RAD = 0.52;
const DRIFT_TIRE_SCRUB_DECEL_MS2 = 16.5;

const BASE_CAMERA_FOV = 52;
const MAX_SPEED_FOV_BOOST = 9.5;

/** Relaciones de velocidad máxima por marcha (1ª a 6ª) respecto a la punta del vehículo */
const GEAR_TOP_SPEED_RATIOS = [0.25, 0.42, 0.58, 0.73, 0.87, 1.0] as const;
const GEAR_TORQUE_MULTIPLIERS = [1.32, 1.18, 1.06, 0.96, 0.88, 0.8] as const;

interface InternalPhysicsState {
  distanceM: number;
  speedMs: number;
  gear: number;
  engineRpm: number;
  smoothedThrottle: number;
  lateralOffsetM: number;
  guideStress: number;
  isDerailed: boolean;
  derailTimerSec: number;
  derailPosition: THREE.Vector3;
  derailVelocity: THREE.Vector3;
  derailForwardSpeedMs: number;
  derailLateralM: number;
  derailLateralVelMs: number;
  derailVerticalY: number;
  derailVerticalVelMs: number;
  derailYawAngleRad: number;
  derailYawVelRad: number;
  derailRollVelRad: number;
  derailPitchVelRad: number;
  derailVaultedBarrier: boolean;
  peakDerailForceN: number;
  lapCount: number;
  lapTimeMs: number;
  derailCountInLap: number;
  maxGuideStressInLap: number;
  driftScoreSecInLap: number;
  sectorStage: 0 | 1 | 2;
  sectorSplitStartMs: number;
  purpleSectorsInLap: number;
  countdownStepTimerSec: number;
  lightsOutHoldDurationSec: number;
  greenElapsedSec: number;
  turboStartTimerSec: number;
  overVoltCharge: number;
  overVoltTimerSec: number;
  tireTempsC: [number, number, number, number];
  tireThermalGripFactor: number;
  lapSpeedTraceKmh: number[];
  uiSyncAccumulatorSec: number;
}

const _kinematics: SplineKinematicsResult = {
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  outwardNormal: new THREE.Vector3(),
  curvature: 0,
  curvatureRadius: Infinity,
  turnSign: 0,
};
const _laneWorldPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredCamLook = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Motor físico Motorsport v3.0:
 * - Caja de cambios secuencial de 6 velocidades con curva real de RPM, corte de inyección y transferencia de masas (Pitch & Roll).
 * - Semáforo F1 de 5 focos activo en todas las salidas (Contrarreloj y Modo VS IA).
 * - 3 Cámaras de Simulador: Persecución Baja GT3, Cámara Capó/Cockpit y Cenital.
 */
export function PhysicsCar() {
  const carGroupRef = useRef<THREE.Group>(null);
  const controlsRef = useControls();
  const ghostBufferRef = useRef<ActiveLapGhostBuffer>(
    new ActiveLapGhostBuffer()
  );

  const carStats = useGarageStore((state) => state.carStats);
  const visualConfig = useGarageStore((state) => state.visualConfig);
  const activeTireId = useGarageStore((state) => state.loadout.tiresId);
  const trackId = useTelemetryStore((state) => state.trackId);
  const playerLane = useTelemetryStore((state) => state.playerLane);
  const resetNonce = useTelemetryStore((state) => state.resetNonce);
  const overVoltTriggerNonce = useTelemetryStore(
    (state) => state.overVoltTriggerNonce
  );

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const trackLUT = useMemo(() => getTrackLUT(trackId), [trackId]);
  const trackLengthM = useMemo(() => curve.getLength(), [curve]);

  const targetLaneOffsetM = getLaneLateralOffsetM(playerLane);
  const [isDerailedVisual, setIsDerailedVisual] = useState(false);

  const visualMotionRef = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    bodyPitchRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    speedMs: 0,
    brakeIntensity: 0,
    guideStress: 0,
    overVoltActive: false,
    isDerailed: false,
  });

  const skidEmitterRef = useRef<SkidmarkEmitterState>({
    carGroup: null,
    driftYawRad: 0,
    driftIntensity: 0,
    isDerailed: false,
  });

  const physicsRef = useRef<InternalPhysicsState>({
    distanceM: 0,
    speedMs: 0,
    gear: 0,
    engineRpm: 1650,
    smoothedThrottle: 0,
    lateralOffsetM: targetLaneOffsetM,
    guideStress: 0,
    isDerailed: false,
    derailTimerSec: 0,
    derailPosition: new THREE.Vector3(),
    derailVelocity: new THREE.Vector3(),
    derailForwardSpeedMs: 0,
    derailLateralM: targetLaneOffsetM,
    derailLateralVelMs: 0,
    derailVerticalY: 0,
    derailVerticalVelMs: 0,
    derailYawAngleRad: 0,
    derailYawVelRad: 0,
    derailRollVelRad: 0,
    derailPitchVelRad: 0,
    derailVaultedBarrier: false,
    peakDerailForceN: 0,
    lapCount: 1,
    lapTimeMs: 0,
    derailCountInLap: 0,
    maxGuideStressInLap: 0,
    driftScoreSecInLap: 0,
    sectorStage: 0,
    sectorSplitStartMs: 0,
    purpleSectorsInLap: 0,
    countdownStepTimerSec: 0,
    lightsOutHoldDurationSec: 0.62,
    greenElapsedSec: 0,
    turboStartTimerSec: 0,
    overVoltCharge: 0.5,
    overVoltTimerSec: 0,
    tireTempsC: [58, 58, 58, 58],
    tireThermalGripFactor: 0.96,
    lapSpeedTraceKmh: new Array(32).fill(0),
    uiSyncAccumulatorSec: 0,
  });

  useEffect(() => {
    void useGarageStore.getState().hydrateGarage();
    useTelemetryStore
      .getState()
      .setTrackId(useTelemetryStore.getState().trackId);
  }, []);

  const prevOverVoltNonceRef = useRef(overVoltTriggerNonce);
  useEffect(() => {
    if (prevOverVoltNonceRef.current === overVoltTriggerNonce) return;
    prevOverVoltNonceRef.current = overVoltTriggerNonce;

    const sim = physicsRef.current;
    if (
      sim.overVoltCharge >= 0.99 &&
      sim.overVoltTimerSec <= 0 &&
      !sim.isDerailed
    ) {
      sim.overVoltCharge = 0;
      sim.overVoltTimerSec = 2.5;
      soundEngine.unlock();
      soundEngine.playOverVoltSound();
    }
  }, [overVoltTriggerNonce]);

  useEffect(() => {
    const sim = physicsRef.current;
    const vis = visualMotionRef.current;
    const telemetry = useTelemetryStore.getState();

    const isStandingStart = telemetry.cupStartPhase === 'countdown';

    if (isStandingStart) {
      sim.distanceM = 0;
      sim.lapCount = 1;
      sim.lapTimeMs = 0;
      sim.derailCountInLap = 0;
      sim.maxGuideStressInLap = 0;
      sim.driftScoreSecInLap = 0;
      sim.sectorStage = 0;
      sim.sectorSplitStartMs = 0;
      sim.purpleSectorsInLap = 0;
      sim.countdownStepTimerSec = 0;
      sim.lightsOutHoldDurationSec = 0.58 + Math.random() * 0.25;
      sim.greenElapsedSec = 0;
      sim.turboStartTimerSec = 0;
      sim.gear = 0;
      sim.engineRpm = 1650;
      sim.lapSpeedTraceKmh = new Array(32).fill(0);
      ghostBufferRef.current.reset();
      liveLapClock.elapsedMs = 0;
      liveLapClock.active = false;
    } else if (sim.lapTimeMs > 500 && !sim.isDerailed) {
      sim.derailCountInLap += 1;
    }

    sim.speedMs = 0;
    sim.smoothedThrottle = 0;
    sim.guideStress = 0;
    sim.isDerailed = false;
    sim.derailTimerSec = 0;

    vis.bodyRollRad = 0;
    vis.bodyPitchRad = 0;
    vis.driftYawRad = 0;
    vis.driftIntensity = 0;
    vis.speedMs = 0;
    vis.brakeIntensity = 0;
    vis.guideStress = 0;
    vis.overVoltActive = false;
    vis.isDerailed = false;
    setIsDerailedVisual(false);
  }, [resetNonce, trackId]);

  useFrame((state, rawDelta) => {
    const carGroup = carGroupRef.current;
    if (!carGroup) return;

    const dt = Math.min(rawDelta, 0.05);
    const sim = physicsRef.current;
    const vis = visualMotionRef.current;
    const telemetryState = useTelemetryStore.getState();
    const { throttle: rawThrottle, brake } = controlsRef.current;

    const isRain = telemetryState.weatherMode === 'rain';
    const wetTireFactor = isRain
      ? activeTireId === 'tir_wet_rain'
        ? 0.96
        : 0.78
      : 1.0;

    let forceImmediateHudSync = false;

    // 1. SECUENCIA DEL SEMÁFORO F1 (5 Focos Rojos -> Luz Verde ¡SALIDA!)
    if (telemetryState.cupStartPhase === 'countdown') {
      sim.countdownStepTimerSec += dt;
      sim.gear = 0;

      // En parrilla puedes revolucionar el motor en punto muerto (Neutral) antes de la salida
      const targetGridRpm =
        1650 + rawThrottle * (carStats.maxRpm * 0.84 - 1650);
      sim.engineRpm = THREE.MathUtils.lerp(
        sim.engineRpm,
        targetGridRpm,
        1 - Math.exp(-14 * dt)
      );

      if (telemetryState.countdownLights < 5) {
        if (sim.countdownStepTimerSec >= 0.55) {
          sim.countdownStepTimerSec = 0;
          const nextLight = (telemetryState.countdownLights + 1) as
            | 1
            | 2
            | 3
            | 4
            | 5;
          telemetryState.setCupCountdownState('countdown', nextLight);
          soundEngine.playCountdownBeep(false);
          forceImmediateHudSync = true;
        }
      } else if (sim.countdownStepTimerSec >= sim.lightsOutHoldDurationSec) {
        sim.countdownStepTimerSec = 0;
        sim.greenElapsedSec = 0;
        sim.gear = 1;
        telemetryState.setCupCountdownState('green', 0);
        soundEngine.playCountdownBeep(true);

        // Si revolucionaste el motor en parrilla o clavas el gatillo al ponerse en verde, ¡Salida Launch Control!
        if (rawThrottle > 0.1) {
          sim.turboStartTimerSec = 1.65;
          sim.overVoltCharge = Math.min(1, sim.overVoltCharge + 0.25);
        }
        forceImmediateHudSync = true;
      }
    } else if (telemetryState.cupStartPhase === 'green') {
      sim.greenElapsedSec += dt;
      if (
        sim.greenElapsedSec <= 0.32 &&
        rawThrottle > 0.1 &&
        sim.turboStartTimerSec <= 0 &&
        sim.speedMs < 3.0
      ) {
        sim.turboStartTimerSec = 1.65;
        sim.overVoltCharge = Math.min(1, sim.overVoltCharge + 0.25);
        forceImmediateHudSync = true;
      }
      if (sim.greenElapsedSec >= 1.8) {
        telemetryState.setCupCountdownState('racing', 0);
        forceImmediateHudSync = true;
      }
    }

    if (sim.turboStartTimerSec > 0) {
      sim.turboStartTimerSec = Math.max(0, sim.turboStartTimerSec - dt);
    }
    if (sim.overVoltTimerSec > 0) {
      sim.overVoltTimerSec = Math.max(0, sim.overVoltTimerSec - dt);
    }

    const isWaitingAtGrid = telemetryState.cupStartPhase === 'countdown';
    const isOverVoltActive = sim.overVoltTimerSec > 0;
    const isTurboStartActive = sim.turboStartTimerSec > 0;

    vis.overVoltActive = isOverVoltActive || isTurboStartActive;

    const effectiveRawThrottle = isWaitingAtGrid ? 0 : rawThrottle;

    sim.lateralOffsetM = THREE.MathUtils.lerp(
      sim.lateralOffsetM,
      targetLaneOffsetM,
      1 - Math.exp(-12 * dt)
    );

    const throttleRate =
      effectiveRawThrottle > sim.smoothedThrottle ? 14.0 : 32.0;
    sim.smoothedThrottle = THREE.MathUtils.lerp(
      sim.smoothedThrottle,
      effectiveRawThrottle,
      1 - Math.exp(-throttleRate * dt)
    );
    if (sim.smoothedThrottle < 0.01 && effectiveRawThrottle === 0) {
      sim.smoothedThrottle = 0;
    }

    vis.brakeIntensity = brake;

    // 2. Cálculo de Rebufo Aerodinámico (+8% punta) y Colisión Física de Carril contra la Parrilla IA
    const playerTotalDist =
      (sim.lapCount - 1) * trackLengthM + sim.distanceM;
    livePlayerProgress.distanceM = sim.distanceM;
    livePlayerProgress.lapCount = sim.lapCount;
    livePlayerProgress.totalDistanceM = playerTotalDist;
    livePlayerProgress.lane = playerLane;
    livePlayerProgress.lateralOffsetM = sim.lateralOffsetM;
    livePlayerProgress.isDerailed = sim.isDerailed;

    const hasAiInRace =
      telemetryState.raceMode === 'vs-ai' ||
      telemetryState.raceMode === 'grand-prix' ||
      telemetryState.raceMode === 'championship';

    let isSlipstreaming = false;

    if (hasAiInRace && !isWaitingAtGrid && !sim.isDerailed) {
      for (const unit of liveRivalGridState) {
        if (!unit.active || unit.isDerailed) continue;
        let distBehindUnit =
          (unit.distanceM - sim.distanceM + trackLengthM) % trackLengthM;
        if (distBehindUnit > trackLengthM * 0.5) {
          distBehindUnit -= trackLengthM;
        }
        const lateralDiff = Math.abs(sim.lateralOffsetM - unit.lateralOffsetM);

        // Rebufo aerodinámico: ir pegado detrás (2.1 m a 18 m) en el mismo carril reduce drag y da +8% velocidad punta
        if (
          sim.speedMs > 10 &&
          distBehindUnit >= 2.1 &&
          distBehindUnit <= 18.0 &&
          lateralDiff < 0.65
        ) {
          isSlipstreaming = true;
        }

        // Colisión física de carril (Bumper-to-Bumper): si alcanzas a un coche IA por detrás sin cambiar de carril ([L])
        if (
          distBehindUnit > 0.25 &&
          distBehindUnit < 2.1 &&
          lateralDiff < 0.45 &&
          sim.speedMs > unit.speedMs
        ) {
          sim.speedMs = Math.max(0, unit.speedMs * 0.96);
          unit.speedMs = Math.min(unit.speedMs + 1.35, 62);
          sim.guideStress = Math.min(0.92, sim.guideStress + 0.14);
        }
      }
    }

    if (isSlipstreaming && !isOverVoltActive) {
      sim.overVoltCharge = Math.min(1, sim.overVoltCharge + 0.16 * dt);
    }

    const baseMaxSpeedMs = carStats.MaxSpeed / 3.6;
    const maxSpeedMultiplier =
      (isOverVoltActive ? 1.12 : 1.0) * (isSlipstreaming ? 1.08 : 1.0);
    const maxSpeedMs = baseMaxSpeedMs * maxSpeedMultiplier;

    // 3. CAJA DE CAMBIOS SECUENCIAL DE 6 VELOCIDADES Y CURVA REAL DE RPM
    if (!isWaitingAtGrid && !sim.isDerailed) {
      if (sim.gear < 1) sim.gear = 1;
      const speedNorm = baseMaxSpeedMs > 0 ? sim.speedMs / baseMaxSpeedMs : 0;

      // Subir marcha (Upshift) al alcanzar el 96% del techo de la relación actual
      if (
        sim.gear < 6 &&
        speedNorm >= GEAR_TOP_SPEED_RATIOS[sim.gear - 1] * 0.96
      ) {
        sim.gear += 1;
        soundEngine.playGearShiftSound(true);
      } else if (
        sim.gear > 1 &&
        speedNorm < GEAR_TOP_SPEED_RATIOS[sim.gear - 2] * 0.84
      ) {
        sim.gear -= 1;
        soundEngine.playGearShiftSound(false);
      }

      const gearFloorRatio =
        sim.gear === 1 ? 0 : GEAR_TOP_SPEED_RATIOS[sim.gear - 2] * 0.62;
      const gearCeilRatio = GEAR_TOP_SPEED_RATIOS[sim.gear - 1];
      const inGearProgress = THREE.MathUtils.clamp(
        (speedNorm - gearFloorRatio) /
          Math.max(0.08, gearCeilRatio - gearFloorRatio),
        0,
        1.03
      );

      const idleRpm = 1650;
      const targetRpm =
        idleRpm +
        inGearProgress * (carStats.maxRpm - idleRpm) +
        sim.smoothedThrottle * 280;
      sim.engineRpm = THREE.MathUtils.lerp(
        sim.engineRpm,
        Math.min(carStats.maxRpm * 1.02, targetRpm),
        1 - Math.exp(-18 * dt)
      );
    }

    const isWoodFree = telemetryState.magnetMode === 'wood-free';
    const magnetGripFactor = isWoodFree ? 0.8 : 1.0;
    const effectiveDriftOnsetRatio = isWoodFree ? 0.72 : DRIFT_ONSET_GRIP_RATIO;
    const effectiveDriftFullAngleRatio = isWoodFree
      ? 1.52
      : DRIFT_FULL_ANGLE_RATIO;
    const effectiveDriftCeiling =
      carStats.DriftCeilingRatio + (isWoodFree ? 0.36 : 0);
    const maxVisualDriftYawRad = isWoodFree ? 0.82 : MAX_SLOT_DRIFT_YAW_RAD;

    let currentCentrifugalForceN = 0;
    let currentEffectiveRadiusM = Infinity;
    let currentDynamicGripN =
      computeDynamicGripAtSpeed(carStats, sim.speedMs) *
      wetTireFactor *
      magnetGripFactor *
      sim.tireThermalGripFactor;
    let gripRatio = 0;
    let slopePercent = 0;
    let longitudinalNetAccel = 0;

    if (!sim.isDerailed) {
      const prevU = sim.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, prevU, _kinematics);

      const preEffectiveRadius = computeEffectiveLaneRadius(
        _kinematics.curvatureRadius,
        _kinematics.turnSign,
        sim.lateralOffsetM
      );
      const preForceN = Number.isFinite(preEffectiveRadius)
        ? (carStats.TotalWeight * (sim.speedMs * sim.speedMs)) /
          preEffectiveRadius
        : 0;
      const preGripRatio =
        currentDynamicGripN > 0 ? preForceN / currentDynamicGripN : 0;
      const preDriftIntensity = THREE.MathUtils.clamp(
        (preGripRatio - effectiveDriftOnsetRatio) /
          (effectiveDriftFullAngleRatio - effectiveDriftOnsetRatio),
        0,
        1
      );

      const slopeGravityAccel = -GRAVITY_MS2 * _kinematics.tangent.y;
      const speedRatio = maxSpeedMs > 0 ? sim.speedMs / maxSpeedMs : 0;
      const gearIdx = Math.max(0, Math.min(5, (sim.gear || 1) - 1));
      const gearTorqueMult = GEAR_TORQUE_MULTIPLIERS[gearIdx];
      const powerBandFactor = Math.max(0, 1 - Math.pow(speedRatio, 2.2));
      const rearTractionEfficiency = 1 - 0.42 * preDriftIntensity;

      const boostAccelMult =
        (isOverVoltActive ? 1.24 : 1.0) *
        (isTurboStartActive ? 1.22 : 1.0) *
        (isSlipstreaming ? 1.12 : 1.0);

      const driveAccel =
        sim.smoothedThrottle *
        carStats.Acceleration *
        gearTorqueMult *
        boostAccelMult *
        powerBandFactor *
        rearTractionEfficiency;

      const brakeDecel = brake * SLOT_BRAKE_DECEL_MS2;
      const effectiveDragCoeff = isSlipstreaming
        ? AERO_DRAG_COEFF * 0.65
        : AERO_DRAG_COEFF;
      const coastDecel =
        effectiveRawThrottle === 0 && sim.speedMs > 0
          ? ENGINE_COAST_BRAKE_MS2 +
            effectiveDragCoeff * sim.speedMs * sim.speedMs
          : effectiveDragCoeff * sim.speedMs * sim.speedMs;

      const scrubFactor = effectiveRawThrottle === 0 ? 1.0 : 0.45;
      const driftScrubDecel =
        preDriftIntensity * DRIFT_TIRE_SCRUB_DECEL_MS2 * scrubFactor;

      longitudinalNetAccel =
        driveAccel +
        slopeGravityAccel -
        brakeDecel -
        coastDecel -
        driftScrubDecel;

      const downhillMaxCap =
        _kinematics.tangent.y < -0.05 ? maxSpeedMs * 1.06 : maxSpeedMs;
      sim.speedMs = isWaitingAtGrid
        ? 0
        : THREE.MathUtils.clamp(
            sim.speedMs + longitudinalNetAccel * dt,
            0,
            downhillMaxCap
          );

      const arcDifferentialFactor =
        Number.isFinite(_kinematics.curvatureRadius) &&
        Number.isFinite(preEffectiveRadius)
          ? THREE.MathUtils.clamp(
              _kinematics.curvatureRadius / preEffectiveRadius,
              0.72,
              1.35
            )
          : 1.0;

      if (!isWaitingAtGrid && (sim.speedMs > 0.1 || sim.lapTimeMs > 0)) {
        sim.lapTimeMs += dt * 1000;
        const traceBin = Math.min(
          31,
          Math.max(0, Math.floor((sim.distanceM / trackLengthM) * 32))
        );
        sim.lapSpeedTraceKmh[traceBin] = Math.round(sim.speedMs * 3.6);
      }

      const nextDistance =
        sim.distanceM + sim.speedMs * arcDifferentialFactor * dt;
      const nextU = nextDistance / trackLengthM;

      if (sim.lapTimeMs > 800 && nextDistance < trackLengthM) {
        if (sim.sectorStage === 0 && nextU >= 1 / 3 && nextU < 0.85) {
          const s1Time = Math.max(200, sim.lapTimeMs - sim.sectorSplitStartMs);
          const color = useTelemetryStore
            .getState()
            .recordSectorSplit(0, s1Time);
          if (color === 'purple') sim.purpleSectorsInLap += 1;
          soundEngine.playSectorBeep(color === 'pending' ? 'amber' : color);
          sim.sectorStage = 1;
          sim.sectorSplitStartMs = sim.lapTimeMs;
          forceImmediateHudSync = true;
        } else if (sim.sectorStage === 1 && nextU >= 2 / 3 && nextU < 0.96) {
          const s2Time = Math.max(200, sim.lapTimeMs - sim.sectorSplitStartMs);
          const color = useTelemetryStore
            .getState()
            .recordSectorSplit(1, s2Time);
          if (color === 'purple') sim.purpleSectorsInLap += 1;
          soundEngine.playSectorBeep(color === 'pending' ? 'amber' : color);
          sim.sectorStage = 2;
          sim.sectorSplitStartMs = sim.lapTimeMs;
          forceImmediateHudSync = true;
        }
      }

      if (nextDistance >= trackLengthM) {
        if (sim.lapTimeMs > 4000) {
          if (sim.sectorStage === 2) {
            const s3Time = Math.max(
              200,
              sim.lapTimeMs - sim.sectorSplitStartMs
            );
            const s3Color = useTelemetryStore
              .getState()
              .recordSectorSplit(2, s3Time);
            if (s3Color === 'purple') sim.purpleSectorsInLap += 1;
          }

          const summary = useTelemetryStore.getState().completeEvaluatedLap({
            lapTimeMs: sim.lapTimeMs,
            derailCount: sim.derailCountInLap,
            maxGuideStress: sim.maxGuideStressInLap,
            driftScoreSec: sim.driftScoreSecInLap,
            purpleSectorsInLap: sim.purpleSectorsInLap,
            goldTargetMs: CIRCUITS[trackId].goldTargetMs,
            speedTraceKmh: [...sim.lapSpeedTraceKmh],
          });

          if (summary.isNewBest) {
            const exportedGhost = ghostBufferRef.current.exportSnapshot(
              trackId,
              sim.lapTimeMs,
              trackLengthM,
              sim.lateralOffsetM,
              carStats.modelPath,
              carStats.modelYawOffsetRad
            );
            saveBestGhostForTrack(exportedGhost);
            useTelemetryStore.getState().bumpGhostVersion();
          }

          if (
            telemetryState.raceMode === 'license-school' &&
            telemetryState.cupStartPhase !== 'finished'
          ) {
            telemetryState.completeLicenseAttempt(
              sim.lapTimeMs,
              sim.derailCountInLap > 0
            );
            soundEngine.playPerfectLapFanfare();
          } else if (
            (telemetryState.raceMode === 'vs-ai' ||
              telemetryState.raceMode === 'grand-prix' ||
              telemetryState.raceMode === 'championship') &&
            telemetryState.cupStartPhase !== 'finished' &&
            sim.lapCount >= telemetryState.cupTargetLaps
          ) {
            livePlayerProgress.lapCount = sim.lapCount + 1;
            livePlayerProgress.distanceM =
              ((nextDistance % trackLengthM) + trackLengthM) % trackLengthM;
            livePlayerProgress.totalDistanceM =
              sim.lapCount * trackLengthM + livePlayerProgress.distanceM;
            const finalStandings = buildLiveGridStandings();
            telemetryState.finishGridRace(finalStandings);
            soundEngine.playPerfectLapFanfare();
          } else if (summary.medal === 'perfect') {
            soundEngine.playPerfectLapFanfare();
          } else {
            soundEngine.playLapChime(summary.isNewBest);
          }
        }

        sim.lapCount += 1;
        sim.lapTimeMs = 0;
        sim.derailCountInLap = 0;
        sim.maxGuideStressInLap = 0;
        sim.driftScoreSecInLap = 0;
        sim.sectorStage = 0;
        sim.sectorSplitStartMs = 0;
        sim.purpleSectorsInLap = 0;
        sim.lapSpeedTraceKmh = new Array(32).fill(0);
        ghostBufferRef.current.reset();
        liveLapClock.elapsedMs = 0;
        forceImmediateHudSync = true;
      }

      sim.distanceM =
        ((nextDistance % trackLengthM) + trackLengthM) % trackLengthM;
      const u = sim.distanceM / trackLengthM;

      evaluateSplineKinematics(curve, u, _kinematics);
      slopePercent = _kinematics.tangent.y * 100;
      currentEffectiveRadiusM = computeEffectiveLaneRadius(
        _kinematics.curvatureRadius,
        _kinematics.turnSign,
        sim.lateralOffsetM
      );
      currentDynamicGripN =
        computeDynamicGripAtSpeed(carStats, sim.speedMs) *
        wetTireFactor *
        magnetGripFactor *
        sim.tireThermalGripFactor;

      currentCentrifugalForceN = Number.isFinite(currentEffectiveRadiusM)
        ? (carStats.TotalWeight * (sim.speedMs * sim.speedMs)) /
          currentEffectiveRadiusM
        : 0;
      gripRatio =
        currentDynamicGripN > 0
          ? currentCentrifugalForceN / currentDynamicGripN
          : 0;

      const driftIntensity = THREE.MathUtils.clamp(
        (gripRatio - effectiveDriftOnsetRatio) /
          (effectiveDriftFullAngleRatio - effectiveDriftOnsetRatio),
        0,
        1
      );

      // SIMULACIÓN TÉRMICA DE LOS 4 NEUMÁTICOS [FL, FR, RL, RR] EN °C
      if (!isWaitingAtGrid) {
        const ambientEquilibriumC = isRain ? 36 : 48;
        const airflowCoolRate =
          (isRain ? 0.24 : 0.14) * (0.85 + sim.speedMs / 32);

        // En curvas a izquierda (turnSign > 0) apoyan más las ruedas derechas (FR, RR) y viceversa
        const leftCornerLoad =
          _kinematics.turnSign < 0
            ? 1.38
            : _kinematics.turnSign > 0
              ? 0.65
              : 1.0;
        const rightCornerLoad =
          _kinematics.turnSign > 0
            ? 1.38
            : _kinematics.turnSign < 0
              ? 0.65
              : 1.0;

        const baseCornerHeat =
          Math.min(1.6, gripRatio) * (sim.speedMs / 28) * 8.4;
        const frontBrakeHeat = brake * (sim.speedMs / 26) * 10.2;
        const rearSlipHeat =
          (driftIntensity * 21.0 + sim.smoothedThrottle * 3.4) *
          (sim.speedMs / 25);

        const heatInputs: [number, number, number, number] = [
          baseCornerHeat * leftCornerLoad + frontBrakeHeat, // FL
          baseCornerHeat * rightCornerLoad + frontBrakeHeat, // FR
          baseCornerHeat * leftCornerLoad * 1.08 + rearSlipHeat, // RL
          baseCornerHeat * rightCornerLoad * 1.08 + rearSlipHeat, // RR
        ];

        let sumTempC = 0;
        for (let tIdx = 0; tIdx < 4; tIdx++) {
          const curT = sim.tireTempsC[tIdx];
          const coolDelta = (curT - ambientEquilibriumC) * airflowCoolRate;
          const nextT = THREE.MathUtils.clamp(
            curT + (heatInputs[tIdx] - coolDelta) * dt,
            28,
            132
          );
          sim.tireTempsC[tIdx] = nextT;
          sumTempC += nextT;
        }

        const avgTempC = sumTempC / 4;
        if (avgTempC < 65) {
          sim.tireThermalGripFactor =
            0.91 + 0.09 * THREE.MathUtils.clamp((avgTempC - 32) / 33, 0, 1);
        } else if (avgTempC <= 98) {
          sim.tireThermalGripFactor =
            1.0 + 0.03 * Math.sin(((avgTempC - 65) / 33) * Math.PI);
        } else {
          sim.tireThermalGripFactor = Math.max(
            0.84,
            1.0 - ((avgTempC - 98) / 30) * 0.16
          );
        }
      }

      if (driftIntensity > 0.12 && sim.speedMs > 5) {
        sim.driftScoreSecInLap += dt;
        if (!isOverVoltActive) {
          sim.overVoltCharge = Math.min(
            1,
            sim.overVoltCharge + driftIntensity * 0.22 * dt
          );
        }
      }

      if (gripRatio >= effectiveDriftCeiling) {
        sim.guideStress = 1.0;
      } else if (gripRatio > 1.0) {
        const excessRatio = gripRatio - 1.0;
        const rollerMarginScale =
          0.4 / Math.max(0.25, effectiveDriftCeiling - 1.0);
        const throttleAbuseMultiplier = 0.7 + 1.15 * sim.smoothedThrottle;
        const stressBuildRate =
          (0.75 + excessRatio * 8.8 * rollerMarginScale) *
          throttleAbuseMultiplier;
        sim.guideStress = Math.min(1.0, sim.guideStress + stressBuildRate * dt);
      } else {
        sim.guideStress = Math.max(
          0,
          sim.guideStress - carStats.GuideRecoveryRate * dt
        );
      }

      sim.maxGuideStressInLap = Math.max(
        sim.maxGuideStressInLap,
        sim.guideStress
      );
      vis.guideStress = sim.guideStress;

      _laneWorldPos
        .copy(_kinematics.position)
        .addScaledVector(_kinematics.right, sim.lateralOffsetM);

      if (sim.guideStress >= 1.0) {
        sim.isDerailed = true;
        sim.derailCountInLap += 1;
        sim.derailTimerSec = DERAIL_RECOVERY_SECONDS;
        sim.peakDerailForceN = currentCentrifugalForceN;
        sim.overVoltTimerSec = 0;

        // Dirección lateral hacia el exterior de la curva (1 = hacia +right, -1 = hacia -right)
        const outRightSign =
          _kinematics.outwardNormal.dot(_kinematics.right) >= 0 ? 1 : -1;

        // Si el exceso de velocidad es extremo o ocurre en un cambio de rasante elevado, el coche salta el guardarrail
        const shouldVaultBarrier =
          gripRatio > 1.52 ||
          sim.speedMs > 38 ||
          (_kinematics.position.y > 2.4 && sim.speedMs > 27);

        sim.derailVaultedBarrier = shouldVaultBarrier;
        sim.derailForwardSpeedMs = sim.speedMs * 0.86;
        sim.derailLateralM = sim.lateralOffsetM;
        sim.derailLateralVelMs =
          outRightSign *
          (shouldVaultBarrier ? sim.speedMs * 0.48 : sim.speedMs * 0.36);
        sim.derailVerticalY = _laneWorldPos.y;
        sim.derailVerticalVelMs = shouldVaultBarrier
          ? 2.6 + Math.min(2.4, (sim.speedMs - 24) * 0.12)
          : 0.95;

        // Trompo inicial de slot al desenganchar la pala guía del carril
        sim.derailYawAngleRad = vis.driftYawRad;
        sim.derailYawVelRad = -_kinematics.turnSign * (6.8 + Math.random() * 2.5);
        sim.derailRollVelRad = shouldVaultBarrier
          ? outRightSign * (4.2 + Math.random() * 2.2)
          : outRightSign * 1.8;
        sim.derailPitchVelRad = shouldVaultBarrier ? -2.4 : -0.6;

        sim.derailPosition.copy(_laneWorldPos);
        sim.derailVelocity
          .copy(_kinematics.tangent)
          .multiplyScalar(sim.derailForwardSpeedMs)
          .addScaledVector(_kinematics.right, sim.derailLateralVelMs);
        sim.derailVelocity.y = sim.derailVerticalVelMs;

        vis.isDerailed = true;
        vis.driftIntensity = 1.0;
        setIsDerailedVisual(true);
        soundEngine.playDerailSound();
        if (
          telemetryState.raceMode === 'license-school' &&
          telemetryState.cupStartPhase !== 'finished'
        ) {
          telemetryState.completeLicenseAttempt(sim.lapTimeMs, true);
        }
        forceImmediateHudSync = true;
      } else {
        carGroup.position.copy(_laneWorldPos);
        _lookTarget.copy(_laneWorldPos).add(_kinematics.tangent);
        carGroup.up.copy(_worldUp);
        carGroup.lookAt(_lookTarget);
        carGroup.updateMatrixWorld();

        const targetDriftYaw =
          -_kinematics.turnSign * driftIntensity * maxVisualDriftYawRad;
        vis.driftYawRad = THREE.MathUtils.lerp(
          vis.driftYawRad,
          targetDriftYaw,
          1 - Math.exp(-13.5 * dt)
        );
        vis.driftIntensity = driftIntensity;

        const clampedLoad = Math.min(1.25, gripRatio);
        const targetRollRad =
          -_kinematics.turnSign * clampedLoad * carStats.centerOfGravity * 0.56;
        vis.bodyRollRad = THREE.MathUtils.lerp(
          vis.bodyRollRad,
          targetRollRad,
          1 - Math.exp(-14 * dt)
        );

        // Cabeceo físico de la suspensión (Pitch Dive en frenada / Squat al acelerar)
        const targetPitchRad = THREE.MathUtils.clamp(
          (-longitudinalNetAccel / 34.0) * 0.042,
          -0.025,
          0.042
        );
        vis.bodyPitchRad = THREE.MathUtils.lerp(
          vis.bodyPitchRad ?? 0,
          targetPitchRad,
          1 - Math.exp(-12 * dt)
        );
      }
    }

    if (sim.isDerailed) {
      if (sim.lapTimeMs > 0) {
        sim.lapTimeMs += dt * 1000;
      }

      sim.derailTimerSec -= dt;

      const ARMCO_BARRIER_LIMIT_M = 3.92;
      const DECK_EDGE_LIMIT_M = 4.62;

      if (
        !sim.derailVaultedBarrier ||
        Math.abs(sim.derailLateralM) < DECK_EDGE_LIMIT_M
      ) {
        // FASE EN PISTA: El coche se desliza haciendo un trompo sobre el asfalto/piano y golpea el guardarrail Armco
        sim.distanceM =
          ((sim.distanceM + sim.derailForwardSpeedMs * dt) % trackLengthM +
            trackLengthM) %
          trackLengthM;
        const u = sim.distanceM / trackLengthM;
        evaluateSplineKinematics(curve, u, _kinematics);

        sim.derailLateralM += sim.derailLateralVelMs * dt;

        // Si no salta la valla, choca y rebota contra el guardarrail metálico Armco (±3.92 m)
        if (
          !sim.derailVaultedBarrier &&
          Math.abs(sim.derailLateralM) >= ARMCO_BARRIER_LIMIT_M
        ) {
          sim.derailLateralM =
            Math.sign(sim.derailLateralM) * ARMCO_BARRIER_LIMIT_M;
          if (Math.abs(sim.derailLateralVelMs) > 1.2) {
            sim.derailLateralVelMs = -sim.derailLateralVelMs * 0.42;
            sim.derailForwardSpeedMs *= 0.68;
            sim.derailYawVelRad =
              -sim.derailYawVelRad * 0.45 +
              Math.sign(sim.derailLateralM) * 4.8;
            vis.guideStress = 1.0;
          } else {
            sim.derailLateralVelMs = 0;
          }
        }

        // Fricción de neumáticos cruzados sobre el asfalto
        sim.derailForwardSpeedMs = Math.max(
          0,
          sim.derailForwardSpeedMs - 17.5 * dt
        );
        sim.derailLateralVelMs = THREE.MathUtils.lerp(
          sim.derailLateralVelMs,
          0,
          1 - Math.exp(-3.4 * dt)
        );

        // Gravedad vertical sobre el tablero de la pista (bote al desenganchar la guía)
        sim.derailVerticalVelMs -= 18.5 * dt;
        sim.derailVerticalY += sim.derailVerticalVelMs * dt;
        if (sim.derailVerticalY <= _kinematics.position.y) {
          sim.derailVerticalY = _kinematics.position.y;
          sim.derailVerticalVelMs =
            Math.abs(sim.derailVerticalVelMs) > 0.9
              ? -sim.derailVerticalVelMs * 0.28
              : 0;
        }

        sim.derailPosition
          .copy(_kinematics.position)
          .addScaledVector(_kinematics.right, sim.derailLateralM);
        sim.derailPosition.y = sim.derailVerticalY;

        carGroup.position.copy(sim.derailPosition);
        _lookTarget.copy(sim.derailPosition).add(_kinematics.tangent);
        carGroup.up.copy(_worldUp);
        carGroup.lookAt(_lookTarget);

        sim.derailYawAngleRad += sim.derailYawVelRad * dt;
        sim.derailYawVelRad = THREE.MathUtils.lerp(
          sim.derailYawVelRad,
          0,
          1 - Math.exp(-3.0 * dt)
        );
        vis.driftYawRad = sim.derailYawAngleRad;

        const targetRoll = THREE.MathUtils.clamp(
          sim.derailLateralVelMs * 0.045,
          -0.28,
          0.28
        );
        vis.bodyRollRad = THREE.MathUtils.lerp(
          vis.bodyRollRad,
          targetRoll,
          1 - Math.exp(-10 * dt)
        );
        vis.bodyPitchRad = THREE.MathUtils.lerp(
          vis.bodyPitchRad ?? 0,
          0,
          1 - Math.exp(-8 * dt)
        );

        // Actualizar vector 3D de velocidad por si acaba de cruzar el límite del guardarrail hacia el vacío
        sim.derailVelocity
          .copy(_kinematics.tangent)
          .multiplyScalar(sim.derailForwardSpeedMs)
          .addScaledVector(_kinematics.right, sim.derailLateralVelMs);
        sim.derailVelocity.y = sim.derailVerticalVelMs;

        sim.speedMs = Math.hypot(
          sim.derailForwardSpeedMs,
          sim.derailLateralVelMs
        );
      } else {
        // FASE DE CAÍDA LIBRE FUERA DE PISTA: El coche superó el guardarrail y cae con gravedad real (g) hacia el suelo/viaducto inferior
        const groundFloorY = -0.14;
        sim.derailVelocity.y -= 16.8 * dt;
        sim.derailPosition.addScaledVector(sim.derailVelocity, dt);

        if (sim.derailPosition.y <= groundFloorY) {
          sim.derailPosition.y = groundFloorY;
          if (sim.derailVelocity.y < -1.2) {
            sim.derailVelocity.y = -sim.derailVelocity.y * 0.34;
            sim.derailRollVelRad *= 0.55;
            sim.derailPitchVelRad *= 0.55;
          } else {
            sim.derailVelocity.y = 0;
            sim.derailRollVelRad = THREE.MathUtils.lerp(
              sim.derailRollVelRad,
              0,
              1 - Math.exp(-8 * dt)
            );
            sim.derailPitchVelRad = THREE.MathUtils.lerp(
              sim.derailPitchVelRad,
              0,
              1 - Math.exp(-8 * dt)
            );
          }

          // Fricción fuerte contra el terreno inferior
          const horizSpeed = Math.hypot(
            sim.derailVelocity.x,
            sim.derailVelocity.z
          );
          if (horizSpeed > 0.05) {
            const nextHoriz = Math.max(0, horizSpeed - GRAVEL_DECEL_MS2 * dt);
            const scale = nextHoriz / horizSpeed;
            sim.derailVelocity.x *= scale;
            sim.derailVelocity.z *= scale;
          }
        }

        carGroup.position.copy(sim.derailPosition);
        sim.derailYawAngleRad += sim.derailYawVelRad * dt;
        sim.derailYawVelRad = THREE.MathUtils.lerp(
          sim.derailYawVelRad,
          0,
          1 - Math.exp(-2.2 * dt)
        );
        vis.driftYawRad = sim.derailYawAngleRad;
        vis.bodyRollRad += sim.derailRollVelRad * dt;
        vis.bodyPitchRad =
          (vis.bodyPitchRad ?? 0) + sim.derailPitchVelRad * dt;

        sim.speedMs = sim.derailVelocity.length();
      }

      currentCentrifugalForceN = sim.peakDerailForceN;
      gripRatio =
        currentDynamicGripN > 0
          ? currentCentrifugalForceN / currentDynamicGripN
          : 1.4;

      if (sim.derailTimerSec <= 0) {
        sim.isDerailed = false;
        sim.speedMs = 0;
        sim.gear = 1;
        sim.guideStress = 0;
        sim.derailVaultedBarrier = false;
        vis.bodyRollRad = 0;
        vis.bodyPitchRad = 0;
        vis.driftYawRad = 0;
        vis.driftIntensity = 0;
        vis.guideStress = 0;
        vis.isDerailed = false;
        setIsDerailedVisual(false);
        forceImmediateHudSync = true;
      }
    }

    liveLapClock.elapsedMs = sim.lapTimeMs;
    liveLapClock.active = sim.lapTimeMs > 0;
    if (sim.lapTimeMs > 0) {
      ghostBufferRef.current.recordSampleIfDue(
        sim.lapTimeMs,
        sim.distanceM,
        sim.lateralOffsetM,
        vis.driftYawRad
      );
    }

    vis.speedMs = sim.speedMs;
    vis.gear = sim.gear;
    skidEmitterRef.current.carGroup = carGroup;
    skidEmitterRef.current.driftYawRad = vis.driftYawRad;
    skidEmitterRef.current.driftIntensity = vis.driftIntensity;
    skidEmitterRef.current.isDerailed = sim.isDerailed;

    const isGarageOpen = useGarageStore.getState().isGarageOpen;
    soundEngine.updateContinuousFrame({
      speedMs: sim.speedMs,
      maxSpeedMs,
      engineRpm: sim.engineRpm,
      maxRpm: carStats.maxRpm,
      throttle: isWaitingAtGrid ? rawThrottle : sim.smoothedThrottle,
      driftIntensity: vis.driftIntensity,
      isDerailed: sim.isDerailed,
      soundEnabled: telemetryState.soundEnabled,
    });

    // 4. CÁMARAS DE SIMULADOR: Showroom 360°, Persecución Baja GT3, Cockpit/Capó y Cenital
    const perspCam = state.camera as THREE.PerspectiveCamera;
    if (isGarageOpen) {
      const orbitAngle = state.clock.elapsedTime * 0.55;
      const orbitRadius = 5.4;
      _desiredCamPos.set(
        carGroup.position.x + Math.cos(orbitAngle) * orbitRadius,
        carGroup.position.y + 1.85,
        carGroup.position.z + Math.sin(orbitAngle) * orbitRadius
      );
      _desiredCamLook.set(
        carGroup.position.x,
        carGroup.position.y + 0.52,
        carGroup.position.z
      );

      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-6.5 * dt));
      state.camera.lookAt(_desiredCamLook);

      if (
        perspCam.isPerspectiveCamera &&
        Math.abs(perspCam.fov - 42) > 0.05
      ) {
        perspCam.fov = THREE.MathUtils.lerp(
          perspCam.fov,
          42,
          1 - Math.exp(-6 * dt)
        );
        perspCam.updateProjectionMatrix();
      }
    } else if (telemetryState.cameraMode === 'cockpit') {
      const u = sim.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, u, _kinematics);

      _desiredCamPos
        .copy(carGroup.position)
        .addScaledVector(_kinematics.tangent, 0.35);
      _desiredCamPos.y += 1.08;

      _desiredCamLook
        .copy(carGroup.position)
        .addScaledVector(_kinematics.tangent, 22.0);
      _desiredCamLook.y += 0.65;

      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-24 * dt));
      state.camera.lookAt(_desiredCamLook);

      if (perspCam.isPerspectiveCamera) {
        const targetFov = 62;
        if (Math.abs(perspCam.fov - targetFov) > 0.05) {
          perspCam.fov = THREE.MathUtils.lerp(
            perspCam.fov,
            targetFov,
            1 - Math.exp(-8 * dt)
          );
          perspCam.updateProjectionMatrix();
        }
      }
    } else if (telemetryState.cameraMode === 'chase') {
      const u = sim.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, u, _kinematics);

      // Cámara de persecución baja estilo Gran Turismo / Assetto Corsa (cerca del alerón trasero)
      _desiredCamPos
        .copy(carGroup.position)
        .addScaledVector(_kinematics.tangent, -7.2);
      _desiredCamPos.y += 2.35;

      if (!sim.isDerailed && vis.driftIntensity > 0.25) {
        const shakeAmp = (vis.driftIntensity - 0.25) * 0.07;
        const tNow = state.clock.elapsedTime;
        _desiredCamPos.y += Math.sin(tNow * 48) * shakeAmp;
      }

      _desiredCamLook
        .copy(carGroup.position)
        .addScaledVector(_kinematics.tangent, 9.5);
      _desiredCamLook.y += 0.45;

      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-10.5 * dt));
      state.camera.lookAt(_desiredCamLook);

      if (perspCam.isPerspectiveCamera) {
        const speedNorm =
          baseMaxSpeedMs > 0 ? Math.min(1.15, sim.speedMs / baseMaxSpeedMs) : 0;
        const overVoltFovExtra = isOverVoltActive ? 4.2 : 0;
        const targetFov =
          BASE_CAMERA_FOV +
          Math.pow(speedNorm, 1.45) * MAX_SPEED_FOV_BOOST +
          overVoltFovExtra;
        if (Math.abs(perspCam.fov - targetFov) > 0.03) {
          perspCam.fov = THREE.MathUtils.lerp(
            perspCam.fov,
            targetFov,
            1 - Math.exp(-6 * dt)
          );
          perspCam.updateProjectionMatrix();
        }
      }
    } else {
      _desiredCamPos.set(0, 198, 22);
      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-5 * dt));
      state.camera.lookAt(0, 2, -16);

      if (
        perspCam.isPerspectiveCamera &&
        Math.abs(perspCam.fov - BASE_CAMERA_FOV) > 0.05
      ) {
        perspCam.fov = THREE.MathUtils.lerp(
          perspCam.fov,
          BASE_CAMERA_FOV,
          1 - Math.exp(-6 * dt)
        );
        perspCam.updateProjectionMatrix();
      }
    }

    sim.uiSyncAccumulatorSec += dt;
    if (sim.uiSyncAccumulatorSec >= 1 / 30 || forceImmediateHudSync) {
      sim.uiSyncAccumulatorSec = 0;

      const lookAhead =
        sim.isDerailed || !telemetryState.assistEnabled
          ? { advice: 'clear' as const, recommendedCornerSpeedKmh: null }
          : scanUpcomingBrakingAdvice(
              trackLUT,
              sim.distanceM,
              sim.speedMs,
              carStats.TotalWeight,
              carStats.TotalGrip * wetTireFactor,
              carStats.AeroDownforceCoeff * wetTireFactor,
              sim.lateralOffsetM
            );

      const driftDeg = Math.abs(THREE.MathUtils.radToDeg(vis.driftYawRad));
      const updatedPlayerTotal =
        (sim.lapCount - 1) * trackLengthM + sim.distanceM;
      livePlayerProgress.distanceM = sim.distanceM;
      livePlayerProgress.lapCount = sim.lapCount;
      livePlayerProgress.totalDistanceM = updatedPlayerTotal;
      livePlayerProgress.lane = playerLane;
      livePlayerProgress.lateralOffsetM = sim.lateralOffsetM;
      livePlayerProgress.isDerailed = sim.isDerailed;

      const standings = buildLiveGridStandings();
      const playerRow = standings.find((r) => r.isPlayer);
      const playerRacePosition: 1 | 2 | 3 | 4 = playerRow?.position ?? 1;
      const gapToRivalM = updatedPlayerTotal - liveRivalState.totalDistanceM;
      const lateralG =
        carStats.TotalWeight > 0
          ? currentCentrifugalForceN / (carStats.TotalWeight * GRAVITY_MS2)
          : 0;

      telemetryState.updateTelemetry({
        speedMs: sim.speedMs,
        speedKmh: sim.speedMs * 3.6,
        gear: sim.gear,
        engineRpm: Math.round(sim.engineRpm),
        lateralG: Number(lateralG.toFixed(2)),
        centrifugalForce: currentCentrifugalForceN,
        gripAvailable: currentDynamicGripN,
        gripUsageRatio: gripRatio,
        isDrifting: !sim.isDerailed && vis.driftIntensity > 0.05,
        driftAngleDeg: driftDeg,
        guideStressRatio: sim.guideStress,
        brakeAdvice: lookAhead.advice,
        recommendedCornerSpeedKmh: lookAhead.recommendedCornerSpeedKmh,
        curvatureRadius: currentEffectiveRadiusM,
        slopePercent,
        lapProgress: sim.distanceM / trackLengthM,
        lapCount: sim.lapCount,
        currentLapTimeMs: sim.lapTimeMs,
        isDerailed: sim.isDerailed,
        lastDerailForce: sim.peakDerailForceN,
        throttleInput: isWaitingAtGrid ? rawThrottle : sim.smoothedThrottle,
        brakeInput: brake,
        slipstreamActive: isSlipstreaming,
        overVoltCharge: sim.overVoltCharge,
        overVoltActive: isOverVoltActive,
        falseStartPenalty: false,
        turboStartActive: isTurboStartActive,
        gapToRivalM,
        playerRacePosition,
        rivalLapCount: liveRivalState.lapCount,
        liveGridStandings: standings,
        tireTempsC: [
          Math.round(sim.tireTempsC[0]),
          Math.round(sim.tireTempsC[1]),
          Math.round(sim.tireTempsC[2]),
          Math.round(sim.tireTempsC[3]),
        ],
        tireThermalGripFactor: Number(sim.tireThermalGripFactor.toFixed(2)),
      });
    }
  });

  return (
    <>
      <SkidmarksRibbon emitterRef={skidEmitterRef} />
      <PredictiveBrakingLine liveStateRef={physicsRef} />
      <group ref={carGroupRef} name="physics-slot-car">
        <CarModel
          modelPath={carStats.modelPath}
          modelYawOffsetRad={carStats.modelYawOffsetRad}
          visualConfig={visualConfig}
          motionRef={visualMotionRef}
          isDerailed={isDerailedVisual}
        />
      </group>
    </>
  );
}

export default PhysicsCar;
