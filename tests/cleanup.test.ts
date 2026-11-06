import { describe, expect, it, vi } from "vitest";
import * as asyncOps from "../src/async.ts";
import * as syncOps from "../src/index.ts";
import * as streamOps from "../src/stream.ts";
import { asyncExits, exits, trackedAsyncIterable, trackedIterable, trackedReadableStream } from "./utils.ts";

/**
 * Cleanup suite: every exported operator must release its sources.
 *
 * Operators that take no source (`iota`, `range`, `transform`) and consumers that drain the
 * whole iterable and cannot exit early by themselves (`toArray`, `count`) are listed in
 * `notApplicable`, so the coverage check below fails when a new export is added without a
 * decision. `reduce` and `iterateStream` have their own suites further down.
 */

const notApplicable = {
  sync: ["iota", "range"],
  async: ["toArray", "count"],
  stream: ["transform", "iota", "lines", "ndjson", "sse"], // the parsers are covered in parsers.test.ts
};

/**
 * A case builds the operator over `sources` and says how many times `return()` each source
 * must have received once the consumer exits after the first item (`returns`). Sources that
 * the operator never opened, like the second one of `concat`, must not be closed.
 */
interface Case<S> {
  build: (sources: S[]) => Iterable<unknown>;
  returns: number[];
}
interface AsyncCase<S> {
  build: (sources: S[]) => AsyncIterable<unknown>;
  returns: number[];
}

const syncCases: Record<string, Case<Iterable<number>>> = {
  map: { build: ([a]) => syncOps.map(a, (x) => x), returns: [1] },
  filter: { build: ([a]) => syncOps.filter(a, () => true), returns: [1] },
  take: { build: ([a]) => syncOps.take(a, 100), returns: [1] },
  drop: { build: ([a]) => syncOps.drop(a, 1), returns: [1] },
  enumerate: { build: ([a]) => syncOps.enumerate(a), returns: [1] },
  concat: { build: ([a, b]) => syncOps.concat(a, b), returns: [1, 0] },
  zip: { build: ([a, b]) => syncOps.zip(a, b), returns: [1, 1] },
};

const asyncCases: Record<string, AsyncCase<AsyncIterable<number>>> = {
  map: { build: ([a]) => asyncOps.map(a, (x) => x), returns: [1] },
  filter: { build: ([a]) => asyncOps.filter(a, () => true), returns: [1] },
  take: { build: ([a]) => asyncOps.take(a, 100), returns: [1] },
  drop: { build: ([a]) => asyncOps.drop(a, 1), returns: [1] },
  enumerate: { build: ([a]) => asyncOps.enumerate(a), returns: [1] },
  concat: { build: ([a, b]) => asyncOps.concat(a, b), returns: [1, 0] },
  zip: { build: ([a, b]) => asyncOps.zip(a, b), returns: [1, 1] },
};

// Each case gets the tracked stream as the first source and returns the readable side.
const streamCases: Record<string, (source: ReadableStream<number>) => ReadableStream<unknown>> = {
  map: (s) => s.pipeThrough(streamOps.map((x) => x)),
  filter: (s) => s.pipeThrough(streamOps.filter(() => true)),
  take: (s) => s.pipeThrough(streamOps.take(100)),
  drop: (s) => s.pipeThrough(streamOps.drop(1)),
  batch: (s) => s.pipeThrough(streamOps.batch(2)),
  enumerate: (s) => s.pipeThrough(streamOps.enumerate()),
  debounce: (s) => s.pipeThrough(streamOps.debounce(0)),
  throttle: (s) => s.pipeThrough(streamOps.throttle(0)),
  zipWith: (s) => s.pipeThrough(streamOps.zipWith(trackedReadableStream(0, 100))),
  concat: (s) => streamOps.concat(s, trackedReadableStream(0, 100)),
  zip: (s) => streamOps.zip(s, trackedReadableStream(0, 100)),
  merge: (s) => streamOps.merge(s, trackedReadableStream(0, 100)),
};

describe("every exported operator is covered", () => {
  it.each([
    ["sync", syncOps, syncCases],
    ["async", asyncOps, asyncCases],
    ["stream", streamOps, streamCases],
  ] as const)("%s", (name, module, cases) => {
    const exported = Object.keys(module);
    const covered = [...Object.keys(cases), ...notApplicable[name]];
    // `iterateStream` (the stream -> async iterable bridge) and `reduce` have their own suites below.
    const extra = name === "async" ? ["iterateStream", "reduce"] : [];
    expect(exported.sort()).toEqual([...covered, ...extra].sort());
  });
});

describe("sync operators close their source", () => {
  describe.each(Object.entries(syncCases))("%s", (_name, { build, returns }) => {
    it.each(Object.entries(exits))("when the consumer exits with %s", (_exit, exit) => {
      const sources = returns.map(() => trackedIterable(1, 100));
      exit(build(sources));
      expect(sources.map((source) => source.returns)).toEqual(returns);
    });

    it("when the source throws, propagating the error", () => {
      const sources = returns.map((_, i) => trackedIterable(1, 100, { failOn: i === 0 ? 1 : undefined }));
      expect(() => Array.from(build(sources))).toThrow("source failed");
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
  describe.each(Object.entries(asyncCases))("%s", (_name, { build, returns }) => {
    it.each(Object.entries(asyncExits))("when the consumer exits with %s", async (_exit, exit) => {
      const sources = returns.map(() => trackedAsyncIterable(1, 100));
      await exit(build(sources));
      expect(sources.map((source) => source.returns)).toEqual(returns);
    });

    it("when the source rejects, propagating the error", async () => {
      const sources = returns.map((_, i) => trackedAsyncIterable(1, 100, { failOn: i === 0 ? 1 : undefined }));
      await expect(asyncOps.toArray(build(sources))).rejects.toThrow("source failed");
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

describe("stream operators", () => {
  describe.each(Object.entries(streamCases))("%s", (_name, op) => {
    it("cancels the source when the output is cancelled", async () => {
      const source = trackedReadableStream(1, 100);
      const output = op(source);
      const reader = output.getReader();
      await reader.read();
      await reader.cancel("stop");
      await vi.waitFor(() => expect(source.cancels).toHaveLength(1));
    });

    it("propagates a source error to the output", async () => {
      const source = trackedReadableStream(1, 100, { failOn: 1 });
      const reader = op(source).getReader();
      await expect(
        (async () => {
          for (;;) if ((await reader.read()).done) return;
        })(),
      ).rejects.toThrow("source failed");
    });
  });

  it.each(["concat", "zip", "merge"] as const)("%s cancels every source when the output is cancelled", async (name) => {
    const a = trackedReadableStream(1, 100);
    const b = trackedReadableStream(1, 100);
    const combine: (a: ReadableStream<number>, b: ReadableStream<number>) => ReadableStream<unknown> = streamOps[name];
    const reader = combine(a, b).getReader();
    await reader.read();
    await reader.cancel("stop");
    await vi.waitFor(() => {
      expect(a.cancels).toHaveLength(1);
      expect(b.cancels).toHaveLength(1);
    });
  });

  it("zipWith cancels the other stream when the output is cancelled", async () => {
    const other = trackedReadableStream(1, 100);
    const reader = trackedReadableStream(1, 100).pipeThrough(streamOps.zipWith(other)).getReader();
    await reader.read();
    await reader.cancel("stop");
    await vi.waitFor(() => expect(other.cancels).toHaveLength(1));
  });
});
