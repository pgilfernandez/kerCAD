import { sha256Hex } from "@/lib/projectAssets";
import type { ParametricDocument } from "@/types/parametric";

export function thumbnailDocumentKey(document: ParametricDocument) {
  return sha256Hex(new TextEncoder().encode(JSON.stringify(document)));
}

/** A preview is optional; failure must not turn a successful project save into an error. */
export async function uploadSharedThumbnail(fileName: string, revision: string, document: ParametricDocument, thumbnail?: string, documentKey?: string) {
  const image = document.thumbnailOverride ?? thumbnail;
  if (!image?.startsWith("data:image/jpeg;base64,") || (!document.thumbnailOverride && (!documentKey || documentKey !== await thumbnailDocumentKey(document)))) return;
  try {
    const bytes = Uint8Array.from(atob(image.slice("data:image/jpeg;base64,".length)), character => character.charCodeAt(0));
    await fetch(`/api/educad-shared-projects?fileName=${encodeURIComponent(fileName)}`, {
      method: "PUT", headers: { "Content-Type": "image/jpeg", "If-Match": revision }, body: bytes,
    });
  } catch { /* The project remains saved; cards can display a placeholder. */ }
}
