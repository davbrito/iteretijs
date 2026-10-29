/** An async generator whose results are also `AsyncIteratorObject`s. */
export type AsyncItereti<T> = AsyncGenerator<T, void, unknown>;

/**
 * @deprecated Use `AsyncIterator.prototype.map` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).map(mapper)`.
 * Polyfill: core-js.
 */
export async function* map<T, U>(
  iterable: AsyncIterable<T>,
  mapper: (value: T) => U | Promise<U>,
): AsyncGenerator<U, void, unknown> {
  for await (const item of iterable) {
    yield mapper(item);
  }
}

/**
 * @deprecated Use `AsyncIterator.prototype.filter` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).filter(predicate)`.
 * Polyfill: core-js.
 */
export async function* filter<T>(
  iterable: AsyncIterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
): AsyncGenerator<T, void, unknown> {
  for await (const item of iterable) {
    if (await predicate(item)) {
      yield item;
    }
  }
}

/**
 * @deprecated Use `AsyncIterator.prototype.take` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).take(count)`.
 * Polyfill: core-js.
 */
export async function* take<T>(iterable: AsyncIterable<T>, count: number): AsyncGenerator<T, void, unknown> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      break;
    }
    yield item;
    i++;
  }
}

/**
 * @deprecated Use `AsyncIterator.prototype.drop` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).drop(count)`.
 * Polyfill: core-js.
 */
export async function* drop<T>(iterable: AsyncIterable<T>, count: number): AsyncGenerator<T, void, unknown> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      yield item;
    }
    i++;
  }
}

/**
 * Not deprecated yet. Planned for deprecation in v0.5 and removal in v1.0, once the platform has general
 * support for it: the async iterator helpers proposal has no `concat`.
 *
 * Suggestion: chain the iterables with `yield*` in an async generator:
 * `async function* () { yield* a; yield* b; }`.
 */
export async function* concat<T>(...iterables: AsyncIterable<T>[]): AsyncGenerator<T, void, unknown> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

/**
 * Not deprecated yet. Planned for deprecation in v0.5 and removal in v1.0, once the platform has general
 * support for it: `Iterator.zip` only takes sync iterables and the async iterator helpers proposal has no `zip`.
 *
 * Suggestion: keep using it until then; the replacement will be named here when it is deprecated.
 */
export async function* zip<T, U>(
  iterable1: AsyncIterable<T>,
  iterable2: AsyncIterable<U>,
): AsyncGenerator<[T, U], void, unknown> {
  const iter1 = iterable1[Symbol.asyncIterator]();
  let iter2: AsyncIterator<U>;
  try {
    iter2 = iterable2[Symbol.asyncIterator]();
  } catch (error) {
    await closeAll([iter1], true);
    throw error;
  }

  // An iterator that is mid-`next()`, rejected or completed must not get `return()`.
  let open1 = false;
  let open2 = false;
  let failed = false;

  try {
    for (;;) {
      open1 = open2 = false;
      // Wait for both to settle so a rejection never leaves the other `next()` in flight.
      // The `async` wrappers also turn a synchronous throw from `next()` into a rejection.
      const [result1, result2] = await Promise.allSettled([(async () => iter1.next())(), (async () => iter2.next())()]);
      open1 = result1.status === "fulfilled" && !result1.value.done;
      open2 = result2.status === "fulfilled" && !result2.value.done;

      if (result1.status === "rejected") throw result1.reason;
      if (result2.status === "rejected") throw result2.reason;
      if (result1.value.done || result2.value.done) break;

      yield [result1.value.value, result2.value.value];
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await closeAll([open1 && iter1, open2 && iter2], failed);
  }
}

/**
 * Calls `return()` on every given iterator, like the spec's `AsyncIteratorClose`: an error thrown by
 * `return()` only propagates when there is no error already in flight (`suppress`).
 */
async function closeAll(iterators: (AsyncIterator<unknown> | false)[], suppress: boolean): Promise<void> {
  let failed = false;
  let failure: unknown;
  for (const iterator of iterators) {
    if (!iterator) continue;
    try {
      await iterator.return?.();
    } catch (error) {
      if (!failed) [failed, failure] = [true, error];
    }
  }
  if (failed && !suppress) throw failure;
}

interface IterateStreamOptions {
  preventCancel?: boolean;
}

/**
 * @deprecated Iterate the stream directly: `for await (const chunk of stream)`, or `stream.values({ preventCancel })` to keep the stream open when you stop early.
 */
export function iterateStream<T>(
  stream: ReadableStream<T>,
  options?: IterateStreamOptions,
): AsyncGenerator<T, void, unknown> {
  const reader = stream.getReader();
  const preventCancel = options?.preventCancel ?? false;

  return {
    [Symbol.asyncIterator]: function () {
      return this;
    },
    async next() {
      const result = await reader.read();

      if (result.done) {
        if (!preventCancel) await reader.cancel();
        reader.releaseLock();
        return { done: true, value: undefined };
      }

      return result;
    },
    async return(value) {
      if (!preventCancel) await reader.cancel();
      reader.releaseLock();
      value = await value;
      return { done: true, value };
    },
    async throw(e) {
      if (!preventCancel) await reader.cancel(e);
      reader.releaseLock();
      throw e;
    },
    async [Symbol.asyncDispose]() {
      await this.return();
    },
  };
}

/**
 * @deprecated Use `AsyncIterator.prototype.map` (TC39 async iterator helpers proposal, Stage 2), whose callback also receives the index: `AsyncIterator.from(iterable).map((value, index) => [index, value])`.
 * Polyfill: core-js.
 */
export async function* enumerate<T>(iterable: AsyncIterable<T>): AsyncGenerator<[number, T], void, unknown> {
  let index = 0;
  for await (const item of iterable) {
    yield [index, item];
    index++;
  }
}

/**
 * @deprecated Use the native `Array.fromAsync`: `Array.fromAsync(iterable)`.
 */
export async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];

  for await (const item of iterable) {
    result.push(item);
  }

  return result;
}

/**
 * @deprecated Use `AsyncIterator.prototype.reduce` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).reduce(reducer, initialValue)`.
 * Polyfill: core-js.
 */
export async function reduce<T, U>(
  iterable: AsyncIterable<T>,
  reducer: (accumulator: U, value: T) => U | PromiseLike<U>,
  initialValue: U,
): Promise<U> {
  let accumulator = initialValue;
  for await (const item of iterable) {
    // try {
    accumulator = await reducer(accumulator, item);
    // } catch (error) {
    //   console.log("error in", error);
    //   throw error;
    // }
  }

  return accumulator;
}

/**
 * @deprecated Use `AsyncIterator.prototype.reduce` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).reduce((count) => count + 1, 0)`.
 * Polyfill: core-js.
 */
export async function count<T>(iterable: AsyncIterable<T>): Promise<number> {
  let count = 0;

  for await (const _ of iterable) {
    count++;
  }

  return count;
}
