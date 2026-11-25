/**
 * Minimal Jest stand-in for react-native-worklets: runs scheduled callbacks
 * right away on the JS thread.
 */
module.exports = {
  scheduleOnRN: (fn, ...args) => fn(...args),
  scheduleOnUI: (fn, ...args) => fn(...args),
};
