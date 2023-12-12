export async function* map<T, U>(
  iterable: AsyncIterable<T>,
  mapper: (value: T) => U | Promise<U>,
): AsyncIterable<U> {
  for await (const item of iterable) {
    yield mapper(item);
  }
}

export async function* filter<T>(
  iterable: AsyncIterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
): AsyncIterable<T> {
  for await (const item of iterable) {
    if (await predicate(item)) {
      yield item;
    }
  }
}

export async function* take<T>(
  iterable: AsyncIterable<T>,
  count: number,
): AsyncIterable<T> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      break;
    }
    yield item;
    i++;
  }
}

export async function* drop<T>(
  iterable: AsyncIterable<T>,
  count: number,
): AsyncIterable<T> {
  let i = 0;
  for await (const item of iterable) {
    if (i >= count) {
      yield item;
    }
    i++;
  }
}

export async function* concat<T>(
  ...iterables: AsyncIterable<T>[]
): AsyncIterable<T> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

export async function* zip<T, U>(
  iterable1: AsyncIterable<T>,
  iterable2: AsyncIterable<U>,
): AsyncIterable<[T, U]> {
  const iter1 = iterable1[Symbol.asyncIterator]();
  const iter2 = iterable2[Symbol.asyncIterator]();

  for (;;) {
    const [item1, item2] = await Promise.all([iter1.next(), iter2.next()]);

    if (item1.done || item2.done) {
      break;
    }

    yield [item1.value, item2.value];
  }
}

export function iterateStream<T>(
  stream: ReadableStream<T>,
): AsyncIterableIterator<T> {
  const reader = stream.getReader();

  return {
    [Symbol.asyncIterator]: function () {
      return this;
    },
    async next() {
      const { done, value } = await reader.read();

      if (done) {
        return { done, value };
      }

      return { done, value };
    },
  };
}

export async function* enumerate<T>(
  iterable: AsyncIterable<T>,
): AsyncIterableIterator<[number, T]> {
  let index = 0;
  for await (const item of iterable) {
    yield [index, item];
    index++;
  }
}
