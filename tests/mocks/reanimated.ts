/**
 * Minimal Jest stand-in for react-native-reanimated. Reanimated's own builds
 * need its native module (or a browser DOM), neither of which Jest has, so
 * this covers just the API the app uses: animations resolve straight to
 * their end value and animated components render as their plain versions.
 */
/* eslint-disable @typescript-eslint/naming-convention -- exports must match Reanimated's real names (Easing, FadeInDown). */
import type { ComponentType } from "react";

type Callback = (finished: boolean) => void;

/** Chainable no-op for layout animation builders like FadeInDown.delay(). */
const BUILDER: Record<string, unknown> = new Proxy(
  {},
  { get: (_target, key) => (key === "then" ? undefined : () => BUILDER) }
);

/**
 * Animation helpers return their target value immediately and report done.
 * @param toValue Final value of the animation
 * @param configOrCallback Animation config, or the completion callback
 * @param callback Completion callback
 * @returns The target value
 */
function settle<T>(
  toValue: T,
  configOrCallback?: unknown,
  callback?: Callback
): T {
  if (typeof configOrCallback === "function") {
    (configOrCallback as Callback)(true);
  }
  callback?.(true);
  return toValue;
}

/**
 * Identity easing curve.
 * @param t Progress from 0 to 1
 * @returns The same progress
 */
function identity(t: number): number {
  return t;
}

/** Easing functions; every curve is linear under test. */
export const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  in: (): typeof identity => identity,
  out: (): typeof identity => identity,
  inOut: (): typeof identity => identity,
  bezier: (): typeof identity => identity,
};

/**
 * Returns the component unchanged.
 * @param component Component to "animate"
 * @returns The same component
 */
export function createAnimatedComponent<P>(
  component: ComponentType<P>
): ComponentType<P> {
  return component;
}

/**
 * Plain mutable box with the shared value get/set API.
 * @param initial Starting value
 * @returns Shared value stand-in
 */
export function useSharedValue<T>(initial: T): {
  value: T;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
} {
  const ref = {
    value: initial,
    get: () => ref.value,
    set: (next: T | ((prev: T) => T)) => {
      ref.value =
        typeof next === "function" ? (next as (prev: T) => T)(ref.value) : next;
    },
  };
  return ref;
}

/**
 * Computes the style once, synchronously.
 * @param factory Style worklet
 * @returns The computed style
 */
export function useAnimatedStyle<T>(factory: () => T): T {
  return factory();
}

/**
 * Returns the animation passed to it, ignoring repeats.
 * @param animation Animation to repeat
 * @returns The animation
 */
export function withRepeat<T>(animation: T): T {
  return animation;
}

/** Springs settle instantly under test. */
export const withSpring = settle;

/** Timings settle instantly under test. */
export const withTiming = settle;

/** Entrance animation builder (no-op). */
export const FadeInDown = BUILDER;
