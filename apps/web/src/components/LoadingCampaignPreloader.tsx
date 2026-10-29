"use client";

import { useEffect } from "react";
import { prepareProjectLoadingCampaign } from "@/lib/projectLoadingCampaign";

export function LoadingCampaignPreloader() {
  useEffect(() => { void prepareProjectLoadingCampaign(); }, []);
  return null;
}
