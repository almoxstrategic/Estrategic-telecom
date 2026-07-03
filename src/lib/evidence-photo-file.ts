import { compressEvidencePhoto, waitForImageMemoryRelease } from "@/lib/compress-image";
import type { EvidencePhotoRef } from "@/lib/types";

export async function prepareEvidencePhotoFile(
  file: File,
  existingPreviewUrl?: string | null,
): Promise<EvidencePhotoRef> {
  if (existingPreviewUrl) {
    URL.revokeObjectURL(existingPreviewUrl);
    await waitForImageMemoryRelease();
  }

  const compressed = await compressEvidencePhoto(file);
  await waitForImageMemoryRelease();

  return {
    file: compressed,
    previewUrl: URL.createObjectURL(compressed),
  };
}
