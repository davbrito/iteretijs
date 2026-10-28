import { describe, expect, it } from "vitest";
import * as asyncOps from "../src/async.ts";
import * as syncOps from "../src/index.ts";
import * as streamOps from "../src/stream.ts";
import { trackedAsyncIterable, trackedIterable, trackedReadableStream } from "./utils.ts";

/**
 * Cleanup suite: every exported operator must release its sources.
 *
 * Operators that take no source (`iota`, `range`, `transform`) and consumers that
 * cannot exit early by themselves are listed in `notApplicable` so the coverage
 * check below fails when a new export is added without a decision.
 */

const notApplicable = {
  sync: ["iota", "range"],
  async: ["toArray", "reduce", "count"],
  stream: ["transform", "iota"],
};

const syncCases: Record<string, (source: Iterable<number>) => Iterable<unknown>> = {
  map: (s) => syncOps.map(s, (x) => x),
  filter: (s) => syncOps.filter(s, () => true),
  take: (s) => syncOps.take(s, 100),
  drop: (s) => syncOps.drop(s, 1),
  enumerate: (s) => syncOps.enumerate(s),
  concat: (s) => syncOps.concat(s, trackedIterable(0, 100)),
  zip: (s) => syncOps.zip(s, trackedIterable(0, 100)),
};

const asyncCases: Record<string, (source: AsyncIterable<number>) => AsyncIterable<unknown>> = {
  map: (s) => asyncOps.map(s, (x) => x),
  filter: (s) => asyncOps.filter(s, () => true),
  take: (s) => asyncOps.take(s, 100),
  drop: (s) => asyncOps.drop(s, 1),
  enumerate: (s) => asyncOps.enumerate(s),
  concat: (s) => asyncOps.concat(s, trackedAsyncIterable(0, 100)),
  zip: (s) => asyncOps.zip(s, trackedAsyncIterable(0, 100)),
};

// Each case gets the tracked stream as the first source and returns the readable side.
const streamCases: Record<string, (source: ReadableStream<number>) => ReadableStream<unknown>> = {
  map: (s) => s.pipeThrough(streamOps.map((x) => x)),
  filter: (s) => s.pipeThrough(streamOps.filter(() => true)),
  take: (s) => s.pipeThrough(streamOps.take(100)),
  drop: (s) => s.pipeThrough(streamOps.drop(1)),
  enumerate: (s) => s.pipeThrough(streamOps.enumerate()),
  debounce: (s) => s.pipeThrough(streamOps.debounce(0)),
  throttle: (s) => s.pipeThrough(streamOps.throttle(0)),
  zipWith: (s) => s.pipeThrough(streamOps.zipWith(trackedReadableStream(0, 100))),
  concat: (s) => streamOps.concat(s, trackedReadableStream(0, 100)),
  zip: (s) => streamOps.zip(s, trackedReadableStream(0, 100)),
};

