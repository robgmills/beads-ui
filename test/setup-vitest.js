/* global console, window */
// Suppress Lit dev-mode warning in Vitest
// Provided snippet: overrides console.warn but forwards all other messages
const { warn } = console;
console.warn = /** @type {function(...*): void} */ (
  (...args) => {
    // Filter out the noisy Lit dev-mode banner in tests
    if (!args[0].startsWith('Lit is in dev mode.')) {
      warn.call(console, ...args);
    }
  }
);

if (
  typeof window !== 'undefined' &&
  window.localStorage &&
  typeof window.localStorage.setItem !== 'function'
) {
  /** @type {Map<string, string>} */
  const storage = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      /**
       * @param {string} key
       */
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      /**
       * @param {string} key
       * @param {string} value
       */
      setItem(key, value) {
        storage.set(String(key), String(value));
      },
      /**
       * @param {string} key
       */
      removeItem(key) {
        storage.delete(String(key));
      },
      clear() {
        storage.clear();
      }
    }
  });
}
