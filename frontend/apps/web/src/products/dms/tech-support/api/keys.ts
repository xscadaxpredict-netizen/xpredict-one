/**
 * Cache key factory for the Tech Support module.
 */

export const techSupportKeys = {
  all: () => ["dms", "tech-support"] as const,

  manuals: () => [...techSupportKeys.all(), "manuals"] as const,
  manualList: () => [...techSupportKeys.manuals(), "list"] as const,

  machineVideos: () => [...techSupportKeys.all(), "machine-videos"] as const,
  machineVideoList: () => [...techSupportKeys.machineVideos(), "list"] as const,

  requestCalls: () => [...techSupportKeys.all(), "request-calls"] as const,
  requestCallList: () => [...techSupportKeys.requestCalls(), "list"] as const,
};
