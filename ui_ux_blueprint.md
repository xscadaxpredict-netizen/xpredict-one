# Xpredict DMS Portal — UI/UX & Feature Flow Blueprint

This document captures the essence of the UI, UX patterns, and feature flows from the prototype `xpredict-ui`. It serves as a blueprint for implementing the same logical flow and features in a new project with a different, minimalistic design system.

---

## 1. Core UX Philosophy & Interaction Patterns

The application relies on a few key interaction patterns to keep the interface clean while handling complex data.

### A. The "Expandable Row" Pattern (Master-Detail View)
Instead of navigating to a separate page to view details, the primary view is a data table. Clicking a row expands it to reveal nested data and related actions.
*   **Where it's used:**
    *   **CRM:** Row shows Enquiry summary; Expanded view shows Full Address, Remarks, and Follow-up History.
    *   **AMC:** Row shows Site & Latest Quote; Expanded view shows Site Details and Quotation History (with View/Confirm/Delete buttons).
*   **Why it works:** Keeps the user in context, minimizes page loads, and allows quick scanning of top-level data.

### B. The "Modal-First" Data Entry
All complex data entry (Quotation creation, Service Report creation) happens within large, well-structured modals overlaying the current screen.
*   **Where it's used:** Quote Generation, Follow-up entry, New Service Report, Client Signature.
*   **Why it works:** Prevents context switching. The user can see the underlying data table while filling out a related form.

### C. Contextual Filtering (Global Selectors)
In modules dealing with specific entities (like Deployed Sites), a top-level dropdown filters the entire view.
*   **Where it's used:** Site Services (Service Reports, Water Reports, Complaints), Ecommerce.
*   **Why it works:** The user selects a "Site" once at the top, and the tables below instantly update to show only records for that site.

### D. Safety & Friction for Critical Actions
Destructive actions or major state changes require explicit confirmation.
*   **Where it's used:** Deleting a quote, Confirming an order, Confirming an AMC.
*   **Pattern:** `window.confirm()` or custom popups ("Are you sure you want to confirm this?").

---

## 2. Feature Flow by Module

### Module 1: CRM (Enquiries & Orders)
**Goal:** Track leads from initial contact to a confirmed sale.

*   **Flow:**
    1.  **Lead Capture:** User clicks "New Enquiry" -> Simple modal (Name, Phone, Address, Pincode, Initial Remarks). Status becomes `PENDING`.
    2.  **Follow-ups:** User clicks "Follow-up" on an enquiry row -> Modal (Remarks, Next Date). History is appended to the expanded row view.
    3.  **Quotation Generation:** User clicks "Create Quote" -> Large Modal.
        *   Auto-fills "To" details from the Enquiry.
        *   User adds Line Items (can select from a predefined Product Catalog to auto-fill description/price).
        *   Calculates Subtotal, GST, and Total dynamically.
    4.  **Confirmation:** User clicks "Confirm Order" on a quote.
        *   System prompts for confirmation.
        *   Status changes to `CONFIRMED`.
        *   System generates an Order Confirmation (OC) Number.
    5.  **Transition:** The enquiry now disappears from "Follow-ups" and appears in "Confirmed Orders". It also becomes available globally as a "Deployed Site".

### Module 2: Site Services (Post-Sale Operations)
**Goal:** Manage maintenance, reports, and issues for deployed sites.
*   **Global Context:** A dropdown at the top selects the "Site" (populated by `CONFIRMED` enquiries).

*   **Sub-Flows:**
    1.  **Scheduling:** Filter sites by Pincode -> Select Site -> Set next service date and technician.
    2.  **Service Reports:**
        *   Select Site (filterable by Pincode).
        *   Form captures: Date (auto-filled), Technician, Work Done, Attachments (Photos/Docs).
        *   **Signature Flow:** Service person signs (canvas pad). Client signs (canvas pad). If client isn't present, a shareable link is generated (`#sign-{reportId}`) for remote signing.
    3.  **Water Reports:** Simple form capturing pH, TDS, Hardness, and an optional PDF attachment.
    4.  **Complaints/Tickets:**
        *   Raise Ticket: Select Site, Describe Issue. Status = `OPEN`.
        *   Action: Toggle status between `OPEN` and `RESOLVED`.

### Module 3: AMC (Annual Maintenance Contracts)
**Goal:** Sell and manage recurring maintenance contracts for existing sites.

*   **Flow:**
    1.  User selects a deployed site.
    2.  User creates an AMC Quote (mirrors the CRM quotation modal, but adds `AMC Type` and `Service Interval`).
    3.  Quote appears in the site's Quotation History (expanded row).
    4.  User clicks "Confirm".
    5.  The quote is marked as the **Active AMC** for that site, and all other AMC quotes for that site are deactivated.

### Module 4: Ecommerce (Spare Parts)
**Goal:** Order consumables and replacement parts for deployed sites.

*   **Flow:**
    1.  Select a deployed site from a dropdown.
    2.  Browse catalog (categorized by Pumps, Valves, Filters, etc.).
    3.  Add items to cart (Quantity +/-).
    4.  Place Order.
    5.  Order history is appended to the selected site's records.

---

## 3. Designing for the New Structure (Minimalist Approach)

When rebuilding this in a new design system, consider these UI translations:

1.  **Reduce Visual Clutter:**
    *   *Old:* Heavy borders, bright colors everywhere.
    *   *New:* Use whitespace for separation. Subtle grays for borders. Reserve bright colors (Primary color) *only* for the primary action button on the screen (e.g., "Confirm Order", "Save").
2.  **Unified Form Layouts:**
    *   The Quotation Modal (CRM), AMC Quote Modal, and Ecommerce Cart share the same underlying data structure (Items, Qty, Price, Tax). Design **one single, elegant "Order Summary / Cart" component** that adapts slightly based on context.
3.  **Drawer vs. Modal:**
    *   Instead of center-screen modals for complex forms (like Quotations), consider a **Side Drawer** (sliding in from the right). This feels more modern, provides more vertical space for line items, and keeps the main table partially visible.
4.  **Status Indicators:**
    *   Use minimalistic dot indicators or subtle background pills for statuses (e.g., a soft green pill for `CONFIRMED`, soft yellow for `PENDING`).
5.  **Empty States:**
    *   When a site is selected but has no service reports, show a clean, centered illustration or icon with a clear "Create First Report" button, rather than just an empty table row.

---

## 4. Summary of Data Dependencies (Mental Model)

To build the UI logically, remember how the entities depend on each other:

`Lead (Enquiry)`
  └── `Follow-ups` (1:N)
  └── `Quotations` (1:N)
       └── *If Quote Confirmed -> Lead becomes a Site*
            ├── `Service Schedules` (1:1)
            ├── `Service Reports` (1:N)
            ├── `Water Reports` (1:N)
            ├── `Complaints` (1:N)
            ├── `AMC Quotes` (1:N) -> *Only one can be ACTIVE*
            └── `Ecommerce Orders` (1:N)
