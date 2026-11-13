/**
 * Sidebar icons.
 *
 * These replaced two-letter codes — "SL", "SV", "TS". Those were a stand-in
 * that had one real problem: collapsed to a 64px rail, the sidebar was a
 * column of near-identical grey squares, and "SL" above "SV" is not something
 * you read at a glance. A shape is.
 *
 * NAMED BY WHAT THEY DRAW, not by what they mean. "wrench", not "service" —
 * so when a second module also wants a wrench nobody has to decide whether
 * reusing an icon called "service" is allowed.
 *
 * Every one draws in `currentColor`, so the active-link colour and dark mode
 * both come from CSS and there is no second set of assets for either.
 *
 * `aria-hidden`: each sits beside the module's name in text, and announcing
 * the icon too would read every link out twice.
 */

export type NavIconName =
  | "tag"
  | "wrench"
  | "headset"
  | "users"
  | "store"
  | "key"
  | "card"
  | "history"
  | "grid"
  | "file-text"
  | "zap"
  | "database"
  | "clipboard-check"
  | "percent"
  | "shield-check"
  | "calendar"
  | "droplet"
  | "alert-circle"
  | "book-open"
  | "video"
  | "phone-call"
  | "clock"
  | "calculator"
  | "compass"
  | "package";

interface NavIconProps {
  name: NavIconName;
  size?: number;
}

export function NavIcon({ name, size = 18 }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph(name)}
    </svg>
  );
}

/*
 * A switch with no default, returning from every branch. TypeScript then
 * treats the union as exhausted — adding a name to NavIconName without a
 * drawing here is a compile error rather than an invisible blank square.
 */
function glyph(name: NavIconName) {
  switch (name) {
    // Sales — a price tag.
    case "tag":
      return (
        <>
          <path d="M3.8 11.9V5.2a1.4 1.4 0 0 1 1.4-1.4h6.7a1.4 1.4 0 0 1 1 .4l7 7a1.4 1.4 0 0 1 0 2l-6.3 6.3a1.4 1.4 0 0 1-2 0l-7-7a1.4 1.4 0 0 1-.8-1.6z" />
          <circle cx="7.9" cy="7.9" r="1.35" />
        </>
      );

    // Service — a spanner.
    case "wrench":
      return (
        <path d="M15.4 3.4a5.2 5.2 0 0 0-5.9 6.7l-5.6 5.6a2 2 0 0 0 0 2.8l1.6 1.6a2 2 0 0 0 2.8 0l5.6-5.6a5.2 5.2 0 0 0 6.7-5.9l-3 3-3-.8-.8-3z" />
      );

    // Tech support — a headset.
    case "headset":
      return (
        <>
          <path d="M4.6 14.2v-2.4a7.4 7.4 0 0 1 14.8 0v2.4" />
          <rect x="2.6" y="13.4" width="4" height="6" rx="1.8" />
          <rect x="17.4" y="13.4" width="4" height="6" rx="1.8" />
          <path d="M19.4 19.4v.6a2.2 2.2 0 0 1-2.2 2.2H13.4" />
        </>
      );

    // People — two figures.
    case "users":
      return (
        <>
          <circle cx="9.2" cy="8.2" r="3.3" />
          <path d="M3.5 19.6a5.7 5.7 0 0 1 11.4 0" />
          <path d="M16.4 5.4a3.3 3.3 0 0 1 0 5.8" />
          <path d="M17.9 14.2a5.7 5.7 0 0 1 2.9 5.2" />
        </>
      );

    // Dealers — a shopfront.
    case "store":
      return (
        <>
          <path d="M3.6 8.6h16.8l-1.3-4.1a1.2 1.2 0 0 0-1.15-.9H6.05a1.2 1.2 0 0 0-1.15.9z" />
          <path d="M5.2 8.6V20a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V8.6" />
          <path d="M9.6 21v-5.4h4.8V21" />
        </>
      );

    // Roles — a key: the thing that opens what you are allowed to open.
    case "key":
      return (
        <>
          <circle cx="7.6" cy="9.2" r="3.9" />
          <path d="m10.5 11.9 8.2 8.2" />
          <path d="m15.8 17 2.2-2.2" />
        </>
      );

    // Apps & billing — a payment card.
    case "card":
      return (
        <>
          <rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.2" />
          <path d="M2.8 9.9h18.4" />
          <path d="M6.4 14.6h3.4" />
        </>
      );

    // Audit log — a clock wound backwards: a record of what happened, when.
    case "history":
      return (
        <>
          <path d="M3.9 12a8.1 8.1 0 1 0 2.4-5.8" />
          <path d="M3.5 3.6v3.4h3.4" />
          <path d="M12 7.8V12l3 1.8" />
        </>
      );

    // Dashboard — 4 tiles / grid layout
    case "grid":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </>
      );

    // Techno-Commercial Document
    case "file-text":
      return (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </>
      );

    // EC Dosing & HRT — lightning bolt
    case "zap":
      return (
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      );

    // Database / Master Data
    case "database":
      return (
        <>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M21 5v14c0 1.66-4 3-9 3" />
        </>
      );

    // Confirmed Orders / Tasks Completed
    case "clipboard-check":
      return (
        <>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <polyline points="9 14 11 16 15 12" />
        </>
      );

    // Commissions / Percent
    case "percent":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <circle cx="9" cy="9" r="0.7" fill="currentColor" />
          <circle cx="15" cy="15" r="0.7" fill="currentColor" />
        </>
      );

    // AMC — Shield with checkmark
    case "shield-check":
      return (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </>
      );

    // Scheduled Services — Calendar
    case "calendar":
      return (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </>
      );

    // Water Reports — Water droplet
    case "droplet":
      return (
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      );

    // Complaint Box — Alert circle
    case "alert-circle":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="16" r="0.6" fill="currentColor" />
        </>
      );

    // User Manuals — Open Book
    case "book-open":
      return (
        <>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </>
      );

    // Machine Videos — Video Camera
    case "video":
      return (
        <>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </>
      );

    // Request for Call — Telephone with waves
    case "phone-call":
      return (
        <>
          <path d="M15.05 5A5 5 0 0 1 19 8.95" />
          <path d="M15.05 1A9 9 0 0 1 23 8.94" />
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </>
      );

    // Timer Calculation — Clock / Timer
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </>
      );

    // Capacity Calculator
    case "calculator":
      return (
        <>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="16" y1="14" x2="16" y2="18" />
          <circle cx="16" cy="10" r="0.6" fill="currentColor" />
          <circle cx="12" cy="10" r="0.6" fill="currentColor" />
          <circle cx="8" cy="10" r="0.6" fill="currentColor" />
          <circle cx="12" cy="14" r="0.6" fill="currentColor" />
          <circle cx="8" cy="14" r="0.6" fill="currentColor" />
          <circle cx="12" cy="18" r="0.6" fill="currentColor" />
          <circle cx="8" cy="18" r="0.6" fill="currentColor" />
        </>
      );

    // Feasibility Study — Compass
    case "compass":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </>
      );

    // Orders / Store Package
    case "package":
      return (
        <>
          <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </>
      );
  }
}
