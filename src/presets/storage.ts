import {
  DEFAULT_STATE,
  MAX_RAMP_STOPS,
  MIN_RAMP_STOPS,
  type ControlState,
  type Rgb,
} from "../types";

export const SESSION_KEY = "metaball-session";
export const PRESETS_KEY = "metaball-presets";
export const LAST_PRESET_KEY = "metaball-last-preset-id";

export interface StoredSession {
  version: 1;
  state: ControlState;
  imageDataUrl: string | null;
}

export interface SavedPreset {
  id: string;
  name: string;
  state: ControlState;
  imageDataUrl: string | null;
  updatedAt: number;
}

function isRgb(value: unknown): value is Rgb {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((channel) => typeof channel === "number")
  );
}

function isControlState(value: unknown): value is ControlState {
  if (!value || typeof value !== "object") return false;

  const state = value as Record<string, unknown>;
  const numericKeys = [
    "cols",
    "rows",
    "minRadius",
    "maxRadius",
    "threshold",
    "softness",
    "edge",
    "colorRange",
    "contourBands",
  ] as const;

  if (!numericKeys.every((key) => typeof state[key] === "number")) {
    return false;
  }

  if (!Array.isArray(state.rampColors) || !state.rampColors.every(isRgb)) {
    return false;
  }

  const rampLength = state.rampColors.length;
  if (rampLength < MIN_RAMP_STOPS || rampLength > MAX_RAMP_STOPS) {
    return false;
  }

  return (
    isRgb(state.bgColor) &&
    typeof state.invert === "boolean" &&
    typeof state.hasImage === "boolean"
  );
}

function normalizeState(state: ControlState): ControlState {
  return {
    ...state,
    cols: Math.round(state.cols),
    rows: Math.round(state.rows),
    rampColors: state.rampColors.map((color) => [...color] as Rgb),
    bgColor: [...state.bgColor],
    hasImage: false,
  };
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.version !== 1 || !isControlState(parsed.state)) {
      return null;
    }

    return {
      version: 1,
      state: normalizeState(parsed.state),
      imageDataUrl:
        typeof parsed.imageDataUrl === "string" ? parsed.imageDataUrl : null,
    };
  } catch {
    return null;
  }
}

export function saveSession(
  state: ControlState,
  imageDataUrl: string | null,
): void {
  const payload: StoredSession = {
    version: 1,
    state: normalizeState(state),
    imageDataUrl,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function loadPresetList(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as SavedPreset[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (preset) =>
        typeof preset.id === "string" &&
        typeof preset.name === "string" &&
        isControlState(preset.state),
    );
  } catch {
    return [];
  }
}

export function savePresetList(presets: SavedPreset[]): void {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function upsertPreset(
  name: string,
  state: ControlState,
  imageDataUrl: string | null,
): SavedPreset {
  const presets = loadPresetList();
  const trimmed = name.trim() || "Untitled preset";
  const existing = presets.find(
    (preset) => preset.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const next: SavedPreset = {
    id: existing?.id ?? crypto.randomUUID(),
    name: trimmed,
    state: normalizeState(state),
    imageDataUrl,
    updatedAt: Date.now(),
  };

  const withoutExisting = presets.filter((preset) => preset.id !== next.id);
  savePresetList([next, ...withoutExisting]);
  localStorage.setItem(LAST_PRESET_KEY, next.id);
  return next;
}

export function deletePreset(id: string): void {
  const presets = loadPresetList().filter((preset) => preset.id !== id);
  savePresetList(presets);

  if (localStorage.getItem(LAST_PRESET_KEY) === id) {
    localStorage.removeItem(LAST_PRESET_KEY);
  }
}

export function getInitialSession(): StoredSession {
  const lastPresetId = localStorage.getItem(LAST_PRESET_KEY);
  if (lastPresetId) {
    const preset = loadPresetList().find((entry) => entry.id === lastPresetId);
    if (preset) {
      return {
        version: 1,
        state: structuredClone(preset.state),
        imageDataUrl: preset.imageDataUrl,
      };
    }
  }

  const session = loadSession();
  if (session) return session;

  return {
    version: 1,
    state: structuredClone(DEFAULT_STATE),
    imageDataUrl: null,
  };
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image file"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToImageBitmap(
  dataUrl: string,
): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}
