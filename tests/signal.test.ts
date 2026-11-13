import { describe, expect, it, vi } from "vitest";
import { abortable, enumerate as asyncEnumerate, parallel, toArray } from "../src/async.ts";
import { enumerate } from "../src/index.ts";
import { concat, fromEvents, iota, merge, zip } from "../src/stream.ts";
import { deferred, tick, trackedAsyncIterable, trackedIterable, trackedReadableStream } from "./utils.ts";

/** A stream that never produces a chunk, recording the reasons it is cancelled with. */
function silent<T = number>() {
  const cancels: unknown[] = [];
  const stream = new ReadableStream<T>({
    cancel(reason) {
      cancels.push(reason);
    },
  });
  return Object.assign(stream, { cancels });
}

/** A signal that counts its `abort` listeners. */
function countedSignal() {
  const controller = new AbortController();
  const { signal } = controller;
  const add = vi.spyOn(signal, "addEventListener");
  const remove = vi.spyOn(signal, "removeEventListener");
  return {
    controller,
    signal,
    listeners: () => add.mock.calls.length - remove.mock.calls.length,
  };
}

/** The stream sources that take a `signal`, each built over two sources where it has any. */
const sources: Record<
  string,
  (streams: [ReadableStream<number>, ReadableStream<number>], signal: AbortSignal) => ReadableStream<unknown>
> = {
  concat: (streams, signal) => concat(streams, { signal }),
  zip: ([a, b], signal) => zip(a, b, { signal }),
  merge: (streams, signal) => merge(streams, { signal }),
};

describe.each(Object.entries(sources))("%s with a signal", (_name, build) => {
  it("errors at once and cancels the sources when the signal is already aborted", async () => {
    const a = silent();
    const b = silent();
    const reason = new Error("early");
    const reader = build([a, b], AbortSignal.abort(reason)).getReader();
    await expect(reader.read()).rejects.toBe(reason);
    await tick();
    expect([...a.cancels, ...b.cancels]).toEqual([reason, reason]);
  });

  it("rejects a pending read and cancels the sources when the signal aborts", async () => {
    const a = silent();
    const b = silent();
    const { controller, signal, listeners } = countedSignal();
    const reader = build([a, b], signal).getReader();
    const read = reader.read();
    await tick();
    const reason = new Error("stop");
    controller.abort(reason);
    await expect(read).rejects.toBe(reason);
    await tick();
    expect([...a.cancels, ...b.cancels]).toEqual([reason, reason]);
    expect(listeners()).toBe(0);
  });

  it("does nothing when the signal aborts after the stream closed", async () => {
    const { controller, signal, listeners } = countedSignal();
    const a = trackedReadableStream(0, 2);
    const b = trackedReadableStream(10, 12);
    const reader = build([a, b], signal).getReader();
    const out: unknown[] = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) out.push(r.value);
    expect(out.length).toBeGreaterThan(0);
    expect(listeners()).toBe(0);
    const cancels = [...a.cancels, ...b.cancels];
    controller.abort("late");
    await tick();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    await expect(reader.closed).resolves.toBeUndefined();
    expect([...a.cancels, ...b.cancels]).toEqual(cancels);
  });

  it("removes the listener when the output is cancelled", async () => {
    const a = silent();
    const b = silent();
    const { signal, listeners } = countedSignal();
    await build([a, b], signal).cancel("done");
    expect(listeners()).toBe(0);
    expect([...a.cancels, ...b.cancels]).toEqual(["done", "done"]);
  });

  it("removes the listener when a source errors", async () => {
    const failure = new Error("source failed");
    const { signal, listeners } = countedSignal();
    const out = build([trackedReadableStream(0, 5, { failOn: 0, error: failure }), silent()], signal);
    await expect(toArray(out)).rejects.toBe(failure);
    expect(listeners()).toBe(0);
  });
});

