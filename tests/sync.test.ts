import { Mock, describe, expect, it, vi } from "vitest";
import {
  concat,
  drop,
  enumerate,
  filter,
  iota,
  map,
  range,
  take,
  zip,
} from "../src/index.ts";
import { dumbIterable } from "./utils.ts";

function expectFnCalls(
  iter: Iterator<unknown>,
  fn: Mock,
  expecteds: unknown[],
): void {
  expect(fn).not.toHaveBeenCalled();

  for (let i = 0; !iter.next().done; i++) {
    expect(fn).toHaveBeenCalledTimes(i + 1);
    expect(fn).lastCalledWith(expecteds[i]);
  }

  iter.next();
  iter.next();
  iter.next();
  expect(fn).toHaveBeenCalledTimes(3);

  expecteds.forEach((expected, i) => {
    expect(fn.mock.calls[i][0]).toBe(expected);
  });
}

function expectReturnWhenDone(
  input: Iterator<unknown>,
  output: Iterator<unknown>,
): void {
  const returnSpy = vi.spyOn(input, "return");
  expect(returnSpy).not.toHaveBeenCalled();
  while (!output.next().done);
  expect(returnSpy).toHaveBeenCalledTimes(1);
  expect(returnSpy).lastCalledWith();
}


describe("return an iterable", () => {
  it("map", () => {
    expect(map(dumbIterable(1, 4), (x) => x + 1)).toBeIterable();
  });

  it("filter", () => {
    expect(filter(dumbIterable(1, 4), (x) => x % 2 === 0)).toBeIterable();
  });

  it("take", () => {
    expect(take(dumbIterable(1, 4), 2)).toBeIterable();
  });

  it("drop", () => {
    expect(drop(dumbIterable(1, 4), 2)).toBeIterable();
  });

  it("concat", () => {
    expect(concat(dumbIterable(1, 4), dumbIterable(5, 7))).toBeIterable();
  });

  it("zip", () => {
    expect(zip(dumbIterable(1, 4), dumbIterable(5, 7))).toBeIterable();
  });

  it("enumerate", () => {
    expect(enumerate(dumbIterable(1, 4))).toBeIterable();
  });

  it("iota", () => {
    expect(iota()).toBeIterable();
  });

  it("range", () => {
    expect(range(1, 4)).toBeIterable();
  });
});

describe("map", () => {
  it.each([
    [dumbIterable(1, 4), (x: number) => x + 1, [2, 3, 4]],
    [dumbIterable(1, 5), (x: number) => x + 1, [2, 3, 4, 5]],
    [dumbIterable(14, 20), (x: number) => x + 1, [15, 16, 17, 18, 19, 20]],
  ])("return an iterable with the correct values", (input, cb, expected) => {
    const iterable = map(input, cb);
    const iterator = iterable[Symbol.iterator]();
    expected.forEach((value) => {
      expect(iterator.next()).toEqual({ done: false, value });
    });
    expect(iterator.next()).toEqual({ done: true, value: undefined });
  });

  it("calls the callback with the correct arguments", () => {
    const cb = vi.fn((x) => x);
    const a = { a: "a" };
    const b = { b: "b" };
    const c = { c: "c" };
    const iterable = map([a, b, c], cb);
    const iterator = iterable[Symbol.iterator]();
    expectFnCalls(iterator, cb, [a, b, c]);
  });
});

describe("filter", () => {
  it.each([
    [dumbIterable(1, 4), (x: number) => x % 2 === 0, [2]],
    [dumbIterable(1, 5), (x: number) => x % 2 === 0, [2, 4]],
    [dumbIterable(14, 20), (x: number) => x % 2 === 0, [14, 16, 18]],
    [[23, 43, 12, 67, 95, 2, 45, 2], (x: number) => x > 30, [43, 67, 95, 45]],
  ])(
    "return an iterable with the correct values",
    (input, predicate, expected) => {
      const iterable = filter(input, predicate);
      const iterator = iterable[Symbol.iterator]();
      expected.forEach((value) => {
        expect(iterator.next()).toEqual({ done: false, value });
      });
      expect(iterator.next()).toEqual({ done: true, value: undefined });
    },
  );

  it("calls the callback with the correct arguments", () => {
    const cb = vi.fn((x) => x);
    const a = { a: "a" };
    const b = { b: "b" };
    const c = { c: "c" };
    const iterable = filter([a, b, c], cb);
    const iterator = iterable[Symbol.iterator]();
    expectFnCalls(iterator, cb, [a, b, c]);
  });
});

