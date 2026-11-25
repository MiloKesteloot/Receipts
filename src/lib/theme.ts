/**
 * App theme: warm light and dark palettes, the display typeface, a type
 * scale, elevation presets, and a helper that builds style sheets which
 * follow the device's light/dark setting.
 */

import {
  type ColorValue,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
  StyleSheet,
  useColorScheme,
} from "react-native";

/** Every color token the app uses. Light and dark define the same keys. */
export type Palette = {
  bg: string;
  card: string;
  /** Subtle fill for inputs, chips, and nested rows inside cards. */
  surface: string;
  border: string;
  text: string;
  muted: string;
  placeholder: string;
  accent: string;
  accentSoft: string;
  /** Text and icons drawn on top of `accent`. */
  onAccent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  /** Dimmed backdrop behind dialogs. */
  overlay: string;
  shadow: string;
  /** Two stops for the hero balance gradient. */
  heroGradient: readonly [ColorValue, ColorValue];
  /** Pastel tiles that cycle through rows and avatars. */
  tiles: string[];
};

/** Warm cream-and-orange light palette. */
export const LIGHT_PALETTE: Palette = {
  bg: "#F4F1EA",
  card: "#FFFFFF",
  surface: "#F8F6F1",
  border: "#E8E3D9",
  text: "#1F2A24",
  muted: "#7A7F78",
  placeholder: "#A9A59C",
  accent: "#E8734A",
  accentSoft: "#FBE4DA",
  onAccent: "#FFFFFF",
  success: "#2F7A54",
  successSoft: "#E2F1E8",
  warning: "#A86A12",
  warningSoft: "#FDF2D6",
  error: "#D93025",
  errorSoft: "#FDECEA",
  overlay: "rgba(31, 26, 20, 0.45)",
  shadow: "#5B3A1E",
  heroGradient: ["#F08458", "#D95D36"],
  tiles: ["#E6F0B5", "#F9DDD0", "#DCE9F3"],
};

/** Warm charcoal dark palette. */
export const DARK_PALETTE: Palette = {
  bg: "#141210",
  card: "#1F1C19",
  surface: "#282420",
  border: "#332E29",
  text: "#F3EEE6",
  muted: "#A39C92",
  placeholder: "#6F6960",
  accent: "#F0855A",
  accentSoft: "#3B281F",
  onAccent: "#FFFFFF",
  success: "#62C08E",
  successSoft: "#1C3026",
  warning: "#E5B454",
  warningSoft: "#372D1A",
  error: "#FF6F61",
  errorSoft: "#3A1E1B",
  overlay: "rgba(0, 0, 0, 0.6)",
  shadow: "#000000",
  heroGradient: ["#E27A4E", "#B04E2B"],
  tiles: ["#3A4122", "#46302A", "#253441"],
};

/** Plus Jakarta Sans faces, loaded at startup by the root layout. */
export const FONTS = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

/** Font face used for each numeric weight. */
const FONT_FOR_WEIGHT: Record<string, string> = {
  "100": FONTS.regular,
  "200": FONTS.regular,
  "300": FONTS.regular,
  "400": FONTS.regular,
  normal: FONTS.regular,
  "500": FONTS.medium,
  "600": FONTS.semibold,
  "700": FONTS.bold,
  bold: FONTS.bold,
  "800": FONTS.extrabold,
  "900": FONTS.extrabold,
};

/** Type scale: the only font sizes screens should use. */
export const TYPE = {
  largeTitle: 34,
  title: 28,
  title2: 22,
  headline: 17,
  body: 16,
  callout: 15,
  subhead: 14,
  footnote: 13,
  caption: 12,
  caption2: 11,
} as const;

/**
 * Soft, warm drop shadow for a card. Dark mode leans on borders instead,
 * since shadows barely show on a dark background.
 * @param palette Active palette
 * @param level 1 for resting cards, 2 for floating surfaces
 * @returns Shadow style to spread into a view style
 */
export function elevation(palette: Palette, level: 1 | 2 = 1): ViewStyle {
  return {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: level === 1 ? 4 : 10 },
    shadowOpacity: palette === DARK_PALETTE ? 0.35 : level === 1 ? 0.06 : 0.12,
    shadowRadius: level === 1 ? 12 : 24,
    elevation: level === 1 ? 2 : 8,
  };
}

/**
 * Returns the palette for the device's current light/dark setting.
 * @returns Active palette
 */
export function useTheme(): Palette {
  return useColorScheme() === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

/**
 * Whether the device is in dark mode.
 * @returns True in dark mode
 */
export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

type AnyStyle = ViewStyle | TextStyle | ImageStyle;

/**
 * Swaps `fontWeight` for the matching Plus Jakarta Sans face on any text
 * style, since custom fonts ship one file per weight.
 * @param style One named style
 * @returns The style with `fontFamily` set
 */
function withFont(style: AnyStyle): AnyStyle {
  if (!("fontSize" in style || "fontWeight" in style) || "fontFamily" in style) {
    return style;
  }
  const { fontWeight, ...rest } = style as TextStyle;
  return {
    ...rest,
    fontFamily: FONT_FOR_WEIGHT[String(fontWeight ?? "400")] ?? FONTS.regular,
  };
}

/**
 * Builds a hook that returns a style sheet for the active palette. Each
 * palette's sheet is created once and reused. Text styles get the app's
 * typeface automatically, picked from their `fontWeight`.
 * @param factory Builds the named styles from a palette
 * @returns Hook returning the themed style sheet
 */
export function createThemedStyles<T extends Record<string, AnyStyle>>(
  factory: (palette: Palette) => T
): () => T {
  const cache = new Map<Palette, T>();
  const build = (palette: Palette): T => {
    const raw = factory(palette);
    const styled: Record<string, AnyStyle> = {};
    for (const key of Object.keys(raw)) styled[key] = withFont(raw[key]);
    return StyleSheet.create(styled) as T;
  };

  return function useStyles(): T {
    const palette = useTheme();
    const cached = cache.get(palette);
    if (cached) return cached;
    const sheet = build(palette);
    cache.set(palette, sheet);
    return sheet;
  };
}