describe("iota with a signal", () => {
  it("errors when the signal is already aborted", async () => {
    await expect(
      iota(3, { signal: AbortSignal.abort("early") })
        .getReader()
        .read(),
    ).rejects.toBe("early");
  });

  it("errors a pending read when the signal aborts", async () => {
    const controller = new AbortController();
    const reader = iota(Infinity, { signal: controller.signal }).getReader();
    expect(await reader.read()).toEqual({ done: false, value: 0 });
    const read = reader.read();
    controller.abort("stop");
    await expect(read).rejects.toBe("stop");
  });

  it("does nothing when the signal aborts after it closed", async () => {
    const { controller, signal, listeners } = countedSignal();
    expect(await toArray(iota(2, { signal }))).toEqual([0, 1]);
    expect(listeners()).toBe(0);
    controller.abort();
  });
});

describe("concat after an abort", () => {
  it("does not open the streams it had not reached", async () => {
    const first = silent();
    const rest = [trackedReadableStream(0, 2), trackedReadableStream(0, 2)];
    const controller = new AbortController();
    const reader = concat([first, ...rest], { signal: controller.signal }).getReader();
    const read = reader.read();
    await tick();
    controller.abort("stop");
    await expect(read).rejects.toBe("stop");
    await tick();
    expect([first, ...rest].map((stream) => stream.locked)).toEqual([false, false, false]);
    expect(rest.map((stream) => stream.cancels)).toEqual([["stop"], ["stop"]]);
  });
});

describe("abort after completion", () => {
  it("parallel removes its listener once it finished", async () => {
    const { controller, signal, listeners } = countedSignal();
    expect(await toArray(parallel([1, 2], (x) => x, { concurrency: 2, signal }))).toEqual([1, 2]);
    expect(listeners()).toBe(0);
    controller.abort();
  });

  it("fromEvents removes its listener once cancelled", async () => {
    const { controller, signal, listeners } = countedSignal();
    await fromEvents(new EventTarget(), "ping", { signal }).cancel();
    expect(listeners()).toBe(0);
    controller.abort();
  });
});