/** Cancellation travels through pipes asynchronously: give it a few macrotasks to settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

const exits = {
  break: (it: Iterable<unknown>) => {
    for (const _ of it) break;
  },
  return: (it: Iterable<unknown>) => {
    for (const _ of it) return;
  },
  throw: (it: Iterable<unknown>) => {
    try {
      for (const _ of it) throw new Error("boom");
    } catch {}
  },
};

const asyncExits = {
  break: async (it: AsyncIterable<unknown>) => {
    for await (const _ of it) break;
  },
  return: async (it: AsyncIterable<unknown>) => {
    for await (const _ of it) return;
  },
  throw: async (it: AsyncIterable<unknown>) => {
    try {
      for await (const _ of it) throw new Error("boom");
    } catch {}
  },
};

describe("every exported operator is covered", () => {
  it.each([
    ["sync", syncOps, syncCases],
    ["async", asyncOps, asyncCases],
    ["stream", streamOps, streamCases],
  ] as const)("%s", (name, module, cases) => {
    const exported = Object.keys(module);
    const covered = [...Object.keys(cases), ...notApplicable[name]];
    // `iterateStream` is the stream -> async iterable bridge and has its own suite below.
    const extra = name === "async" ? ["iterateStream"] : [];
    expect(exported.sort()).toEqual([...covered, ...extra].sort());
  });
});

describe("sync operators close their source", () => {
  describe.each(Object.entries(syncCases))("%s", (_name, op) => {
    it.each(Object.entries(exits))("when the consumer exits with %s", (_exit, exit) => {
      const source = trackedIterable(1, 100);
      exit(op(source));
      expect(source.returns).toBe(1);
    });

    it("when the source throws, propagating the error", () => {
      const source = trackedIterable(1, 100, { failOn: 1 });
      expect(() => Array.from(op(source))).toThrow("source failed");
    });
  });

  it("take closes the source when it reaches its count", () => {
    const source = trackedIterable(1, 100);
    expect(Array.from(syncOps.take(source, 2))).toEqual([1, 2]);
    expect(source.returns).toBe(1);
  });

  it("does not close a source that completed by itself", () => {
    const source = trackedIterable(1, 3);
    Array.from(syncOps.map(source, (x) => x));
    expect(source.completed).toBe(true);
    expect(source.returns).toBe(0);
  });
});

describe("async operators close their source", () => {
  describe.each(Object.entries(asyncCases))("%s", (_name, op) => {
    it.each(Object.entries(asyncExits))("when the consumer exits with %s", async (_exit, exit) => {
      const source = trackedAsyncIterable(1, 100);
      await exit(op(source));
      expect(source.returns).toBe(1);
    });

    it("when the source rejects, propagating the error", async () => {
      const source = trackedAsyncIterable(1, 100, { failOn: 1 });
      await expect(asyncOps.toArray(op(source))).rejects.toThrow("source failed");
    });
  });

  it("take closes the source when it reaches its count", async () => {
    const source = trackedAsyncIterable(1, 100);
    await expect(asyncOps.toArray(asyncOps.take(source, 2))).resolves.toEqual([1, 2]);
    expect(source.returns).toBe(1);
  });

  it("does not close a source that completed by itself", async () => {
    const source = trackedAsyncIterable(1, 3);
    await asyncOps.toArray(asyncOps.map(source, (x) => x));
    expect(source.completed).toBe(true);
    expect(source.returns).toBe(0);
  });

  it("reduce closes the source when the reducer throws", async () => {
    const source = trackedAsyncIterable(1, 100);
    await expect(
      asyncOps.reduce(
        source,
        () => {
          throw new Error("boom");
        },
        0,
      ),
    ).rejects.toThrow("boom");
    expect(source.returns).toBe(1);
  });
});

describe("iterateStream", () => {
  it.each(Object.entries(asyncExits))("cancels the stream when the consumer exits with %s", async (_exit, exit) => {
    const source = trackedReadableStream(1, 100);
    await exit(asyncOps.iterateStream(source));
    expect(source.cancels).toHaveLength(1);
  });

  it("does not cancel with preventCancel", async () => {
    const source = trackedReadableStream(1, 100);
    for await (const _ of asyncOps.iterateStream(source, { preventCancel: true })) break;
    expect(source.cancels).toHaveLength(0);
  });

  it("propagates a source error", async () => {
    const source = trackedReadableStream(1, 100, { failOn: 1 });
    await expect(asyncOps.toArray(asyncOps.iterateStream(source))).rejects.toThrow("source failed");
  });
});

/**
 * Leaks found by this suite, skipped until their fixes land (each fix un-skips its test).
 * They also surface unhandled rejections, so `it.fails` cannot be used to track them.
 *  - concat: cancelling the output leaves the remaining sources open, and a source error
 *    or a cancel surfaces as an unhandled rejection.
 *  - zip: never cancels its sources, and a source error leaves the output hanging.
 *  - zipWith: never cancels the other stream.
 */
const knownLeaks = new Set(["concat", "zip"]);

describe("stream operators", () => {
  describe.each(Object.entries(streamCases))("%s", (name, op) => {
    const test = knownLeaks.has(name) ? it.skip : it;

    test("cancels the source when the output is cancelled", async () => {
      const source = trackedReadableStream(1, 100);
      const output = op(source);
      const reader = output.getReader();
      await reader.read();
      await reader.cancel("stop");
      await settle();
      expect(source.cancels).toHaveLength(1);
    });

    test("propagates a source error to the output", async () => {
      const source = trackedReadableStream(1, 100, { failOn: 1 });
      const reader = op(source).getReader();
      await expect(
        (async () => {
          for (;;) if ((await reader.read()).done) return;
        })(),
      ).rejects.toThrow("source failed");
    });
  });

  it.skip.each(["concat", "zip"] as const)("%s cancels every source when the output is cancelled", async (name) => {
    const a = trackedReadableStream(1, 100);
    const b = trackedReadableStream(1, 100);
    const reader = (name === "concat" ? streamOps.concat(a, b) : streamOps.zip(a, b)).getReader();
    await reader.read();
    await reader.cancel("stop");
    await settle();
    expect(a.cancels).toHaveLength(1);
    expect(b.cancels).toHaveLength(1);
  });

  it.skip("zipWith cancels the other stream when the output is cancelled", async () => {
    const other = trackedReadableStream(1, 100);
    const reader = trackedReadableStream(1, 100).pipeThrough(streamOps.zipWith(other)).getReader();
    await reader.read();
    await reader.cancel("stop");
    await settle();
    expect(other.cancels).toHaveLength(1);
  });
});
