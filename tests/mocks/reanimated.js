/**
 * Minimal Jest stand-in for react-native-reanimated. Reanimated's own builds
 * need its native module (or a browser DOM), neither of which Jest has, so
 * this covers just the API the app uses: animations resolve straight to
 * their end value and animated components render as their plain versions.
 */
const { View, Text, Pressable } = require("react-native");

/** Chainable no-op for layout animation builders like FadeInDown.delay(). */
const builder = new Proxy(
  {},
  { get: (_target, key) => (key === "then" ? undefined : () => builder) }
);

/** Animation helpers return their target value immediately. */
const settle = (toValue, _config, callback) => {
  if (typeof _config === "function") _config(true);
  if (typeof callback === "function") callback(true);
  return toValue;
};

const identity = (t) => t;
const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  in: () => identity,
  out: () => identity,
  inOut: () => identity,
  bezier: () => identity,
};

module.exports = {
  __esModule: true,
  default: { View, Text, createAnimatedComponent: (c) => c },
  createAnimatedComponent: (component) => component,
  useSharedValue: (initial) => {
    const ref = { value: initial };
    ref.get = () => ref.value;
    ref.set = (next) => {
      ref.value = typeof next === "function" ? next(ref.value) : next;
    };
    return ref;
  },
  useAnimatedStyle: (factory) => factory(),
  useDerivedValue: (factory) => ({ value: factory(), get: factory }),
  withSpring: settle,
  withTiming: settle,
  withDelay: (_delay, animation) => animation,
  withRepeat: (animation) => animation,
  withSequence: (...animations) => animations[animations.length - 1],
  interpolate: (_value, _input, output) => output[0],
  Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
  Easing,
  FadeIn: builder,
  FadeInDown: builder,
  FadeInUp: builder,
  FadeOut: builder,
  ZoomIn: builder,
  LinearTransition: builder,
  View,
  Text,
  Pressable,
};
