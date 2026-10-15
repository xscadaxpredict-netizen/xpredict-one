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
    //
    // THESE FOUR ASK THE BACKEND'S OWN QUESTION, not `isManagerOrAdmin`.
    // Manuals, videos and marketing material are organisation-wide rows
    // (`BaseModel`, no unit_id), so the API grants them at organisation level
    // only -- `dms.group_operations`, which is also the role an owner is
    // seeded with. Keying these off `isManagerOrAdmin` showed a dealership
    // Manager an Upload button that answered 403, which is C55's lesson
    // pointing the other way: the UI must not be more generous than the API
    // either.
    canUploadManual: access.can("dms.manual.manage"),
    canDeleteManual: access.can("dms.manual.manage"),
    canUploadVideo: access.can("dms.video.manage"),
    canDeleteVideo: access.can("dms.video.manage"),
    canManageMarketing: access.can("dms.marketing_asset.manage"),
    // Bank accounts, which this change did not touch -- their endpoint still
    // authorises on membership, so the old rule stands here rather than being
    // tightened on a guess.
    canManageSettings: isManagerOrAdmin,

    // Tools
    canUseCalculator: access.hasModule("tools"),
    canAccessMarketingKit: access.hasModule("tools"),
    canAccessFeasibility: access.hasModule("tools"),
    // The constants every capacity calculation in the organisation is sized
    // from. Organisation-level, same as the library above.
    canConfigureCalculator: access.can("dms.calculator.manage"),

    // Ecommerce
    //
    // `dms.order.create` IS THE WRONG CODE HERE and was the subtler half of
    // the mismatch: that permission is for a SALES order raised for a
    // customer, which a sales representative holds. A store order is the
    // dealership buying from the manufacturer, so it has its own code -- and
    // a rep was shown Add to Cart, then refused at checkout.
    canAddToCart: access.can("dms.store_order.create"),
    canApproveOrder: access.can("dms.store_order.manage"),
    canDeliverOrder: access.can("dms.store_order.manage"),
    canRejectOrder: access.can("dms.store_order.manage"),
    canDeleteEcommerceOrder: access.can("dms.store_order.manage"),
    canManageProducts: isManagerOrAdmin,
  };
}
