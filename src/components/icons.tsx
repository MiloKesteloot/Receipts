/**
 * Crisp inline SVG icons powered by `react-native-svg` for the bottom
 * navigation bar and form controls (such as the password visibility toggle).
 */

import type { JSX } from "react";
import { Circle, Line, Path, Rect, Svg } from "react-native-svg";

/** Common sizing and color props shared by all icon components. */
export type IconProps = {
  size?: number;
  color: string;
  strokeWidth?: number;
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
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function EyeIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"
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
 * @param props Icon sizing and stroke color
 * @returns SVG icon element
 */
export function EyeOffIcon(props: IconProps): JSX.Element {
  const { size = 20, color, strokeWidth = 2 } = props;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 18c-6.5 0-10-6-10-6a18.45 18.45 0 0 1 5.06-5.94"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 6 10 6a18.5 18.5 0 0 1-2.16 3.19"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.12 14.12a3 3 0 1 1-4.24-4.24"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={2}
        y1={2}
        x2={22}
        y2={22}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
