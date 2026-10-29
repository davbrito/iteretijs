/** @deprecated Use `AsyncIteratorObject<T, undefined, unknown>`; this alias only exists to keep old imports working. */
export type AsyncItereti<T> = AsyncIteratorObject<T, undefined, unknown>;

export async function* map<T, U>(
  iterable: AsyncIterable<T>,
  mapper: (value: T) => U | Promise<U>,
): AsyncIteratorObject<U, undefined, unknown> {
  for await (const item of iterable) {
    yield mapper(item);
  }
}

export async function* filter<T>(
  iterable: AsyncIterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
): AsyncIteratorObject<T, undefined, unknown> {
  for await (const item of iterable) {
    if (await predicate(item)) {
      yield item;
    }
  }
}

export async function* take<T>(iterable: AsyncIterable<T>, count: number): AsyncIteratorObject<T, undefined, unknown> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      break;
    }
    yield item;
    i++;
  }
}

export async function* drop<T>(iterable: AsyncIterable<T>, count: number): AsyncIteratorObject<T, undefined, unknown> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      yield item;
    }
    i++;
  }
}

export async function* concat<T>(...iterables: AsyncIterable<T>[]): AsyncIteratorObject<T, undefined, unknown> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

export async function* zip<T, U>(
  iterable1: AsyncIterable<T>,
  iterable2: AsyncIterable<U>,
): AsyncIteratorObject<[T, U], undefined, unknown> {
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

export function iterateStream<T>(
  stream: ReadableStream<T>,
  options?: IterateStreamOptions,
): AsyncIteratorObject<T, undefined, unknown> {
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
      await this.return?.();
    },
  };
}

export async function* enumerate<T>(iterable: AsyncIterable<T>): AsyncIteratorObject<[number, T], undefined, unknown> {
  let index = 0;
  for await (const item of iterable) {
    yield [index, item];
    index++;
  }
}

export async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];

  for await (const item of iterable) {
    result.push(item);
  }

  return result;
}

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

export async function count<T>(iterable: AsyncIterable<T>): Promise<number> {
  let count = 0;

  for await (const _ of iterable) {
    count++;
  }

  return count;
}
