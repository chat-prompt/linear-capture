/**
 * Conditional logger utility
 * Logs are only printed in development mode (when app is not packaged)
 */

// Check if we're in development mode
// In main process: use app.isPackaged
// In renderer process or before app is ready: use NODE_ENV
const isDev = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    return !app.isPackaged || !!process.env.LINEAR_CAPTURE_DEBUG;
  } catch {
    return process.env.NODE_ENV !== 'production' || !!process.env.LINEAR_CAPTURE_DEBUG;
  }
})();

export const logger = {
  /**
   * Debug level log - only in development
   */
  debug: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },

  /**
   * Info level log - only in development
   */
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },

  /**
   * Info level log (alias) - only in development
   */
  info: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },

  /**
   * Warning level log - always shown (important for debugging issues)
   */
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },

  /**
   * Error level log - always shown (critical for issue tracking)
   */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};

export default logger;
