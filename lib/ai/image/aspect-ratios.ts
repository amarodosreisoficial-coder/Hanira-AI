export const IMAGE_ASPECT_RATIO_PRESETS = ["1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"] as const;
export type ImageAspectRatioPreset = (typeof IMAGE_ASPECT_RATIO_PRESETS)[number];
export const IMAGE_ASPECT_RATIO_DIMENSIONS: Record<ImageAspectRatioPreset, { readonly width: number; readonly height: number }> = Object.freeze({
  "1:1": { width: 512, height: 512 }, "3:4": { width: 384, height: 512 }, "4:3": { width: 512, height: 384 }, "4:5": { width: 400, height: 512 }, "5:4": { width: 512, height: 400 }, "9:16": { width: 288, height: 512 }, "16:9": { width: 512, height: 288 },
});
export function resolveImageAspectRatio(value: unknown) { return typeof value === "string" && value in IMAGE_ASPECT_RATIO_DIMENSIONS ? value as ImageAspectRatioPreset : "1:1" as const; }
