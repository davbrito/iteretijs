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
  /** Whether the source reported `done: true` by itself. */
  completed: boolean;
}

interface TrackedOptions {
  /** The `next()` call with this (0-based) index throws (rejects, for async sources). */
  failOn?: number;
  error?: unknown;
  /** `return()` throws (rejects, for async sources) this after being recorded. */
  returnError?: unknown;
}

/** A sync source that records `return()` calls. */
export function trackedIterable(
  from: number,
  to: number,
  { failOn, error = new Error("source failed"), returnError }: TrackedOptions = {},
): IterableIterator<number> & Tracked {
  let i = from;
  let calls = 0;
  const tracked: IterableIterator<number> & Tracked = {
    returns: 0,
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
      if (returnError !== undefined) throw returnError;
      return { done: true, value };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
  return tracked;
}

/** Async counterpart of {@link trackedIterable}, wrapping it the way `dumbAsyncIterable` does. */
export function trackedAsyncIterable(
  from: number,
  to: number,
  options?: TrackedOptions,
): AsyncIterableIterator<number> & Tracked {
  const iterator = trackedIterable(from, to, options);
  return {
    get returns() {
      return iterator.returns;
    },
    get completed() {
      return iterator.completed;
    },
    async next() {
      await Promise.resolve();
      return iterator.next();
    },
    async return(value) {
      await Promise.resolve();
      return iterator.return!(value);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
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

/** The ways a consumer can leave a `for...of` loop early. */
export const exits = {
  break: (iterable: Iterable<unknown>) => {
    for (const _ of iterable) break;
  },
  return: (iterable: Iterable<unknown>) => {
    for (const _ of iterable) return;
  },
  throw: (iterable: Iterable<unknown>) => {
    try {
      for (const _ of iterable) throw new Error("boom");
    } catch {}
  },
};

/** Async counterpart of {@link exits}. */
export const asyncExits = {
  break: async (iterable: AsyncIterable<unknown>) => {
    for await (const _ of iterable) break;
  },
  return: async (iterable: AsyncIterable<unknown>) => {
    for await (const _ of iterable) return;
  },
  throw: async (iterable: AsyncIterable<unknown>) => {
    try {
      for await (const _ of iterable) throw new Error("boom");
    } catch {}
  },
};
