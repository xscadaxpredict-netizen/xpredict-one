/**
 * One line drawing per app.
 *
 * Inline SVG rather than an icon library: four icons do not justify a
 * dependency, and every one of them draws in `currentColor`, so the app's own
 * colour and dark mode both come from CSS with no second set of assets.
 *
 * They replaced two-letter initials. "DM" and "CR" told a first-time user
 * nothing, and on the launcher — the one screen whose entire job is telling
 * four apps apart — a shape is read faster than a word.
 *
 * `aria-hidden` on all of them. Each sits next to the app's name in text, so
 * announcing the icon as well would read the app out twice.
 */

import type { AppKey } from "../api/auth";

interface AppIconProps {
  app: AppKey;
  size?: number;
}

export function AppIcon({ app, size = 26 }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph(app)}
    </svg>
  );
}

function glyph(app: AppKey) {
  switch (app) {
    // A car: dealership management, drawn as the thing being sold.
    case "dms":
      return (
        <>
          <path d="M4 13.5 5.7 8.6A2.2 2.2 0 0 1 7.8 7h8.4a2.2 2.2 0 0 1 2.1 1.6L20 13.5" />
          <path d="M3.5 13.5h17V17a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1v-.6H7.1v.6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" />
          <path d="M7 15.6h.01M17 15.6h.01" />
        </>
      );

    // Two people: customer relationships.
    case "crm":
      return (
        <>
          <circle cx="9.2" cy="8.4" r="3.1" />
          <path d="M3.6 19.4a5.6 5.6 0 0 1 11.2 0" />
          <path d="M16.4 5.8a3.1 3.1 0 0 1 0 5.6" />
          <path d="M17.8 14.4a5.6 5.6 0 0 1 2.8 5" />
        </>
      );

    // A shopping bag: the storefront.
    case "ecommerce":
      return (
        <>
          <path d="M5.4 8h13.2l-1 11.2a1 1 0 0 1-1 .9H7.4a1 1 0 0 1-1-.9z" />
          <path d="M9.2 8V6.2a2.8 2.8 0 0 1 5.6 0V8" />
        </>
      );

    // A shield: administration is the thing that decides who gets in.
    case "admin":
      return (
        <>
          <path d="M12 3.2 19 6v5.4c0 4.2-2.8 7.4-7 9.4-4.2-2-7-5.2-7-9.4V6z" />
          <path d="m9.2 11.9 2 2 3.6-3.8" />
        </>
      );
  }
}
