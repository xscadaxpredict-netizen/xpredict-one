/**
 * Applies the stored theme to the document.
 *
 * WHY THIS HAD TO EXIST. `uiStore` has held a `theme` preference since the
 * scaffold and nothing ever read it — so the setting persisted faithfully and
 * did nothing, and dark mode followed the operating system with no way to
 * override it. The tokens have supported all three modes the whole time
 * (`:root[data-theme="dark"]` and the `prefers-color-scheme` block); the wire
 * between them was simply never run.
 *
 * "system" REMOVES the attribute rather than resolving it to light or dark.
 * That matters: the tokens are written so the media query applies only when
 * no explicit choice is set, so following the OS means saying nothing — and
 * it keeps following it when the OS changes at sunset, which a resolved value
 * would not.
 */

import { useEffect } from "react";

import { useUiStore } from "../../stores/uiStore";

export function useApplyTheme() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      root.removeAttribute("data-theme");
      return;
    }

    root.setAttribute("data-theme", theme);
  }, [theme]);
}
