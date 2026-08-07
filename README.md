# Metaball Brand Kit

A WebGL shader tool for generating brand-kit imagery from an image-driven dot grid with metaball blending and field-based contour coloring.

Upload a source image — darker regions produce larger dots that merge organically when close together. Tune the grid, color ramp, and merge behavior, then export PNGs at common brand-kit resolutions.

## Setup

```bash
npm install
npm run dev
```

Open the local dev server in a WebGL2-capable browser.

## Build

```bash
npm run build
npm run preview
```

## Controls

| Control | Description |
|---------|-------------|
| **Image upload** | Source image that drives dot size per grid cell |
| **Invert mapping** | Swap mapping so lighter areas produce larger dots |
| **Grid columns / rows** | Number of dots across and down (4–80 each) |
| **Min / max dot radius** | Size range mapped from image luminance |
| **Merge threshold** | Lower values merge dots more aggressively |
| **Softness** | Metaball falloff sharpness |
| **Edge smoothness** | Anti-aliasing width at blob edges |
| **Color ramp stops** | 3–5 colors mapped from blob edge to core (Edge → Core) |
| **Color spread** | How far inward the ramp transitions from edge to core colors |
| **Contour bands** | 1 = smooth gradient; 4+ = stepped isocontour banding |
| **Background** | Flat canvas background color |

## Color Ramp

Blob color is driven by the metaball field strength, not a flat fill:

- **Edge stops** (first color) appear at the blob surface — thin halos and outlines
- **Mid stops** fill the body of merged shapes
- **Core stop** (last color) appears in the thickest, highest-field regions

Increase **Contour bands** for a topographic / heat-map look with visible color steps. Adjust **Color spread** to widen or narrow the edge halo relative to the core.

Default ramp: cyan edge → lime contour → orange body → peach core on a neutral background.

## Presets

Settings are saved in your browser so you can pick up where you left off.

- **Save preset** — stores the current grid, ramp, colors, and uploaded image under a name
- **Load** — click a saved preset name to restore it
- **Delete** — removes a saved preset
- **Reset defaults** — restores the factory settings and clears the uploaded image

Your last session is also auto-saved as you adjust controls, and restored automatically on the next visit.

## Export

Use the export buttons to download PNG files at these preset sizes:

- **1080×1080** — square social / app icon
- **2048×2048** — high-res square
- **1920×1080** — landscape HD
- **3840×2160** — 4K landscape
- **1080×1920** — portrait mobile / story

Exports render at full resolution offscreen, independent of the preview canvas size.

## How it works

Each grid cell samples the uploaded image at its center UV. Luminance maps to dot radius (dark = large by default). A fragment shader sums metaball fields from every dot. Where the field exceeds the threshold, color is looked up from the multi-stop ramp based on normalized field strength. Nearby dots merge because their fields add together, carrying contour bands through bridges and necks.

## Requirements

- Node.js 18+
- A browser with WebGL2 support
