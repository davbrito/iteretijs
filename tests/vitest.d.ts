interface CustomMatchers<T = unknown> {
  toBeIterable(): T;
  toBeAsyncIterable(): T;
}

export * from "vitest";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
