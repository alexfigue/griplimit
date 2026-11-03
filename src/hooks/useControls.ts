'use client';

import { useEffect, useRef } from 'react';
import { soundEngine } from '@/lib/soundEngine';
import { useTelemetryStore } from '@/store/store';

export interface DriverControlInputs {
  throttle: number;
  brake: number;
}

const pointerPedalState = {
  throttle: 0,
  brake: 0,
};

export function setPointerThrottle(active: boolean): void {
  if (active) soundEngine.unlock();
  pointerPedalState.throttle = active ? 1 : 0;
}

export function setPointerBrake(active: boolean): void {
  if (active) soundEngine.unlock();
  pointerPedalState.brake = active ? 1 : 0;
}

/**
 * Hook de control manual estilo gatillo de Scalextric (Aceleración y Freno sobre carril fijo)
 * + atajos rápidos de teclado para cámara [C], reencarrilar [R], ayuda [H], carril [L] y sonido [M].
 */
export function useControls(): React.RefObject<DriverControlInputs> {
  const inputsRef = useRef<DriverControlInputs>({ throttle: 0, brake: 0 });
  const keyStateRef = useRef<{ throttle: boolean; brake: boolean }>({
    throttle: false,
    brake: false,
  });

  useEffect(() => {
    const syncCombinedInputs = () => {
      inputsRef.current.throttle =
        keyStateRef.current.throttle || pointerPedalState.throttle > 0 ? 1 : 0;
      inputsRef.current.brake =
        keyStateRef.current.brake || pointerPedalState.brake > 0 ? 1 : 0;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const targetTag = (event.target as HTMLElement | null)?.tagName;
      if (
        targetTag === 'INPUT' ||
        targetTag === 'TEXTAREA' ||
        targetTag === 'SELECT'
      ) {
        return;
      }

      soundEngine.unlock();
      if (event.repeat) return;

      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'Space':
          event.preventDefault();
          keyStateRef.current.throttle = true;
          syncCombinedInputs();
          break;
        case 'KeyS':
        case 'ArrowDown':
        case 'ShiftLeft':
        case 'ShiftRight':
          event.preventDefault();
          keyStateRef.current.brake = true;
          syncCombinedInputs();
          break;
        case 'KeyR':
          useTelemetryStore.getState().requestTrackReset();
          break;
        case 'KeyC':
          useTelemetryStore.getState().toggleCameraMode();
          break;
        case 'KeyH':
          useTelemetryStore.getState().toggleAssist();
          break;
        case 'KeyL':
          useTelemetryStore.getState().togglePlayerLane();
          break;
        case 'KeyM':
          useTelemetryStore.getState().toggleSound();
          break;
        case 'KeyE':
          useTelemetryStore.getState().toggleEnvironmentStyle();
          break;
        case 'KeyG':
          useTelemetryStore.getState().toggleGhost();
          break;
        case 'KeyB':
          useTelemetryStore.getState().triggerOverVolt();
          break;
        case 'KeyV':
          useTelemetryStore.getState().toggleWeatherMode();
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'Space':
          keyStateRef.current.throttle = false;
          syncCombinedInputs();
          break;
        case 'KeyS':
        case 'ArrowDown':
        case 'ShiftLeft':
        case 'ShiftRight':
          keyStateRef.current.brake = false;
          syncCombinedInputs();
          break;
      }
    };

    const handleWindowBlur = () => {
      keyStateRef.current.throttle = false;
      keyStateRef.current.brake = false;
      pointerPedalState.throttle = 0;
      pointerPedalState.brake = 0;
      syncCombinedInputs();
    };

    const pointerSyncInterval = window.setInterval(syncCombinedInputs, 16);

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.clearInterval(pointerSyncInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  return inputsRef;
}
