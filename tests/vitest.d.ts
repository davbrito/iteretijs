interface CustomMatchers<T = unknown> {
  toBeIterable(): T;
  toBeAsyncIterable(): T;
}

export * from "vitest";

declare module "vitest" {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends CustomMatchers<R> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
