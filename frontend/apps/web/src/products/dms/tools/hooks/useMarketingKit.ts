import { useParams } from "react-router-dom";
import { useTools } from "../api/tools";
import type { MaterialType } from "../api/types";

export function useMarketingKit() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const tools = useTools(orgSlug!);

  const addMaterial = (type: MaterialType, item: any) => {
    // Expected to be a FormData object from the UI
    tools.uploadMaterial(item);
  };

  const updateMaterial = (type: MaterialType, id: string, updates: any) => {
    // Currently API doesn't support PATCH for materials, so we'll just ignore for now or implement later
    console.warn("Update material not implemented yet via API");
  };

  const deleteMaterial = (type: MaterialType | string, id: string) => {
    tools.deleteMaterial(id);
  };

  return {
    brochures: tools.brochures,
    videos: tools.videos,
    ads: tools.ads,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    isPending: tools.marketingPending
  };
}
