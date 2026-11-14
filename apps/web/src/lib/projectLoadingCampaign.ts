export type ProjectLoadingCampaign = {
  kind: "image" | "video";
  src: string;
  poster?: string;
  supportUrl: string | null;
};

/** Used immediately while the sponsor catalogue or its chosen image loads. */
export const projectLoadingCampaign: ProjectLoadingCampaign = {
  kind: "image",
  src: "/assets/kercad/sponsors/loading-campaign.svg",
  supportUrl: "https://github.com/sponsors/pgilfernandez",
};

let prepared: ProjectLoadingCampaign | null = null;
let preparedAt = 0;
let preparing: Promise<ProjectLoadingCampaign> | null = null;
let catalogue: string[] | null = null;
let catalogueLoadedAt = 0;
const CATALOGUE_REFRESH_MS = 30_000;

export function peekPreparedLoadingCampaign() {
  return prepared && Date.now() - preparedAt < CATALOGUE_REFRESH_MS ? prepared : null;
}

export function consumePreparedLoadingCampaign(campaign: ProjectLoadingCampaign) {
  if (prepared === campaign) prepared = null;
}

function preloadImage(src: string, priority: "high" | "low") {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.fetchPriority = priority;
    image.decoding = "async";
    image.onload = () => {
      // Some browsers reject decode() for SVGs despite a successful load. That
      // must not discard artwork the browser can already display.
      if (typeof image.decode === "function") void image.decode().then(resolve, () => resolve());
      else resolve();
    };
    image.onerror = () => reject(new Error("Could not preload sponsor image."));
    image.src = src;
  });
}

/** Start on the dashboard, before CAD loading competes for network/CPU time. */
export function prepareProjectLoadingCampaign(priority: "high" | "low" = "high"): Promise<ProjectLoadingCampaign> {
  const cached = peekPreparedLoadingCampaign();
  if (cached) return Promise.resolve(cached);
  if (preparing) return preparing;
  preparing = (async () => {
    try {
      if (!catalogue?.length || Date.now() - catalogueLoadedAt >= CATALOGUE_REFRESH_MS) {
        const response = await fetch("/api/loading-sponsors", { cache: "no-store" });
        if (!response.ok) throw new Error("Sponsor catalogue unavailable.");
        const body = await response.json() as { images?: unknown };
        catalogue = Array.isArray(body.images) ? body.images.filter((src): src is string => typeof src === "string" && src.startsWith("/assets/kercad/sponsors/")) : [];
        catalogueLoadedAt = Date.now();
      }
      const candidates = [...catalogue];
      while (candidates.length) {
        const index = Math.floor(Math.random() * candidates.length);
        const [src] = candidates.splice(index, 1);
        try {
          await preloadImage(src, priority);
          prepared = { kind: "image", src, supportUrl: projectLoadingCampaign.supportUrl };
          preparedAt = Date.now();
          return prepared;
        } catch { /* Try another image if an added file cannot be decoded. */ }
      }
    } catch { /* The local fallback also works without the optional server API. */ }
    if (projectLoadingCampaign.kind === "image") {
      try { await preloadImage(projectLoadingCampaign.src, priority); }
      catch { /* A missing fallback must not block the project either. */ }
    }
    // Do not cache a fallback as a successful sponsor: an image may have been
    // added since startup, or the optional API may only have failed temporarily.
    prepared = null;
    catalogue = null;
    return projectLoadingCampaign;
  })().finally(() => { preparing = null; });
  return preparing;
}
