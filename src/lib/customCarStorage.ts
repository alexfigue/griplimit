import type { BodyShellPart, CustomAeroArchetype } from '@/types/types';

/**
 * Almacenamiento persistente en IndexedDB para coches .glb importados de la comunidad
 * (Sketchfab, Poly Pizza, Kenney, Blender, etc.).
 * Permite que los modelos subidos mediante Drag & Drop sobrevivan recargas de la PWA.
 */

const DB_NAME = 'griplimit_community_cars_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_glb_cars';

export interface StoredCustomCarRecord {
  id: string;
  name: string;
  author: string;
  archetype: CustomAeroArchetype;
  /** Pasos de rotación de 90° (0, 1, 2, 3) para alinear cualquier eje de exportación de Blender/Sketchfab */
  yawQuarterSteps: number;
  glbBuffer: ArrayBuffer;
  createdAt: number;
}

const activeObjectUrls = new Map<string, string>();

const ARCHETYPE_SPECS: Record<
  CustomAeroArchetype,
  { weight: number; downforceCoeff: number; aeroSpeedFactor: number; label: string }
> = {
  balanced: {
    weight: 14,
    downforceCoeff: 0.55,
    aeroSpeedFactor: 1.01,
    label: 'Equilibrado Sport',
  },
  downforce: {
    weight: 16,
    downforceCoeff: 1.05,
    aeroSpeedFactor: 0.96,
    label: 'Gran Carga Aero GT',
  },
  topspeed: {
    weight: 12,
    downforceCoeff: 0.24,
    aeroSpeedFactor: 1.06,
    label: 'Cola Larga Velocidad',
  },
};

function openCustomCarDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB no disponible en este entorno.'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error abriendo IndexedDB'));
  });
}

export function recordToBodyShellPart(record: StoredCustomCarRecord): BodyShellPart {
  let url = activeObjectUrls.get(record.id);
  if (!url) {
    const blob = new Blob([record.glbBuffer], { type: 'model/gltf-binary' });
    url = URL.createObjectURL(blob);
    activeObjectUrls.set(record.id, url);
  }

  const spec = ARCHETYPE_SPECS[record.archetype] ?? ARCHETYPE_SPECS.balanced;

  return {
    id: record.id,
    name: record.name,
    description: `Modelo .glb importado (${spec.label}). Pulsa 'Girar 90°' si el morro mira hacia otro eje.`,
    modelPath: url,
    weight: spec.weight,
    downforceCoeff: spec.downforceCoeff,
    aeroSpeedFactor: spec.aeroSpeedFactor,
    price: 0,
    yawOffsetRad: (record.yawQuarterSteps % 4) * (Math.PI / 2),
    isCustom: true,
    author: record.author,
  };
}

export async function loadAllCommunityCars(): Promise<BodyShellPart[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];
  try {
    const db = await openCustomCarDB();
    return await new Promise<BodyShellPart[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as StoredCustomCarRecord[]) ?? [];
        records.sort((a, b) => a.createdAt - b.createdAt);
        resolve(records.map(recordToBodyShellPart));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveNewCommunityCar(
  file: File,
  archetype: CustomAeroArchetype,
  authorName?: string
): Promise<BodyShellPart> {
  const buffer = await file.arrayBuffer();
  const cleanName = file.name
    .replace(/\.(glb|gltf)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 28);

  const record: StoredCustomCarRecord = {
    id: `custom_car_${Date.now()}`,
    name: cleanName || 'Prototipo Comunidad',
    author: authorName?.trim() || 'Comunidad 3D',
    archetype,
    yawQuarterSteps: 0,
    glbBuffer: buffer,
    createdAt: Date.now(),
  };

  const db = await openCustomCarDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return recordToBodyShellPart(record);
}

export async function rotateStoredCommunityCar(
  carId: string
): Promise<BodyShellPart | null> {
  const db = await openCustomCarDB();
  const existing = await new Promise<StoredCustomCarRecord | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(carId);
      req.onsuccess = () =>
        resolve(req.result as StoredCustomCarRecord | undefined);
      req.onerror = () => reject(req.error);
    }
  );

  if (!existing) return null;

  existing.yawQuarterSteps = (existing.yawQuarterSteps + 1) % 4;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(existing);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return recordToBodyShellPart(existing);
}

export async function removeStoredCommunityCar(carId: string): Promise<void> {
  const url = activeObjectUrls.get(carId);
  if (url) {
    URL.revokeObjectURL(url);
    activeObjectUrls.delete(carId);
  }

  const db = await openCustomCarDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(carId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
