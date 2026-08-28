// ae-theme.ts — Scripts Launcher (CEP panel client)
// Derives a CSS custom-property palette from After Effects' live UI skin (theme + accessible
// contrast), instead of hardcoding per-theme colors. See Extensions/CLAUDE.md and
// docs/extendscript-pitfalls.md ("CEP / Extensions gotchas") for the reasoning.
// Author: Bruno Quintin
// Version: 1.3
//
// This extension is "Vibe Coded" and provided without warranty; the user
// therefore assumes full responsibility for its implementation.

import { csi } from "./bolt";

interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface AeTheme {
  isDark: boolean;
  bg: string;
  appBarBg: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderHover: string;
  text: string;
  textSecondary: string;
  iconInvert: 0 | 1;
}

// Fallback used outside CEP (e.g. `npm run dev`'s standalone browser preview),
// where window.__adobe_cep__ doesn't exist. Matches AE's "Dark" theme roughly.
const FALLBACK_BG: RGB = { r: 50, g: 50, b: 50 };
const FALLBACK_APPBAR_BG: RGB = { r: 40, g: 40, b: 40 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
const rgbToHex = (c: RGB) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;

// WCAG relative luminance (sRGB -> linear -> weighted sum).
const relativeLuminance = (c: RGB): number => {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
};

const contrastRatio = (a: RGB, b: RGB): number => {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Mixes `c` toward white (pct > 0) or black (pct < 0) by `pct` (0..1 magnitude of
// the remaining headroom to that extreme).
const mix = (c: RGB, pct: number): RGB => {
  const target = pct >= 0 ? 255 : 0;
  const t = Math.abs(pct);
  return {
    r: c.r + (target - c.r) * t,
    g: c.g + (target - c.g) * t,
    b: c.b + (target - c.b) * t,
  };
};

// Shifts `c`'s channels by a fixed, clamped amount rather than a percentage of
// headroom — used for surface/border steps so they still read as a visible step
// even when bg already sits close to black or white (e.g. AE's Light theme,
// where the panel background is only a few points off pure white).
const shade = (c: RGB, delta: number): RGB => ({
  r: clamp(c.r + delta, 0, 255),
  g: clamp(c.g + delta, 0, 255),
  b: clamp(c.b + delta, 0, 255),
});

// Picks the softer of two foreground candidates that still clears the target
// WCAG contrast ratio against `bg`; falls back to the extreme (pure white/black)
// if neither candidate reaches it. This is what makes text/borders react to
// After Effects' "Accessible color contrast" preference without ever having to
// detect that setting directly (CSInterface doesn't expose it) — it reacts to
// whatever panelBackgroundColor actually is.
const pickForeground = (bg: RGB, isDark: boolean, targetRatio: number): RGB => {
  const soft = mix(bg, isDark ? 0.82 : -0.75);
  const extreme = mix(bg, isDark ? 1 : -1);
  return contrastRatio(bg, soft) >= targetRatio ? soft : extreme;
};

const readSkinColor = (color: any): RGB | null => {
  if (!color || typeof color.red !== "number") return null;
  return { r: color.red, g: color.green, b: color.blue };
};

export const getAeTheme = (): AeTheme => {
  let bg = FALLBACK_BG;
  let appBarBg = FALLBACK_APPBAR_BG;

  try {
    const skin = csi.getHostEnvironment().appSkinInfo;
    bg = readSkinColor(skin.panelBackgroundColor?.color) || FALLBACK_BG;
    appBarBg = readSkinColor(skin.appBarBackgroundColor?.color) || bg;
  } catch (e) {
    console.error("AE theme detection error:", e);
  }

  const isDark = relativeLuminance(bg) < 0.5;

  // Elevated surfaces (list rows) read as lighter than the panel in AE's chrome
  // regardless of theme (a near-black row in Darkest, a near-white row in Light);
  // separators/borders read as darker regardless of theme. Fixed clamped deltas
  // (not a percentage of headroom) reproduce that even when bg already sits near
  // one extreme, e.g. Light theme's near-white panel background.
  const surface = shade(bg, 18);
  const surfaceHover = shade(bg, 30);
  const border = shade(bg, -22);
  const borderHover = shade(bg, -34);
  const text = pickForeground(bg, isDark, 7);
  const textSecondary = pickForeground(bg, isDark, 4.5);

  return {
    isDark,
    bg: rgbToHex(bg),
    appBarBg: rgbToHex(appBarBg),
    surface: rgbToHex(surface),
    surfaceHover: rgbToHex(surfaceHover),
    border: rgbToHex(border),
    borderHover: rgbToHex(borderHover),
    text: rgbToHex(text),
    textSecondary: rgbToHex(textSecondary),
    iconInvert: isDark ? 1 : 0,
  };
};

export const applyAeTheme = (theme: AeTheme) => {
  const root = document.documentElement.style;
  root.setProperty("--ae-bg", theme.bg);
  root.setProperty("--ae-appbar-bg", theme.appBarBg);
  root.setProperty("--ae-surface", theme.surface);
  root.setProperty("--ae-surface-hover", theme.surfaceHover);
  root.setProperty("--ae-border", theme.border);
  root.setProperty("--ae-border-hover", theme.borderHover);
  root.setProperty("--ae-text", theme.text);
  root.setProperty("--ae-text-secondary", theme.textSecondary);
  root.setProperty("--ae-icon-invert", String(theme.iconInvert));
  document.body.classList.toggle("ae-theme-dark", theme.isDark);
  document.body.classList.toggle("ae-theme-light", !theme.isDark);
};

export const subscribeAeTheme = (callback: (theme: AeTheme) => void) => {
  const update = () => callback(getAeTheme());
  update();
  csi.addEventListener("com.adobe.csxs.events.ThemeColorChanged", update);
  return () => {
    csi.removeEventListener("com.adobe.csxs.events.ThemeColorChanged", update);
  };
};
