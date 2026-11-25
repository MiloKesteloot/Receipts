/**
 * Minimal Jest stand-in for react-native-worklets: runs scheduled callbacks
 * right away on the JS thread.
 * @param fn Callback to run
 * @param args Arguments for the callback
 */
export function scheduleOnRN<A extends unknown[]>(
  fn: (...args: A) => unknown,
  ...args: A
): void {
  fn(...args);
}