describe("abortable", () => {
  it("yields every item when the signal never aborts", async () => {
    const source = trackedAsyncIterable(0, 3);
    expect(await toArray(abortable(source, new AbortController().signal))).toEqual([0, 1, 2]);
    expect(source.returns).toBe(0);
  });

  it("takes sync iterables and streams", async () => {
    const { signal } = new AbortController();
    expect(await toArray(abortable(trackedIterable(0, 2), signal))).toEqual([0, 1]);
    expect(await toArray(abortable(trackedReadableStream(0, 2), signal))).toEqual([0, 1]);
  });

  it("rejects without opening the source when the signal is already aborted", async () => {
    const open = vi.fn();
    const source = { [Symbol.asyncIterator]: open } as unknown as AsyncIterable<number>;
    await expect(abortable(source, AbortSignal.abort("early")).next()).rejects.toBe("early");
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects a pending read at once, and closes the source once that read settles", async () => {
    const read = deferred<IteratorResult<number>>();
    const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({ next: () => read.promise, return: returned }),
    };
    const { controller, signal, listeners } = countedSignal();
    const it = abortable(source, signal);
    const next = it.next();
    await tick();
    controller.abort("stop");
    await expect(next).rejects.toBe("stop");
    expect(listeners()).toBe(0);
    expect(returned).not.toHaveBeenCalled(); // its next() is still in flight
    read.resolve({ done: false, value: 1 });
    await tick();
    expect(returned).toHaveBeenCalledTimes(1);
  });

  it("does not close a source whose pending read ends it", async () => {
    const read = deferred<IteratorResult<number>>();
    const returned = vi.fn();
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({ next: () => read.promise, return: returned }),
    };
    const controller = new AbortController();
    const next = abortable(source, controller.signal).next();
    await tick();
    controller.abort("stop");
    await expect(next).rejects.toBe("stop");
    read.resolve({ done: true, value: undefined });
    await tick();
    expect(returned).not.toHaveBeenCalled();
  });

  it("rejects the next read and closes the source when the signal aborts between reads", async () => {
    const source = trackedAsyncIterable(0, 10);
    const controller = new AbortController();
    const it = abortable(source, controller.signal);
    expect(await it.next()).toEqual({ done: false, value: 0 });
    controller.abort("stop");
    await expect(it.next()).rejects.toBe("stop");
    expect(source.returns).toBe(1);
  });

  it("does nothing when the signal aborts after completion", async () => {
    const { controller, signal, listeners } = countedSignal();
    const source = trackedAsyncIterable(0, 2);
    expect(await toArray(abortable(source, signal))).toEqual([0, 1]);
    expect(listeners()).toBe(0);
    controller.abort();
    expect(source.returns).toBe(0);
  });

  it("propagates a source error without closing it", async () => {
    const failure = new Error("source failed");
    const source = trackedAsyncIterable(0, 5, { failOn: 1, error: failure });
    const { signal, listeners } = countedSignal();
    await expect(toArray(abortable(source, signal))).rejects.toBe(failure);
    expect(source.returns).toBe(0);
    expect(listeners()).toBe(0);
  });

  it("closes the source and removes the listener when the consumer exits early", async () => {
    const source = trackedAsyncIterable(0, 5);
    const { signal, listeners } = countedSignal();
    for await (const _ of abortable(source, signal)) break;
    expect(source.returns).toBe(1);
    expect(listeners()).toBe(0);
  });

  it("cancels a stream source with the reason when the signal aborts between reads", async () => {
    const source = trackedReadableStream(0, 5);
    const controller = new AbortController();
    const it = abortable(source, controller.signal);
    await it.next();
    controller.abort("stop");
    await expect(it.next()).rejects.toBe("stop");
    expect(source.cancels).toEqual(["stop"]);
    expect(source.locked).toBe(false);
  });

  it("cancels a stream source at once when the signal aborts during a read that never settles", async () => {
    const source = silent();
    const controller = new AbortController();
    const next = abortable(source, controller.signal).next();
    await tick();
    controller.abort("stop");
    await expect(next).rejects.toBe("stop");
    await tick();
    expect(source.cancels).toEqual(["stop"]);
    expect(source.locked).toBe(false);
  });

  it("cancels a stream source when the consumer exits early", async () => {
    const source = trackedReadableStream(0, 5);
    for await (const _ of abortable(source, new AbortController().signal)) break;
    expect(source.cancels).toHaveLength(1);
    expect(source.locked).toBe(false);
  });

  it("rejects when the source is not iterable", async () => {
    await expect(abortable(42 as never, new AbortController().signal).next()).rejects.toThrow(TypeError);
  });
});

describe("using and await using", () => {
  it("closes the source of a sync operator at the end of the block", () => {
    const source = trackedIterable(0, 5);
    {
      using it = enumerate(source);
      it.next();
    }
    expect(source.returns).toBe(1);
  });

  it.each([
    ["enumerate", (source: AsyncIterable<number>) => asyncEnumerate(source)],
    ["parallel", (source: AsyncIterable<number>) => parallel(source, (x) => x, { concurrency: 2 })],
    ["abortable", (source: AsyncIterable<number>) => abortable(source, new AbortController().signal)],
  ])("closes the source of async %s at the end of the block", async (_name, build) => {
    const source = trackedAsyncIterable(0, 5);
    {
      await using it = build(source);
      await it.next();
    }
    expect(source.returns).toBe(1);
  });

  it("cancels a stream through its async iterator", async () => {
    const a = trackedReadableStream(0, 5);
    const b = trackedReadableStream(10, 15);
    {
      await using it = merge([a, b]).values();
      await it.next();
    }
    expect([...a.cancels, ...b.cancels]).toHaveLength(2);
  });
});
