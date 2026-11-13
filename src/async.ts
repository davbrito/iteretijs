/** An async generator whose results are also `AsyncIteratorObject`s. */
export type AsyncItereti<T> = AsyncGenerator<T, void, unknown>;

/**
 * @deprecated Use `AsyncIterator.prototype.map` (TC39 async iterator helpers proposal, Stage 2): `AsyncIterator.from(iterable).map(mapper)`.
 * Not in Node 24 yet; polyfill: core-js.
 * The callback also receives the index.
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
 * Not in Node 24 yet; polyfill: core-js.
 * The callback also receives the index.
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
 * Not in Node 24 yet; polyfill: core-js.
 * The native sync `take`/`drop` throw a `RangeError` for a negative or `NaN` count, and the async helpers are expected to as well.
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
 * Not in Node 24 yet; polyfill: core-js.
 * The native sync `take`/`drop` throw a `RangeError` for a negative or `NaN` count, and the async helpers are expected to as well.
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
      const [result1, result2] = await Promise.allSettled([step(iter1), step(iter2)]);
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
 * Steps an iterator and reads `done` and `value` right away, like `IteratorStepValue`: a throwing getter, or
 * a `next()` that throws synchronously, becomes a rejection, so that iterator counts as done.
 */
async function step<T>(iterator: AsyncIterator<T>): Promise<Step<T>> {
  const result = await iterator.next();
  return result.done ? { done: true } : { done: false, value: result.value };
}

/**
 * Calls `return()` on every given iterator in reverse order, like the spec's `IteratorCloseAll`: an
 * error thrown by `return()` only propagates when there is no error already in flight (`suppress`).
 */
