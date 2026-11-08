export type AdPlatform = "meta" | "facebook" | "instagram" | "google" | "tiktok" | "other";

export interface AdSpendEntry {
  id: string;
  spendDate: string; // YYYY-MM-DD
  platform: AdPlatform;
  campaignId: string;
  campaignName: string;
  adSetName: string;
  adName: string;
  spend: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdSpendInput {
  spendDate: string;
  platform: AdPlatform;
  campaignId?: string;
  campaignName: string;
  adSetName?: string;
  adName?: string;
  spend: number;
  currency?: string;
}
