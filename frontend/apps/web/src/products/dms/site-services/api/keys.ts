/**
 * Cache key factory for the Site Services module.
 */

export const siteServicesKeys = {
  all: () => ["dms", "site-services"] as const,

  serviceReports: () => [...siteServicesKeys.all(), "service-reports"] as const,
  serviceReportList: () => [...siteServicesKeys.serviceReports(), "list"] as const,

  waterReports: () => [...siteServicesKeys.all(), "water-reports"] as const,
  waterReportList: () => [...siteServicesKeys.waterReports(), "list"] as const,

  scheduling: () => [...siteServicesKeys.all(), "scheduling"] as const,
  scheduleList: () => [...siteServicesKeys.scheduling(), "list"] as const,

  complaints: () => [...siteServicesKeys.all(), "complaints"] as const,
  complaintList: () => [...siteServicesKeys.complaints(), "list"] as const,

  amc: () => [...siteServicesKeys.all(), "amc"] as const,
  amcList: () => [...siteServicesKeys.amc(), "list"] as const,
};