describe("take", () => {
  it.each([
    [dumbIterable(1, 4), 2, [1, 2]],
    [dumbIterable(1, 5), 3, [1, 2, 3]],
    [dumbIterable(14, 100), 4, [14, 15, 16, 17]],
    [dumbIterable(1, 4), 10, [1, 2, 3]],
  ])("return an iterable with the correct values", (input, count, expected) => {
    const iterable = take(input, count);
    const iterator = iterable[Symbol.iterator]();
    expected.forEach((value) => {
      expect(iterator.next()).toEqual({ done: false, value });
    });
    expect(iterator.next()).toEqual({ done: true, value: undefined });
  });

  it('calls return on the iterator when "done"', () => {
    const input = dumbIterable(1, 100);
    const iterable = take(input, 4);
    const output = iterable[Symbol.iterator]();
    expectReturnWhenDone(input, output);
  });
});

describe("drop", () => {
  it.each([
    [dumbIterable(1, 4), 2, [3]],
    [dumbIterable(1, 5), 3, [4]],
    [dumbIterable(14, 100), 80, [94, 95, 96, 97, 98, 99]],
    [dumbIterable(1, 4), 10, []],
  ])("return an iterable with the correct values", (input, count, expected) => {
    const iterable = drop(input, count);
    expect(Array.from(iterable)).toEqual(expected);
  });
});

describe("concat", () => {
  it.each([
    [dumbIterable(1, 4), dumbIterable(5, 7), [1, 2, 3, 5, 6]],
    [dumbIterable(1, 5), dumbIterable(5, 7), [1, 2, 3, 4, 5, 6]],
    [dumbIterable(14, 20), dumbIterable(5, 7), [14, 15, 16, 17, 18, 19, 5, 6]],
  ])("return an iterable with the correct values", (a, b, expected) => {
    const iterable = concat(a, b);
    expect(Array.from(iterable)).toEqual(expected);
  });
});

describe("enumerate", () => {
  it("returns the value and index of the iterable as a tuple", () => {
    const input = dumbIterable(20, 25);
    const iterable = enumerate(input);
    expect(Array.from(iterable)).toEqual([
      [0, 20],
      [1, 21],
      [2, 22],
      [3, 23],
      [4, 24],
    ]);
  });
});

describe("zip", () => {
  it("returns an iterable of tuples of the same length as the shortest iterable", () => {
    const a = dumbIterable(1, 4);
    const b = dumbIterable(5, 100);
    const iterable = zip(a, b);
    expect(Array.from(iterable)).toEqual([
      [1, 5],
      [2, 6],
      [3, 7],
    ]);
  });

  it("calls return on the longest iterable when done", () => {
    const a = dumbIterable(1, 4);
    const b = dumbIterable(5, 100);
    const iterable = zip(a, b);
    const output = iterable[Symbol.iterator]();
    expectReturnWhenDone(b, output);
  });
});

describe("iota", () => {
  it("returns an iterable of numbers starting from 0", () => {
    const iterable = iota();
    const iter = iterable[Symbol.iterator]();
    expect([
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
    ]).toEqual([
      { done: false, value: 0 },
      { done: false, value: 1 },
      { done: false, value: 2 },
      { done: false, value: 3 },
      { done: false, value: 4 },
    ]);
  });

  it("accepts a start value", () => {
    const iterable = iota(10);
    const iter = iterable[Symbol.iterator]();
    expect([
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
    ]).toEqual([
      { done: false, value: 10 },
      { done: false, value: 11 },
      { done: false, value: 12 },
      { done: false, value: 13 },
      { done: false, value: 14 },
    ]);
  });

  it("accepts a step value", () => {
    const iterable = iota(0, 2);
    const iter = iterable[Symbol.iterator]();
    expect([
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
    ]).toEqual([
      { done: false, value: 0 },
      { done: false, value: 2 },
      { done: false, value: 4 },
      { done: false, value: 6 },
      { done: false, value: 8 },
    ]);

    iter.return?.();
  });

  it("accepts a start and step value", () => {
    const iterable = iota(10, 2);
    const iter = iterable[Symbol.iterator]();
    expect([
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
      iter.next(),
    ]).toEqual([
      { done: false, value: 10 },
      { done: false, value: 12 },
      { done: false, value: 14 },
      { done: false, value: 16 },
      { done: false, value: 18 },
    ]);

    iter.return?.();
  });
});

describe("range", () => {
  it("accepts a start and end value", () => {
    const iterable = range(0, 5);
    expect(Array.from(iterable)).toEqual([0, 1, 2, 3, 4]);
  });

  it("accepts a step value", () => {
    const iterable = range(0, 10, 2);
    expect(Array.from(iterable)).toEqual([0, 2, 4, 6, 8]);
  });
});
