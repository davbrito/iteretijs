import { expect } from "vitest";

expect.extend({
  toBeIterable(received) {
    return {
      pass: baseExpectIterable(received, Symbol.iterator),
      message: () => failMessage(received, this.isNot, "iterator"),
    };
  },
  toBeAsyncIterable(received) {
    return {
      pass: baseExpectIterable(received, Symbol.asyncIterator),
      message: () => failMessage(received, this.isNot, "async iterator"),
    };
  },
});

function baseExpectIterable(received: unknown, symbol: symbol) {
  if (typeof received !== "object" || received === null) {
    return false;
  }
  const fn = Reflect.get(received, symbol);
  if (typeof fn !== "function") return false;
  const iter = Reflect.apply(fn, received, []);
  if (!iter) return false;
  return typeof Reflect.get(iter, "next") === "function";
}

function failMessage(received: unknown, isNot: boolean, type: string) {
  return `${received} is${isNot ? " not" : ""} an ${type}`;
}
