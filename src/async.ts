export interface AsyncItereti<T> extends AsyncGenerator<T, void, undefined> {}

export async function* map<T, U>(iterable: AsyncIterable<T>, mapper: (value: T) => U | Promise<U>): AsyncItereti<U> {
  for await (const item of iterable) {
    yield mapper(item);
  }
}

export async function* filter<T>(
  iterable: AsyncIterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
): AsyncItereti<T> {
  for await (const item of iterable) {
    if (await predicate(item)) {
      yield item;
    }
  }
}

export async function* take<T>(iterable: AsyncIterable<T>, count: number): AsyncItereti<T> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      break;
    }
    yield item;
    i++;
  }
}

export async function* drop<T>(iterable: AsyncIterable<T>, count: number): AsyncItereti<T> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      yield item;
    }
    i++;
  }
}

export async function* concat<T>(...iterables: AsyncIterable<T>[]): AsyncItereti<T> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

export async function* zip<T, U>(iterable1: AsyncIterable<T>, iterable2: AsyncIterable<U>): AsyncItereti<[T, U]> {
  const iter1 = iterable1[Symbol.asyncIterator]();
  const iter2 = iterable2[Symbol.asyncIterator]();
  // An iterator that is mid-`next()`, rejected or completed must not get `return()`.
  let open1 = true;
  let open2 = true;

  try {
    for (;;) {
      open1 = open2 = false;
      // Wait for both to settle so a rejection never leaves the other `next()` in flight.
      const [result1, result2] = await Promise.allSettled([iter1.next(), iter2.next()]);
      open1 = result1.status === "fulfilled" && !result1.value.done;
      open2 = result2.status === "fulfilled" && !result2.value.done;

      if (result1.status === "rejected") throw result1.reason;
      if (result2.status === "rejected") throw result2.reason;
      if (result1.value.done || result2.value.done) break;

      yield [result1.value.value, result2.value.value];
    }
  } finally {
    try {
      if (open1) await iter1.return?.();
    } finally {
      if (open2) await iter2.return?.();
    }
  }
}

interface IterateStreamOptions {
  preventCancel?: boolean;
}

export function iterateStream<T>(stream: ReadableStream<T>, options?: IterateStreamOptions): AsyncItereti<T> {
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

export async function* enumerate<T>(iterable: AsyncIterable<T>): AsyncItereti<[number, T]> {
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
