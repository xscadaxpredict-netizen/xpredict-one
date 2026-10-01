/**
 * Hooks for Tools — marketing kit state management.
 *
 * Manages brochures, videos, and ad banners.
 */

import { useState, useCallback } from "react";
import type { Brochure, Video, AdBanner, MaterialType } from "../api/types";
import { SEED_BROCHURES, SEED_VIDEOS, SEED_ADS } from "../api/tools";

export function useMarketingKit() {
  const [brochures, setBrochures] = useState<Brochure[]>(SEED_BROCHURES);
  const [videos, setVideos] = useState<Video[]>(SEED_VIDEOS);
  const [ads, setAds] = useState<AdBanner[]>(SEED_ADS);

  const addMaterial = useCallback((type: MaterialType, item: any) => {
    if (type === "brochure") setBrochures((prev) => [item, ...prev]);
    else if (type === "video") setVideos((prev) => [item, ...prev]);
    else setAds((prev) => [item, ...prev]);
  }, []);

  const updateMaterial = useCallback((type: MaterialType, id: string, updates: any) => {
    if (type === "brochure") setBrochures((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    else if (type === "video") setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...updates } : v)));
    else setAds((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const deleteMaterial = useCallback((type: MaterialType | string, id: string) => {
    if (type === "brochure") setBrochures((prev) => prev.filter((b) => b.id !== id));
    else if (type === "video") setVideos((prev) => prev.filter((v) => v.id !== id));
    else setAds((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    brochures,
    videos,
    ads,
    setBrochures,
    setVideos,
    setAds,
    addMaterial,
    updateMaterial,
    deleteMaterial,
  };
}