async function closeAll(iterators: (AsyncIterator<unknown> | false)[], suppress: boolean): Promise<void> {
  let failed = false;
  let failure: unknown;
  for (const iterator of iterators.toReversed()) {
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
 * Not in Node 24 yet; polyfill: core-js.
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
 * Not in Node 24 yet; polyfill: core-js.
 */
export async function count<T>(iterable: AsyncIterable<T>): Promise<number> {
  let count = 0;

  for await (const _ of iterable) {
    count++;
  }

  return count;
}

export interface ParallelOptions {
  /** How many items may be processed, or wait to be read, at the same time. A positive integer or `Infinity`. */
  concurrency: number;
  /**
   * `true` (default) yields the results in the order of the source; `false` yields each one as soon as it
   * is ready.
   */
  ordered?: boolean;
  /** Aborting it stops `parallel`, which then rejects with the signal's reason. */
  signal?: AbortSignal;
}

/**
 * Calls `fn` on each item of `source` with at most `concurrency` calls at once, and yields the results.
 *
 * `fn` gets the item, its index and an `AbortSignal` that aborts when `parallel` stops early: when a call
 * rejects, when the consumer stops reading (`break` in a `for await`), or when `options.signal` aborts.
 * Before finishing, `parallel` waits for the calls still running to settle and closes the source, so pass
 * the signal on (to `fetch`, for example) to make that quick.
 *
 * The source is read one item at a time, never with overlapping `next()` calls, and only while there is a
 * free slot: a result that is ready but not read yet keeps its slot. Items of a sync iterable are passed
 * to `fn` as they are, without awaiting them.
 *
 * The first rejection, of a call or of the source, stops reading the source, aborts the calls still
 * running and is thrown by the next read, even if earlier results (with `ordered: true`) are still pending.
 *
 * Like any async generator, `return()` waits for a read that is still pending, and that read can wait for
 * the running calls. To stop while a read is pending (after a timeout, for example), abort `options.signal`.
 *
 * Throws a `RangeError` for an invalid `concurrency` and a `TypeError` if `fn` is not a function.
 *
 * Not planned for deprecation: no TC39 proposal limits concurrency yet. The closest are the async iterator
 * helpers (Stage 2), whose helpers run concurrently only when `next()` is called concurrently, and the
 * concurrency control and unordered async iterator helpers proposals (Stage 1).
 */
export function parallel<T, U>(
  source: Iterable<T> | AsyncIterable<T>,
  fn: (value: T, index: number, signal: AbortSignal) => U | PromiseLike<U>,
  { concurrency, ordered = true, signal }: ParallelOptions,
): AsyncGenerator<Awaited<U>, void, unknown> {
  if (concurrency !== Infinity && !(Number.isInteger(concurrency) && concurrency > 0)) {
    throw new RangeError(`parallel concurrency must be a positive integer or Infinity, got ${concurrency}`);
  }
  if (typeof fn !== "function") {
    throw new TypeError(`parallel fn must be a function, got ${typeof fn}`);
  }
  return runParallel(source, fn, concurrency, ordered, signal);
}

type Settled<U> = { status: "pending" } | { status: "fulfilled"; value: U } | { status: "rejected"; reason: unknown };

async function* runParallel<T, U>(
  source: Iterable<T> | AsyncIterable<T>,
  fn: (value: T, index: number, signal: AbortSignal) => U | PromiseLike<U>,
  concurrency: number,
  ordered: boolean,
  signal: AbortSignal | undefined,
): AsyncGenerator<Awaited<U>, void, unknown> {
  signal?.throwIfAborted();
  const iterator = toAsyncIterator(source, "parallel");

  const controller = new AbortController();
  // Wakes the loop below when anything changes: a pull or a call settles, or `signal` aborts.
  let notify = () => {};
  // Aborts the running calls right away, even while the consumer is not reading.
  const onAbort = () => {
    controller.abort(signal!.reason);
    notify();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  // Ordered: every call not read yet, in source order. Unordered: the settled calls not read yet.
  // Read from `queueHead` on, so taking the next entry is O(1); the read entries are dropped in batches.
  const queue: Settled<Awaited<U>>[] = [];
  let queueHead = 0;
  const running = new Set<Promise<void>>();
  let slots = 0; // calls started and not read yet
  let index = 0;
  let sourceDone = false; // the source completed or rejected, so it must not get `return()`
  let pulling: Promise<void> | undefined;
  let failed = false;
  let failure: unknown;

  const fail = (error: unknown) => {
    if (failed) return;
    [failed, failure] = [true, error];
    controller.abort(error);
  };

  const start = (value: T) => {
    const settled: Settled<Awaited<U>> = { status: "pending" };
    if (ordered) queue.push(settled);
    slots++;
    const settle = (result: Settled<Awaited<U>>) => {
      Object.assign(settled, result);
      running.delete(task);
      if (result.status === "rejected") fail(result.reason);
      if (!ordered) queue.push(settled);
      notify();
    };
    const task: Promise<void> = (async (): Promise<Awaited<U>> => await fn(value, index++, controller.signal))().then(
      (value) => settle({ status: "fulfilled", value }),
      (reason) => settle({ status: "rejected", reason }),
    );
    running.add(task);
  };

  const pull = () => {
    pulling = step(iterator).then(
      (result) => {
        pulling = undefined;
        if (result.done) sourceDone = true;
        // Once stopping (a failure, an abort or an early exit), the item is dropped; the source gets `return()`.
        else if (!controller.signal.aborted) start(result.value);
        notify();
      },
      (error) => {
        pulling = undefined;
        sourceDone = true;
        fail(error);
        notify();
      },
    );
  };

  let error: { reason: unknown } | undefined;
  try {
    for (;;) {
      if (failed) throw failure;
      signal?.throwIfAborted();

      const head = queue[queueHead];
      if (head && head.status === "fulfilled") {
        queue[queueHead++] = undefined!;
        if (queueHead >= 1024 && queueHead * 2 >= queue.length) {
          queue.splice(0, queueHead);
          queueHead = 0;
        }
        slots--;
        yield head.value;
        continue;
      }
      if (sourceDone && slots === 0 && !pulling) return;

      if (!sourceDone && !pulling && slots < concurrency) pull();
      await new Promise<void>((resolve) => (notify = resolve));
    }
  } catch (reason) {
    error = { reason };
    throw reason;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    controller.abort(error?.reason);
    // `return()` must not be called while a `next()` is still in flight.
    await pulling;
    await Promise.all(running);
    if (!sourceDone) await closeAll([iterator], error !== undefined);
  }
}

/** The async iterator of `source`, or its sync iterator adapted to the async protocol. */
function toAsyncIterator<T>(source: Iterable<T> | AsyncIterable<T>, name: string): AsyncIterator<T> {
  if (typeof (source as AsyncIterable<T>)?.[Symbol.asyncIterator] === "function") {
    return (source as AsyncIterable<T>)[Symbol.asyncIterator]();
  }
  if (typeof (source as Iterable<T>)?.[Symbol.iterator] === "function") {
    const iterator = (source as Iterable<T>)[Symbol.iterator]();
    return {
      next: async () => iterator.next(),
      return: async () => iterator.return?.() ?? { done: true, value: undefined },
    };
  }
  throw new TypeError(`${name} source must be an iterable or an async iterable`);
}

/**
 * Yields the items of `source` until `signal` aborts, then rejects with the signal's reason, even while
 * a read of `source` is pending. Use it to stop any async iterable from outside: the async operators
 * here, the native async iterator helpers, a `ReadableStream`, or a generator of your own.
 *
 * On abort, or when the consumer stops early, the source is closed. A `ReadableStream` is cancelled at
 * once with the signal's reason, even with a read pending. Any other source gets `return()`, which takes
 * no reason; if a read was pending, the abort does not wait for it: `return()` is called once that read
 * settles, and a failure while closing it is dropped.
 *
 * With an already aborted `signal`, the first read rejects without opening the source.
 */
export async function* abortable<T>(
  source: Iterable<T> | AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T, void, unknown> {
  signal.throwIfAborted();
  const handle = openSource(source);

  // Rejects the read in progress. Not a `Promise.race` with one long-lived abort promise, which would
  // keep a reaction per item for as long as the signal lives.
  let interrupt: ((reason: unknown) => void) | undefined;
  const onAbort = () => interrupt?.(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });

  type Outcome = { result: Step<T> } | { error: unknown };
  let pending: Promise<Outcome> | undefined; // a read still in flight when the generator stops
  let done = false; // the source completed or rejected, so it must not be closed
  let failure: { error: unknown } | undefined;

  try {
    for (;;) {
      signal.throwIfAborted();
      const read = (pending = handle.read().then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      ));
      const outcome = await new Promise<Outcome>((resolve, reject) => {
        interrupt = reject;
        void read.then(resolve);
      });
      interrupt = pending = undefined;
      if ("error" in outcome) {
        done = true;
        throw outcome.error;
      }
      if (outcome.result.done) {
        done = true;
        return;
      }
      yield outcome.result.value;
    }
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    const reason = signal.aborted ? signal.reason : failure?.error;
    if (done) {
      // Nothing to close.
    } else if (pending && handle.closesDuringRead) {
      // Cancelling settles the pending read; the abort does not wait for the source's cleanup.
      void handle.close(reason).catch(() => {});
    } else if (pending) {
      // `return()` must not be called while a `next()` is in flight, and the abort must not wait for it.
      void pending.then((outcome) => {
        if ("result" in outcome && !outcome.result.done) return handle.close(reason).catch(() => {});
      });
    } else {
      // An error from closing only propagates when there is none in flight already.
      await handle.close(reason).catch((error: unknown) => {
        if (!failure) throw error;
      });
    }
  }
}

type Step<T> = { done: true } | { done: false; value: T };

/** How `abortable` reads and closes its source. */
interface SourceHandle<T> {
  read(): Promise<Step<T>>;
  close(reason: unknown): Promise<unknown>;
  /** Whether `close` may be called while a `read` is pending. */
  closesDuringRead: boolean;
}

function openSource<T>(source: Iterable<T> | AsyncIterable<T>): SourceHandle<T> {
  if (source instanceof ReadableStream) {
    const reader = (source as ReadableStream<T>).getReader();
    return {
      read: () => reader.read() as Promise<Step<T>>,
      async close(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
      closesDuringRead: true,
    };
  }
  const iterator = toAsyncIterator(source, "abortable");
  return {
    read: () => step(iterator),
    close: async () => iterator.return?.(),
    closesDuringRead: false,
  };
}
