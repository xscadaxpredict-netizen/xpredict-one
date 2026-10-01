/**
 * Cache key factory for the Tools module.
 */

export const toolsKeys = {
  all: () => ["dms", "tools"] as const,

  marketing: () => [...toolsKeys.all(), "marketing"] as const,
  brochures: () => [...toolsKeys.marketing(), "brochures"] as const,
  videos: () => [...toolsKeys.marketing(), "videos"] as const,
  ads: () => [...toolsKeys.marketing(), "ads"] as const,

  calculator: () => [...toolsKeys.all(), "calculator"] as const,

  feasibility: () => [...toolsKeys.all(), "feasibility"] as const,
};
