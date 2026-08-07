import type { ExportPreset } from "../types";
import type { Renderer } from "../webgl/Renderer";

function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create 2D context for export");
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create PNG blob"));
        }
      },
      "image/png",
    );
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportPreset(
  renderer: Renderer,
  preset: ExportPreset,
): Promise<void> {
  const imageData = renderer.renderToSize(preset.width, preset.height);
  const blob = await imageDataToBlob(imageData);
  triggerDownload(blob, `brand-kit-${preset.id}.png`);
}
