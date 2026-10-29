import { describe, expect, it, vi } from "vitest";
import {
  concat,
  count,
  drop,
  enumerate,
  filter,
  iterateStream,
  map,
  take,
  toArray,
  zip,
  reduce,
} from "../src/async.ts";
import { asyncExits, dumbAsyncIterable, dumbReadableStream, trackedAsyncIterable } from "./utils.ts";

describe("return an async iterable", () => {
  it("map", () => {
    expect(map(dumbAsyncIterable(1, 4), (x) => x + 1)).toBeAsyncIterable();
  });

  it("filter", () => {
    expect(filter(dumbAsyncIterable(1, 4), (x) => x % 2 === 0)).toBeAsyncIterable();
  });

  it("take", () => {
    expect(take(dumbAsyncIterable(1, 4), 2)).toBeAsyncIterable();
  });

  it("drop", () => {
    expect(drop(dumbAsyncIterable(1, 4), 2)).toBeAsyncIterable();
  });

  it("enumerate", () => {
    expect(enumerate(dumbAsyncIterable(1, 4))).toBeAsyncIterable();
  });

  it("zip", () => {
    expect(zip(dumbAsyncIterable(1, 4), dumbAsyncIterable(1, 4))).toBeAsyncIterable();
  });

  it("concat", () => {
    expect(concat(dumbAsyncIterable(1, 4), dumbAsyncIterable(1, 4))).toBeAsyncIterable();
  });

  it("iterateStream", async () => {
    const stream = dumbReadableStream(1, 4);
    const iter = iterateStream(stream);
    expect(iter).toBeAsyncIterable();
    await iter.return!();
  });
});

describe("map", () => {
  it("maps values", async () => {
    const iterator = map(dumbAsyncIterable(1, 4), (x) => x + 1);
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 4 });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("awaits values", async () => {
    const iterator = map(dumbAsyncIterable(1, 4), (x) => Promise.resolve(x + 1));
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 4 });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });
});

describe("filter", () => {
  it("filters values", async () => {
    const iterator = filter(dumbAsyncIterable(1, 4), (x) => x % 2 === 0);
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("awaits values", async () => {
    const iterator = filter(dumbAsyncIterable(1, 4), (x) => Promise.resolve(x % 2 === 0));
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });
});

describe("iterateStream", () => {
  it("iterates over the stream values", async () => {
    const stream = dumbReadableStream(1, 5);

    const iterator = iterateStream(stream);
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 4 });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("cancels the stream when return is called", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      cancel,
    });

    const iterator = iterateStream(stream);
    await iterator.return();

    expect(cancel).toHaveBeenCalled();
  });

  it("releases the reader lock when return is called", async () => {
    const stream = new ReadableStream();
    const iterator = iterateStream(stream);
    expect(stream.locked).toBe(true);
    await iterator.return();
    expect(stream.locked).toBe(false);
  });

  it("throws an error and cancels the stream when throw is called", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      cancel,
    });
    const error = new Error("Test error");

    const iterator = iterateStream(stream);
    await expect(iterator.throw(error)).rejects.toThrow(error);

    expect(cancel).toHaveBeenCalledWith(error);
  });

  it("releases the reader lock when throw is called", async () => {
    const stream = new ReadableStream();
    const iterator = iterateStream(stream);
    expect(stream.locked).toBe(true);
    const error = new Error("Test error");
    await expect(iterator.throw(error)).rejects.toThrow(error);
    expect(stream.locked).toBe(false);
  });

  it('does not cancel the stream when "preventCancel" is true', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      cancel,
    });

    const iterator = iterateStream(stream, { preventCancel: true });
    await iterator.return();
    expect(cancel).not.toHaveBeenCalled();
    await stream.cancel();
  });

  it("releases the reader lock when return is called and preventCancel is true", async () => {
    const stream = new ReadableStream();
    const iterator = iterateStream(stream, { preventCancel: true });
    expect(stream.locked).toBe(true);
    await iterator.return();
    expect(stream.locked).toBe(false);
    await stream.cancel();
  });
});

