/** Replace the local artwork with an image or a short, muted video campaign. */
export const projectLoadingCampaign: {
  kind: "image" | "video";
  src: string;
  poster?: string;
  supportUrl: string | null;
} = {
  kind: "image",
  src: "/assets/kercad/loading-campaign.svg",
  supportUrl: null,
};
