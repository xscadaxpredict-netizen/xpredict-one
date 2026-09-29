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
  | "sliders"
  | "users"
  | "store"
  | "key"
  | "card"
  | "history";

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

    // Dealer settings — sliders.
    case "sliders":
      return (
        <>
          <path d="M4 7.2h8.4M17.4 7.2H20" />
          <path d="M4 16.8h4.4M13.4 16.8H20" />
          <circle cx="14.9" cy="7.2" r="2.4" />
          <circle cx="10.9" cy="16.8" r="2.4" />
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
  }
}