describe("take", () => {
  it("takes specified number of items from an async iterable", async () => {
    const asyncIterable = dumbAsyncIterable(1, 50);
    const result = take(asyncIterable, 3);
    await expect(toArray(result)).resolves.toEqual([1, 2, 3]);
  });

  it("returns an empty async iterable if count is 0", async () => {
    const asyncIterable = dumbAsyncIterable(1, 50);
    const result = await toArray(take(asyncIterable, 0));
    expect(result).toEqual([]);
  });

  it("returns all items if count is greater than the length of the async iterable", async () => {
    const expexted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const asyncIterable = dumbAsyncIterable(0, 10);

    await expect(toArray(take(asyncIterable, 100))).resolves.toEqual(expexted);
  });

  it("returns an empty async iterable if the input async iterable is empty", async () => {
    await expect(toArray(dumbAsyncIterable(1, 0))).resolves.toEqual([]);
  });
});

describe("drop", () => {
  it("drops specified number of items from an async iterable", async () => {
    const asyncIterable = dumbAsyncIterable(1, 11);
    const result = drop(asyncIterable, 3);
    await expect(toArray(result)).resolves.toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it("returns all items if count is greater than the length of the async iterable", async () => {
    const asyncIterable = dumbAsyncIterable(1, 10);
    const result = drop(asyncIterable, 100);
    await expect(toArray(result)).resolves.toEqual([]);
  });

  it("returns an empty async iterable if the input async iterable is empty", async () => {
    await expect(toArray(dumbAsyncIterable(1, 0))).resolves.toEqual([]);
  });
});

describe("concat", () => {
  it("concatenates multiple async iterables", async () => {
    const iterable1 = dumbAsyncIterable(1, 4);
    const iterable2 = dumbAsyncIterable(4, 7);
    const iterable3 = dumbAsyncIterable(7, 10);

    const result = concat(iterable1, iterable2, iterable3);
    await expect(toArray(result)).resolves.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("returns an empty async iterable if no iterables are provided", async () => {
    const result = concat();
    await expect(toArray(result)).resolves.toEqual([]);
  });

  it("returns the same async iterable if only one iterable is provided", async () => {
    const iterable = dumbAsyncIterable(1, 4);
    const result = concat(iterable);
    await expect(toArray(result)).resolves.toEqual([1, 2, 3]);
  });
});

/** A hand-written async iterator whose `next()` is not an `async` function and throws. */
function syncThrowingAsyncIterator(): AsyncIterableIterator<number> {
  return {
    next() {
      throw new Error("sync failure");
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/** An async source that logs its calls; the first value can throw, and `return()` can fail. */
function loggedAsyncIterator(
  name: string,
  log: string[],
  { valueThrows, returnError }: { valueThrows?: unknown; returnError?: unknown } = {},
): AsyncIterableIterator<number> {
  let i = 0;
  return {
    async next() {
      log.push(`${name}.next`);
      if (valueThrows !== undefined && i++ === 0) {
        return {
          done: false,
          get value(): number {
            log.push(`${name}.value`);
            throw valueThrows;
          },
        };
      }
      return { done: false, value: i++ };
    },
    async return(value) {
      log.push(`${name}.return`);
      if (returnError !== undefined) throw returnError;
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

describe("zip", () => {
  it("zips two async iterables", async () => {
    const iterable1 = dumbAsyncIterable(1, 4);
    const iterable2 = dumbAsyncIterable(4, 7);

    const result = zip(iterable1, iterable2);
    await expect(toArray(result)).resolves.toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it("returns an empty async iterable if one of the iterables is empty", async () => {
    const iterable1 = dumbAsyncIterable(1, 4);
    const iterable2 = dumbAsyncIterable(4, 4);

    const result = zip(iterable1, iterable2);
    await expect(toArray(result)).resolves.toEqual([]);
  });

  it("the resulting size is the length of the shortest iterable", async () => {
    const iterable1 = dumbAsyncIterable(1, 4);
    const iterable2 = dumbAsyncIterable(4, 100);
    const result = zip(iterable1, iterable2);
    const c = await count(result);
    expect(c).toBe(3);
  });

  describe("closes the sources", () => {
    it.each(Object.entries(asyncExits))("when the consumer exits with %s", async (_name, exit) => {
      const a = trackedAsyncIterable(1, 10);
      const b = trackedAsyncIterable(1, 10);
      await exit(zip(a, b));
      expect(a.returns).toBe(1);
      expect(b.returns).toBe(1);
    });

    it("when the first source rejects, closing the second", async () => {
      const a = trackedAsyncIterable(1, 10, { failOn: 1 });
      const b = trackedAsyncIterable(1, 10);
      await expect(toArray(zip(a, b))).rejects.toThrow("source failed");
      expect(b.returns).toBe(1);
    });

    it("when the second source rejects, closing the first", async () => {
      const a = trackedAsyncIterable(1, 10);
      const b = trackedAsyncIterable(1, 10, { failOn: 1 });
      await expect(toArray(zip(a, b))).rejects.toThrow("source failed");
      expect(a.returns).toBe(1);
    });

    it("keeping the original error when closing the other source also rejects", async () => {
      const a = trackedAsyncIterable(1, 10, { returnError: new Error("return failed") });
      const b = trackedAsyncIterable(1, 10, { failOn: 1 });
      await expect(toArray(zip(a, b))).rejects.toThrow("source failed");
      expect(a.returns).toBe(1);
    });

    it("when getting the second iterator throws", async () => {
      const a = trackedAsyncIterable(1, 10);
      const bad: AsyncIterable<number> = {
        [Symbol.asyncIterator]() {
          throw new Error("bad iterable");
        },
      };
      await expect(toArray(zip(a, bad))).rejects.toThrow("bad iterable");
      expect(a.returns).toBe(1);
    });

    it("when the first next() throws synchronously, closing the second", async () => {
      const a = syncThrowingAsyncIterator();
      const b = trackedAsyncIterable(1, 10);
      await expect(toArray(zip(a, b))).rejects.toThrow("sync failure");
      expect(b.returns).toBe(1);
    });

    it("when the second next() throws synchronously, closing the first", async () => {
      const a = trackedAsyncIterable(1, 10);
      const b = syncThrowingAsyncIterator();
      await expect(toArray(zip(a, b))).rejects.toThrow("sync failure");
      expect(a.returns).toBe(1);
    });

    it("does not close the source whose value getter throws", async () => {
      const log: string[] = [];
      const a = loggedAsyncIterator("a", log, { valueThrows: new Error("value failed") });
      const b = loggedAsyncIterator("b", log);
      await expect(toArray(zip(a, b))).rejects.toThrow("value failed");
      // the iterator whose value threw is done (not closed); the other one is closed
      expect(log).not.toContain("a.return");
      expect(log).toContain("b.return");
    });

    it("does not close the second source when its value getter throws", async () => {
      const log: string[] = [];
      const a = loggedAsyncIterator("a", log);
      const b = loggedAsyncIterator("b", log, { valueThrows: new Error("value failed") });
      await expect(toArray(zip(a, b))).rejects.toThrow("value failed");
      expect(log).toContain("a.return");
      expect(log).not.toContain("b.return");
    });

    it("closes the sources in reverse order when the consumer stops early", async () => {
      const log: string[] = [];
      for await (const _ of zip(loggedAsyncIterator("a", log), loggedAsyncIterator("b", log))) break;
      expect(log.filter((entry) => entry.endsWith(".return"))).toEqual(["b.return", "a.return"]);
    });

    it("surfaces the error of the last source closed first when both return() calls reject", async () => {
      const a = loggedAsyncIterator("a", [], { returnError: new Error("a return failed") });
      const b = loggedAsyncIterator("b", [], { returnError: new Error("b return failed") });
      await expect(
        (async () => {
          for await (const _ of zip(a, b)) break;
        })(),
      ).rejects.toThrow("b return failed");
    });

    it("but not the one that already completed", async () => {
      const a = trackedAsyncIterable(1, 3);
      const b = trackedAsyncIterable(1, 10);
      await toArray(zip(a, b));
      expect(a.completed).toBe(true);
      expect(a.returns).toBe(0);
      expect(b.returns).toBe(1);
    });
  });
});

describe("enumerate", () => {
  it("enumerates an async iterable", async () => {
    const iterable = dumbAsyncIterable(1, 4);
    const result = enumerate(iterable);
    await expect(toArray(result)).resolves.toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });
});

describe("reduce", () => {
  it("reduces an async iterable", async () => {
    const iterable = dumbAsyncIterable(1, 4);
    const result = reduce(iterable, (acc, x) => acc + x, 0);
    await expect(result).resolves.toEqual(6);
  });

  it("errors on the reducer are propagated", async () => {
    const iterable = dumbAsyncIterable(1, 4);
    const spyReturn = vi.spyOn(iterable, "return");
    const error = new Error("Test error");
    const promise = reduce(iterable, () => Promise.reject(error), 0);
    await expect(promise).rejects.toThrow(error);

    expect(spyReturn).toHaveBeenCalled();
  });
});
