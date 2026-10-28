export function dumbIterable(from: number, to: number): IterableIterator<number> {
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

export function dumbAsyncIterable(from: number, to: number): AsyncIterableIterator<number> {
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

export function dumbReadableStream(from: number, to: number): ReadableStream<number> {
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

export interface Tracked {
  /** Number of times `return()` was called on the source. */
  returns: number;
  /** Number of times `throw()` was called on the source. */
  throws: number;
  /** Whether the source reported `done: true` by itself. */
  completed: boolean;
}

/**
 * A sync source that records `return()` calls. If `failOn` is given, the
 * `next()` call with that (0-based) index throws `error`.
 */
export function trackedIterable(
  from: number,
  to: number,
  { failOn, error = new Error("source failed") }: { failOn?: number; error?: unknown } = {},
): IterableIterator<number> & Tracked {
  let i = from;
  let calls = 0;
  const tracked: IterableIterator<number> & Tracked = {
    returns: 0,
    throws: 0,
    completed: false,
    next() {
      if (calls++ === failOn) throw error;
      if (i < to) return { done: false, value: i++ };
      tracked.completed = true;
      return { done: true, value: undefined };
    },
    return(value) {
      tracked.returns++;
      i = to;
      return { done: true, value };
    },
    throw(e) {
      tracked.throws++;
      i = to;
      throw e;
    },
    [Symbol.iterator]() {
      return this;
    },
  };
  return tracked;
}

/** Async counterpart of {@link trackedIterable}; `failOn` makes `next()` reject. */
export function trackedAsyncIterable(
  from: number,
  to: number,
  { failOn, error = new Error("source failed") }: { failOn?: number; error?: unknown } = {},
): AsyncIterableIterator<number> & Tracked {
  let i = from;
  let calls = 0;
  const tracked: AsyncIterableIterator<number> & Tracked = {
    returns: 0,
    throws: 0,
    completed: false,
    async next() {
      await Promise.resolve();
      if (calls++ === failOn) throw error;
      if (i < to) return { done: false, value: i++ };
      tracked.completed = true;
      return { done: true, value: undefined };
    },
    async return(value) {
      await Promise.resolve();
      tracked.returns++;
      i = to;
      return { done: true, value };
    },
    async throw(e) {
      await Promise.resolve();
      tracked.throws++;
      i = to;
      throw e;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return tracked;
}

export interface TrackedStream<T> extends ReadableStream<T> {
  /** Reasons `cancel()` was called with on the source. */
  cancels: unknown[];
}

/** A source stream that records `cancel()` calls. With `failOn`, that pull errors the stream. */
export function trackedReadableStream(
  from: number,
  to: number,
  { failOn, error = new Error("source failed") }: { failOn?: number; error?: unknown } = {},
): TrackedStream<number> {
  let i = from;
  let pulls = 0;
  const cancels: unknown[] = [];
  const stream = new ReadableStream<number>(
    {
      pull(controller) {
        if (pulls++ === failOn) {
          controller.error(error);
        } else if (i < to) {
          controller.enqueue(i++);
        } else {
          controller.close();
        }
      },
      cancel(reason) {
        cancels.push(reason);
        i = to;
      },
    },
    { highWaterMark: 0 },
  ) as TrackedStream<number>;
  stream.cancels = cancels;
  return stream;
}
