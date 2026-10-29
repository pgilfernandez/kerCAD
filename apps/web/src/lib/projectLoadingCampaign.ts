export type ProjectLoadingCampaign = {
  kind: "image" | "video";
  src: string;
  poster?: string;
  supportUrl: string | null;
};

/** Used immediately while the sponsor catalogue or its chosen image loads. */
export const projectLoadingCampaign: ProjectLoadingCampaign = {
  kind: "image",
  src: "/assets/kercad/loading-campaign.svg",
  supportUrl: null,
};

let prepared: ProjectLoadingCampaign | null = null;
let preparing: Promise<ProjectLoadingCampaign> | null = null;
let catalogue: string[] | null = null;
let catalogueLoadedAt = 0;

export function peekPreparedLoadingCampaign() { return prepared; }

export function consumePreparedLoadingCampaign(campaign: ProjectLoadingCampaign) {
  if (prepared === campaign) prepared = null;
}

function preloadImage(src: string, priority: "high" | "low") {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.fetchPriority = priority;
    image.decoding = "async";
    image.onload = () => {
      void image.decode().then(resolve, reject);
    };
    image.onerror = () => reject(new Error("Could not preload sponsor image."));
    image.src = src;
  });
}

/** Start on the dashboard, before CAD loading competes for network/CPU time. */
export function prepareProjectLoadingCampaign(priority: "high" | "low" = "high"): Promise<ProjectLoadingCampaign> {
  if (prepared) return Promise.resolve(prepared);
  if (preparing) return preparing;
  preparing = (async () => {
    try {
      if (!catalogue || Date.now() - catalogueLoadedAt > 30_000) {
        const response = await fetch("/api/loading-sponsors", { cache: "no-store" });
        if (!response.ok) throw new Error("Sponsor catalogue unavailable.");
        const body = await response.json() as { images?: unknown };
        catalogue = Array.isArray(body.images) ? body.images.filter((src): src is string => typeof src === "string" && src.startsWith("/sponsors/")) : [];
        catalogueLoadedAt = Date.now();
      }
      const candidates = [...catalogue];
      while (candidates.length) {
        const index = Math.floor(Math.random() * candidates.length);
        const [src] = candidates.splice(index, 1);
        try {
          await preloadImage(src, priority);
          prepared = { kind: "image", src, supportUrl: projectLoadingCampaign.supportUrl };
          return prepared;
        } catch { /* Try another image if an added file cannot be decoded. */ }
      }
    } catch { /* The local fallback also works without the optional server API. */ }
    if (projectLoadingCampaign.kind === "image") {
      try { await preloadImage(projectLoadingCampaign.src, priority); }
      catch { /* A missing fallback must not block the project either. */ }
    }
    prepared = projectLoadingCampaign;
    return prepared;
  })().finally(() => { preparing = null; });
  return preparing;
}
