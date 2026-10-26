import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/lib/parametricDocument";
import { thumbnailDocumentKey, uploadSharedThumbnail } from "@/lib/sharedProjectThumbnail";

afterEach(() => vi.unstubAllGlobals());
it("does not upload a preview captured for an older document", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const document = createEmptyDocument();
  const key = await thumbnailDocumentKey(document);
  document.name = "Changed";
  await uploadSharedThumbnail("Test.kercad", "revision", document, "data:image/jpeg;base64,/9j/2Q==", key);
  expect(fetch).not.toHaveBeenCalled();
});
it("uploads with the saved revision and tolerates unavailable preview storage", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("Offline")); vi.stubGlobal("fetch", fetch);
  const document = createEmptyDocument();
  await expect(uploadSharedThumbnail("Test.kercad", "revision", document, "data:image/jpeg;base64,/9j/2Q==", await thumbnailDocumentKey(document))).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "PUT", headers: { "Content-Type": "image/jpeg", "If-Match": "revision" } }));
});
