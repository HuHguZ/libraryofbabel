// jsdom has no layout, so no ResizeObserver; popovers (the colour picker) only need it to exist.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
