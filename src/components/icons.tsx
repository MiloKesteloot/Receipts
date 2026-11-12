/**
 * Crisp inline SVG icons powered by `react-native-svg` for the bottom
 * navigation bar, auth buttons, checkboxes, and form controls.
 */

import type { JSX } from "react";
import { Circle, Line, Path, Rect, Svg } from "react-native-svg";

/** Common sizing and color props shared by all icon components. */
export type IconProps = {
  size?: number;
  color: string;
  strokeWidth?: number;
};

/** Optional size-only props for fixed-brand multi-color icons. */
export type BrandIconProps = {
  size?: number;
};

/**
 * Renders a house outline icon for the Home tab.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function HouseIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5L12 3l9 7.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 9.5V19a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1V9.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Renders a line graph icon for the Stats tab.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function LineGraphIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 3v18h18"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7 15l4-4 3 3 5-6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={19} cy={8} r={1.5} fill={color} />
    </Svg>
  );
}

/**
 * Renders a credit card icon for the Payments tab.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function CreditCardIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={5}
        width={20}
        height={14}
        rx={2.5}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={2}
        y1={10}
        x2={22}
        y2={10}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line
        x1={6}
        y1={15}
        x2={10}
        y2={15}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Renders a settings gear (cog) icon for the Settings tab.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function GearIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={12}
        r={3}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

/**
 * Renders a person silhouette icon for the Account tab.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function PersonIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={12}
        cy={8}
        r={4}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M5 20a7 7 0 0 1 14 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Renders an open eye icon for showing a hidden password.
 * Uses the exact same outer Bezier silhouette as {@link EyeOffIcon} so
 * toggling visibility never shifts the eye outline on screen.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function EyeIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12C6.5 4.5 17.5 4.5 22 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 12C6.5 19.5 17.5 19.5 22 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={12}
        r={3}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

/**
 * Renders a crossed-out eye icon for masking a visible password.
 * Subdivides the exact same Bezier curve as {@link EyeIcon} around the slash
 * so toggling between visible and hidden keeps every curve locked in place.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function EyeOffIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12C2.99 10.35 4.29 9.06 5.78 8.14"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.69 6.6C14.26 5.7 19.3 7.5 22 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 12C4.7 16.5 9.74 18.3 14.31 17.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.22 15.86C19.71 14.94 21.01 13.65 22 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.12 14.12A3 3 0 0 1 9.88 9.88"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={3}
        y1={3}
        x2={21}
        y2={21}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Renders the Apple brand logo silhouette.
 * @param props Icon sizing and fill color
 * @returns SVG icon element
 */
export function AppleIcon(props: IconProps): JSX.Element {
  const { size = 18, color } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702z"
        fill={color}
      />
      <Path
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * Renders the four-color Google "G" emblem.
 * @param props Icon sizing
 * @returns SVG icon element
 */
export function GoogleIcon(props: BrandIconProps): JSX.Element {
  const { size = 18 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

/**
 * Renders a user-with-check badge icon for items claimed by the current user.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function ClaimantYouIcon(props: IconProps): JSX.Element {
  const { size = 13, color, strokeWidth = 2.2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={9} cy={7} r={3.5} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M16 11l2 2 4-4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Renders a person badge icon for items claimed by another group member.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function ClaimantMemberIcon(props: IconProps): JSX.Element {
  const { size = 13, color, strokeWidth = 2.2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/**
 * Renders a guest-pass tag icon for items claimed by an unauthenticated guest.
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function ClaimantGuestIcon(props: IconProps): JSX.Element {
  const { size = 13, color, strokeWidth = 2.2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={7.5} cy={7.5} r={1.5} fill={color} />
    </Svg>
  );
}
