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
import { dumbAsyncIterable, dumbReadableStream } from "./utils.ts";

describe("return an async iterable", () => {
  it("map", () => {
    expect(map(dumbAsyncIterable(1, 4), (x) => x + 1)).toBeAsyncIterable();
  });

  it("filter", () => {
    expect(
      filter(dumbAsyncIterable(1, 4), (x) => x % 2 === 0),
    ).toBeAsyncIterable();
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
    expect(
      zip(dumbAsyncIterable(1, 4), dumbAsyncIterable(1, 4)),
    ).toBeAsyncIterable();
  });

  it("concat", () => {
    expect(
      concat(dumbAsyncIterable(1, 4), dumbAsyncIterable(1, 4)),
    ).toBeAsyncIterable();
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
    const iterator = map(dumbAsyncIterable(1, 4), (x) =>
      Promise.resolve(x + 1),
    );
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
    const iterator = filter(dumbAsyncIterable(1, 4), (x) =>
      Promise.resolve(x % 2 === 0),
    );
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
    expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });
    expect(iterator.next()).resolves.toEqual({ done: false, value: 4 });
    expect(iterator.next()).resolves.toEqual({
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
    expect(toArray(dumbAsyncIterable(1, 0))).resolves.toEqual([]);
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
    expect(toArray(dumbAsyncIterable(1, 0))).resolves.toEqual([]);
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
