import { useAccess } from "../../../../shell/access";
import { useShellContext } from "../../../../shell/context";

export function useDmsPermissions() {
  const access = useAccess();
  const { membership } = useShellContext();

  const isOwnerOrAdmin = membership.role === "owner" || membership.role === "admin";
  const isSystemAdmin = membership.apps.some((a) => a.permissions.includes("admin.person.invite"));
  const isManager = access.can("dms.enquiry.close") && access.can("dms.order.confirm");
  const isManagerOrAdmin = isOwnerOrAdmin || isManager || isSystemAdmin;

  return {
    isOwnerOrAdmin,
    isSystemAdmin,
    isManager,
    isManagerOrAdmin,

    // General capabilities
    can: access.can,
    hasModule: access.hasModule,
    canViewEcommerce: access.hasModule("ecommerce"),
    canViewTools: access.hasModule("tools"),

    // Sales: Enquiries
    canCreateEnquiry: isManagerOrAdmin || access.can("dms.enquiry.create"),
    canEditEnquiry: isManagerOrAdmin || access.can("dms.enquiry.update"),
    canDeleteEnquiry: isManagerOrAdmin,
    canAssignEnquiry: isManagerOrAdmin || access.can("dms.enquiry.assign"),
    canCloseEnquiry: isManagerOrAdmin || access.can("dms.enquiry.close"),
    canExportEnquiries: isManagerOrAdmin || access.can("dms.enquiry.export"),

    // Sales: Quotations
    canCreateQuote: isManagerOrAdmin || access.can("dms.quotation.create"),
    canEditQuote: isManagerOrAdmin || access.can("dms.quotation.update"),
    canApproveQuote: isManagerOrAdmin || access.can("dms.quotation.approve"),
    canDeleteQuote: isManagerOrAdmin,
    canExportQuotes: isManagerOrAdmin || access.can("dms.quotation.export"),

    // Sales: Confirmed Orders
    canCreateOrder: isManagerOrAdmin || access.can("dms.order.create"),
    canConfirmOrder: isManagerOrAdmin || access.can("dms.order.confirm"),
    canUnconfirmOrder: isManagerOrAdmin,
    canDeleteOrder: isManagerOrAdmin,
    canExportOrders: isManagerOrAdmin || access.can("dms.order.export"),

    // Site Services: AMC
    canCreateAMC: isManagerOrAdmin || access.can("dms.appointment.create"),
    canEditAMC: isManagerOrAdmin || access.can("dms.appointment.update"),
    canDeleteAMC: isManagerOrAdmin,

    // Site Services: Scheduling
    canScheduleService: isManagerOrAdmin || access.can("dms.appointment.create"),
    canEditSchedule: isManagerOrAdmin || access.can("dms.appointment.update"),
    canCancelSchedule: isManagerOrAdmin || access.can("dms.appointment.cancel"),

    // Site Services: Service Reports
    canCreateReport: isManagerOrAdmin || access.can("dms.jobcard.create"),
    canEditReport: isManagerOrAdmin || access.can("dms.jobcard.update"),
    canSignReport: isManagerOrAdmin || access.can("dms.jobcard.close"),
    canDeleteReport: isManagerOrAdmin,
    canExportReports: isManagerOrAdmin || access.can("dms.jobcard.export"),

    // Site Services: Water Reports
    canCreateWaterReport: isManagerOrAdmin || access.can("dms.jobcard.create") || access.can("dms.appointment.create"),
    canEditWaterReport: isManagerOrAdmin || access.can("dms.jobcard.update") || access.can("dms.appointment.update"),
    canDeleteWaterReport: isManagerOrAdmin,

    // Site Services: Complaints
    canCreateComplaint: isManagerOrAdmin || access.can("dms.ticket.create") || access.can("dms.appointment.create"),
    canEditComplaint: isManagerOrAdmin || access.can("dms.ticket.update") || access.can("dms.appointment.update"),
    canResolveComplaint: isManagerOrAdmin || access.can("dms.ticket.close"),
    canDeleteComplaint: isManagerOrAdmin,

    // Tech Support: Call Requests
    canCreateCallRequest: isManagerOrAdmin || access.can("dms.ticket.create"),
    canEditCallRequest: isManagerOrAdmin || access.can("dms.ticket.update"),
    canResolveCallRequest: isManagerOrAdmin || access.can("dms.ticket.close"),
    canDeleteCallRequest: isManagerOrAdmin,

    // Tech Support / Settings: Uploads & Master Data
    canUploadManual: isManagerOrAdmin,
    canDeleteManual: isManagerOrAdmin,
    canUploadVideo: isManagerOrAdmin,
    canDeleteVideo: isManagerOrAdmin,
    canManageSettings: isManagerOrAdmin,

    // Tools
    canUseCalculator: access.hasModule("tools"),
    canAccessMarketingKit: access.hasModule("tools"),
    canAccessFeasibility: access.hasModule("tools"),
    canConfigureCalculator: isManagerOrAdmin,

    // Ecommerce
    canAddToCart: isManagerOrAdmin || access.can("dms.order.create"),
    canApproveOrder: isManagerOrAdmin,
    canDeliverOrder: isManagerOrAdmin,
    canRejectOrder: isManagerOrAdmin,
    canDeleteEcommerceOrder: isManagerOrAdmin,
    canManageProducts: isManagerOrAdmin,
  };
}
