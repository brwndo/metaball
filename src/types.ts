export type Rgb = [number, number, number];

export const MIN_RAMP_STOPS = 3;
export const MAX_RAMP_STOPS = 5;

export interface ControlState {
  cols: number;
  rows: number;
  minRadius: number;
  maxRadius: number;
  threshold: number;
  softness: number;
  edge: number;
  rampColors: Rgb[];
  colorRange: number;
  contourBands: number;
  bgColor: Rgb;
  invert: boolean;
  hasImage: boolean;
}

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const DEFAULT_RAMP_COLORS: Rgb[] = [
  [0.494, 0.784, 0.91], // #7ec8e8 edge cyan
  [0.722, 0.902, 0.188], // #b8e630 lime
  [0.941, 0.353, 0.157], // #f05a28 orange
  [0.961, 0.769, 0.722], // #f5c4b8 peach core
];

export const DEFAULT_STATE: ControlState = {
  cols: 24,
  rows: 24,
  minRadius: 0.008,
  maxRadius: 0.06,
  threshold: 1.0,
  softness: 0.0008,
  edge: 0.15,
  rampColors: [...DEFAULT_RAMP_COLORS],
  colorRange: 1.5,
  contourBands: 4,
  bgColor: [0.882, 0.886, 0.839],
  invert: false,
  hasImage: false,
};

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: "1080-square", label: "1080×1080", width: 1080, height: 1080 },
  { id: "2048-square", label: "2048×2048", width: 2048, height: 2048 },
  { id: "1920-1080", label: "1920×1080", width: 1920, height: 1080 },
  { id: "3840-2160", label: "3840×2160", width: 3840, height: 2160 },
  { id: "1080-1920", label: "1080×1920", width: 1080, height: 1920 },
];
