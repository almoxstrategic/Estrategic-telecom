import { compressEvidencePhoto, waitForImageMemoryRelease } from "@/lib/compress-image";
import { getLocationData } from "@/lib/geo-location";
import { addTimestampToImage } from "@/lib/timestamp-watermark";
import type { EvidencePhotoRef } from "@/lib/types";

export async function prepareEvidencePhotoFile(
  file: File,
  existingPreviewUrl?: string | null,
  options?: { withTimestamp?: boolean },
): Promise<EvidencePhotoRef> {
  if (existingPreviewUrl) {
    URL.revokeObjectURL(existingPreviewUrl);
    await waitForImageMemoryRelease();
  }

  let source = file;
  if (options?.withTimestamp) {
    const location = await getLocationData();
    source = await addTimestampToImage(file, location);
  }

  const compressed = await compressEvidencePhoto(source);
  await waitForImageMemoryRelease();

  return {
    file: compressed,
    previewUrl: URL.createObjectURL(compressed),
  };
}
