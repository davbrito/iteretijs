export function dumbIterable(
  from: number,
  to: number,
): IterableIterator<number> {
  let i = from;
  return {
    next() {
      if (i < to) {
        return { done: false, value: i++ };
      }
      return { done: true, value: undefined };
    },
    return(value) {
      i = to;
      return { done: true, value };
    },
    throw() {
      i = to;
      return { done: true, value: undefined };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

export function dumbAsyncIterable(
  from: number,
  to: number,
): AsyncIterableIterator<number> {
  const iterator = dumbIterable(from, to);

  return {
    async next(...args) {
      await Promise.resolve();
      return iterator.next(...args);
    },
    async return(value) {
      await Promise.resolve();
      return iterator.return!(value);
    },
    async throw(e) {
      await Promise.resolve();
      return iterator.throw!(e);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export function dumbReadableStream(
  from: number,
  to: number,
): ReadableStream<number> {
  let i = from;
  return new ReadableStream({
    async pull(controller) {
      if (i < to) {
        controller.enqueue(i++);
      } else {
        controller.close();
      }
    },
    async cancel() {
      i = to;
    },
  });
}
