import "@testing-library/jest-dom/vitest";

/*
 * jsdom implements no layout, so the browser APIs that measure things are
 * simply absent. Radix's floating primitives — Popover, and the Tooltip and
 * Dropdown beside it — ask for all three on mount, and the failure is a bare
 * `ReferenceError: ResizeObserver is not defined` from inside a layout effect,
 * which reads like a broken component rather than a missing environment.
 *
 * STUBS, NOT POLYFILLS, and the difference matters: these report nothing and
 * measure nothing. A test must not assert where a popover was POSITIONED —
 * there is no layout to position it in. Assert that it opened, what it says,
 * and who can reach it, which is what the behaviour actually is.
 */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;

/**
 * Add a missing method to a prototype, without reading the one that is not
 * there.
 *
 * `Element.prototype.foo ??= …` would be the obvious way and lint refuses it:
 * the `??=` has to READ `foo` first, and referencing a method without calling
 * it is exactly what `unbound-method` exists to catch. The `in` check asks the
 * same question without taking the reference.
 */
function stubMethod(target: object, name: string, value: () => unknown): void {
  if (name in target) return;
  Object.defineProperty(target, name, { value, writable: true, configurable: true });
}

// Radix checks these before deciding how to trap the pointer, and jsdom's
// elements have none of them.
stubMethod(Element.prototype, "hasPointerCapture", () => false);
stubMethod(Element.prototype, "setPointerCapture", () => undefined);
stubMethod(Element.prototype, "releasePointerCapture", () => undefined);

// Used by floating elements to decide which way to open. Without it they throw
// rather than defaulting.
stubMethod(Element.prototype, "scrollIntoView", () => undefined);
