import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { IMAGE_ASPECT_RATIO_DIMENSIONS } from "@/lib/ai/image/aspect-ratios";
import { createProductionImageRouter } from "@/lib/ai/image/runtime";
import { validateImageRequest } from "@/lib/validation/image-request";

export const dynamic = "force-dynamic";
function error(code: "authentication_required" | "invalid_request" | "capacity_unavailable" | "generation_unavailable", status: number) { return NextResponse.json({ success: false, errorCode: code }, { status }); }
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return error("authentication_required", 401);
  try {
    const input = validateImageRequest(await request.json());
    const dimensions = IMAGE_ASPECT_RATIO_DIMENSIONS[input.aspectRatio];
    const references = input.references.map((reference, index) => ({ id: `reference-${index}`, mimeType: reference.mimeType, sizeBytes: reference.sizeBytes, data: new Blob([Buffer.from(reference.dataUrl.split(",", 2)[1], "base64")], { type: reference.mimeType }) }));
    const result = await createProductionImageRouter().execute({ prompt: input.prompt, operation: references.length ? "edit" : "generate", aspectRatio: input.aspectRatio, width: dimensions.width, height: dimensions.height, references });
    if (!result.success || !result.imageData || !result.mimeType) return error(result.errorCode === "capacity_unavailable" ? "capacity_unavailable" : "generation_unavailable", result.errorCode === "capacity_unavailable" ? 503 : 502);
    const dataUrl = `data:${result.mimeType};base64,${Buffer.from(result.imageData).toString("base64")}`;
    return NextResponse.json({ success: true, providerId: result.providerId, modelId: result.modelId, mimeType: result.mimeType, width: result.width, height: result.height, mock: result.mock, durationMs: result.durationMs, dataUrl });
  } catch { return error("invalid_request", 400); }
}
