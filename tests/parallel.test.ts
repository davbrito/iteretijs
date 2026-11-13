import { describe, expect, it } from "vitest";
import { parallel, toArray } from "../src/async.ts";
import { asyncExits, trackedAsyncIterable, trackedIterable, trackedReadableStream } from "./utils.ts";

/** A promise the test settles by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => ([resolve, reject] = [res, rej]));
  return { promise, resolve, reject };
}

/** Lets every pending microtask and macrotask run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * An `fn` whose calls the test settles by hand, recording which are running. With `followSignal`, a call
 * rejects when its signal aborts.
 */
function manualFn<T>({ followSignal = false } = {}) {
  const calls = new Map<T, ReturnType<typeof deferred<string>>>();
  const signals: AbortSignal[] = [];
  const fn = (value: T, _index: number, signal: AbortSignal) => {
    const d = deferred<string>();
    calls.set(value, d);
    signals.push(signal);
    if (followSignal) signal.addEventListener("abort", () => d.reject(signal.reason));
    return d.promise;
  };
  return { fn, calls, signals, started: () => [...calls.keys()] };
}

describe("parallel", () => {
  it("maps every item, in order by default", async () => {
    const out = await toArray(
      parallel([30, 10, 20], (ms) => new Promise((r) => setTimeout(r, ms, ms * 2)), { concurrency: 3 }),
    );
    expect(out).toEqual([60, 20, 40]);
  });

  it("yields in completion order with ordered: false", async () => {
    const out = await toArray(
      parallel([30, 10, 20], (ms) => new Promise((r) => setTimeout(r, ms, ms)), { concurrency: 3, ordered: false }),
    );
    expect(out).toEqual([10, 20, 30]);
  });

  it("takes sync iterables, async iterables and streams", async () => {
    const double = (x: number) => x * 2;
    expect(await toArray(parallel(trackedIterable(0, 3), double, { concurrency: 2 }))).toEqual([0, 2, 4]);
    expect(await toArray(parallel(trackedAsyncIterable(0, 3), double, { concurrency: 2 }))).toEqual([0, 2, 4]);
    expect(await toArray(parallel(trackedReadableStream(0, 3), double, { concurrency: 2 }))).toEqual([0, 2, 4]);
  });

  it("passes the index to fn", async () => {
    expect(await toArray(parallel(["a", "b"], (x, i) => `${i}${x}`, { concurrency: 2 }))).toEqual(["0a", "1b"]);
  });

  it("never runs more than concurrency calls", async () => {
    let active = 0;
    let max = 0;
    const out = await toArray(
      parallel(
        Array.from({ length: 20 }, (_, i) => i),
        async (x) => {
          max = Math.max(max, ++active);
          await new Promise((r) => setTimeout(r, (x * 7) % 5));
          active--;
          return x;
        },
        { concurrency: 4, ordered: false },
      ),
    );
    expect(max).toBe(4);
    expect(out.sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("starts a new call as soon as a slot is free", async () => {
    const { fn, calls, started } = manualFn<number>({ followSignal: true });
    const it = parallel([1, 2, 3, 4], fn, { concurrency: 2, ordered: false });
    const first = it.next();
    await tick();
    expect(started()).toEqual([1, 2]);
    calls.get(2)!.resolve("two");
    expect(await first).toEqual({ done: false, value: "two" });
    const second = it.next();
    await tick();
    expect(started()).toEqual([1, 2, 3]);
    calls.get(1)!.resolve("one");
    expect(await second).toEqual({ done: false, value: "one" });
    await it.return();
  });

  it("counts a result not read yet against the limit", async () => {
    const { fn, calls, started } = manualFn<number>();
    const it = parallel([1, 2, 3], fn, { concurrency: 2 });
    const first = it.next();
    await tick();
    calls.get(2)!.resolve("two"); // ready, but waits for 1
    await tick();
    expect(started()).toEqual([1, 2]);
    calls.get(1)!.resolve("one");
    expect(await first).toEqual({ done: false, value: "one" });
    expect(await it.next()).toEqual({ done: false, value: "two" });
    await it.return();
  });

  it("never calls the source's next() concurrently", async () => {
    let inFlight = 0;
    let overlapped = false;
    let i = 0;
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (inFlight++) overlapped = true;
          await tick();
          inFlight--;
          return i < 5 ? { done: false, value: i++ } : { done: true, value: undefined };
        },
      }),
    };
    const out = await toArray(parallel(source, (x) => x, { concurrency: 3 }));
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(overlapped).toBe(false);
  });

  it("rejects with the first failing call, aborts the others, waits for them and closes the source", async () => {
    const source = trackedAsyncIterable(0, 10);
    const { fn, calls, signals } = manualFn<number>();
    const it = parallel(source, fn, { concurrency: 3 });
    const first = it.next();
    await tick();
    const failure = new Error("call failed");
    calls.get(1)!.reject(failure);
    let settled = false;
    first.catch(() => {}).finally(() => (settled = true));
    await tick();
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(signals[0].reason).toBe(failure);
    expect(settled).toBe(false); // calls 0 and 2 are still running
    calls.get(0)!.resolve("zero");
    calls.get(2)!.reject(new Error("aborted"));
    await expect(first).rejects.toBe(failure);
    expect(source.returns).toBe(1);
    expect(calls.size).toBe(3);
    expect(await it.next()).toEqual({ done: true, value: undefined });
  });

  it("rejects when fn throws synchronously", async () => {
    const failure = new Error("sync");
    const out = parallel(
      [1],
      () => {
        throw failure;
      },
      { concurrency: 1 },
    );
    await expect(out.next()).rejects.toBe(failure);
  });

  it("rejects when the source rejects, without closing it", async () => {
    const failure = new Error("source");
    const source = trackedAsyncIterable(0, 10, { failOn: 2, error: failure });
    await expect(toArray(parallel(source, (x) => x, { concurrency: 2 }))).rejects.toBe(failure);
    expect(source.returns).toBe(0);
  });

  it("does not hide a call's error behind one from return()", async () => {
    const failure = new Error("call");
    const source = trackedAsyncIterable(0, 10, { returnError: new Error("return") });
    await expect(toArray(parallel(source, () => Promise.reject(failure), { concurrency: 2 }))).rejects.toBe(failure);
    expect(source.returns).toBe(1);
  });

  describe.each(Object.entries(asyncExits))("on early exit (%s)", (_, exit) => {
    it("aborts the running calls, waits for them and closes the source", async () => {
      const source = trackedAsyncIterable(0, 10);
      const signals: AbortSignal[] = [];
      let running = 0;
      await exit(
        parallel(
          source,
          (x, _i, signal) => {
            signals.push(signal);
            running++;
            if (x === 0) return x;
            return new Promise((_, reject) =>
              signal.addEventListener("abort", () => {
                running--;
                reject(signal.reason);
              }),
            );
          },
          { concurrency: 3 },
        ),
      );
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].aborted).toBe(true);
      expect(signals[0].reason).toBeInstanceOf(DOMException);
      expect(running).toBe(1); // only the call that resolved by itself
      expect(source.returns).toBe(1);
    });
  });

  it("closes a sync source on early exit", async () => {
    const source = trackedIterable(0, 10);
    await asyncExits.break(parallel(source, (x) => x, { concurrency: 2 }));
    expect(source.returns).toBe(1);
  });

  it("cancels a stream source on early exit", async () => {
    const source = trackedReadableStream(0, 10);
    await asyncExits.break(parallel(source, (x) => x, { concurrency: 2 }));
    expect(source.cancels).toHaveLength(1);
  });

  it("does not close a source that completed", async () => {
    const source = trackedAsyncIterable(0, 3);
    await toArray(parallel(source, (x) => x, { concurrency: 2 }));
    expect(source.completed).toBe(true);
    expect(source.returns).toBe(0);
  });

  it("rejects with the signal's reason when it aborts, aborting the calls", async () => {
    const controller = new AbortController();
    const source = trackedAsyncIterable(0, 10);
    const { fn, signals } = manualFn<number>();
    const it = parallel(source, fn, { concurrency: 2, signal: controller.signal });
    const first = it.next();
    await tick();
    const reason = new Error("stop");
    controller.abort(reason);
    await tick();
    expect(signals.map((s) => s.reason)).toEqual([reason, reason]);
    // The calls ignore the signal, so parallel is still waiting for them.
    let settled = false;
    first.catch(() => {}).finally(() => (settled = true));
    await tick();
    expect(settled).toBe(false);
  });

  it("settles once the calls follow the signal", async () => {
    const controller = new AbortController();
    const source = trackedAsyncIterable(0, 10);
    const it = parallel(
      source,
      (_x, _i, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
      { concurrency: 2, signal: controller.signal },
    );
    const first = it.next();
    await tick();
    controller.abort("stop");
    await expect(first).rejects.toBe("stop");
    expect(source.returns).toBe(1);
  });

  it("does not open the source when the signal is already aborted", async () => {
    const source = trackedAsyncIterable(0, 3);
    const out = parallel(source, (x) => x, { concurrency: 1, signal: AbortSignal.abort("early") });
    await expect(out.next()).rejects.toBe("early");
    expect(source.returns).toBe(0);
    expect(source.completed).toBe(false);
  });

  it("is lazy: does not call fn before the first read", async () => {
    let calls = 0;
    parallel([1, 2], () => calls++, { concurrency: 2 });
    await tick();
    expect(calls).toBe(0);
  });

  it("works with concurrency: Infinity", async () => {
    const { fn, calls, started } = manualFn<number>({ followSignal: true });
    const it = parallel([1, 2, 3, 4, 5], fn, { concurrency: Infinity, ordered: false });
    const first = it.next();
    await tick();
    expect(started()).toEqual([1, 2, 3, 4, 5]);
    calls.get(3)!.resolve("three");
    expect(await first).toEqual({ done: false, value: "three" });
    await it.return();
  });

  it("yields nothing for an empty source", async () => {
    expect(await toArray(parallel([], (x) => x, { concurrency: 1 }))).toEqual([]);
  });

  it.each([0, -1, 1.5, NaN, "2" as unknown as number])("throws a RangeError for concurrency %s", (concurrency) => {
    expect(() => parallel([1], (x) => x, { concurrency })).toThrow(RangeError);
  });

  it("throws a TypeError when fn is not a function", () => {
    expect(() => parallel([1], null as never, { concurrency: 1 })).toThrow(TypeError);
  });

  it("rejects when the source is not iterable", async () => {
    await expect(parallel(42 as never, (x) => x, { concurrency: 1 }).next()).rejects.toThrow(TypeError);
  });
});
