/**
 * Lightweight logger.
 *
 * Debug logs are gated behind __DEV__ so they never ship in production
 * builds — this keeps the content of photographed posters (and other
 * potentially sensitive OCR text) out of device logs. Warnings and errors
 * always fire so real failures still surface in crash reporting.
 */

// `typeof` guard so this is safe outside React Native (e.g. Node/jest), where
// the __DEV__ global isn't defined and a bare reference would throw.
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const log = (...args) => {
  if (isDev) {
    console.log(...args);
  }
};

export const warn = (...args) => {
  console.warn(...args);
};

export const error = (...args) => {
  console.error(...args);
};

export default { log, warn, error };
