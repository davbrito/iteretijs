import { describe, expectTypeOf, it } from "vitest";
import * as asyncOps from "../src/async.ts";
import * as syncOps from "../src/index.ts";

describe("sync results are generators", () => {
  it("inherit the native iterator helpers", () => {
    const doubled = syncOps.range(0, 10).map((x) => x * 2);
    // the native helpers return a plain IteratorObject
    expectTypeOf(doubled).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
    expectTypeOf(doubled.toArray()).toEqualTypeOf<number[]>();
  });

  it("chain with the helpers and the other operators", () => {
    const result = syncOps
      .iota()
      .filter((x) => x % 2 === 0)
      .take(3);
    expectTypeOf(result.toArray()).toEqualTypeOf<number[]>();
    expectTypeOf(syncOps.map(syncOps.range(0, 3), String).map((s) => s.length)).toEqualTypeOf<
      IteratorObject<number, undefined, unknown>
    >();
  });

  it("every operator returns a Generator", () => {
    const source = [1, 2, 3];
    expectTypeOf(syncOps.map(source, String)).toEqualTypeOf<Generator<string, void, unknown>>();
    expectTypeOf(syncOps.filter(source, Boolean)).toEqualTypeOf<Generator<number, void, unknown>>();
    expectTypeOf(syncOps.take(source, 1)).toEqualTypeOf<Generator<number, void, unknown>>();
    expectTypeOf(syncOps.drop(source, 1)).toEqualTypeOf<Generator<number, void, unknown>>();
    expectTypeOf(syncOps.concat(source, source)).toEqualTypeOf<Generator<number, void, unknown>>();
    expectTypeOf(syncOps.zip(source, ["a"])).toEqualTypeOf<Generator<[number, string], void, unknown>>();
    expectTypeOf(syncOps.enumerate(source)).toEqualTypeOf<Generator<[number, number], void, unknown>>();
    expectTypeOf(syncOps.iota()).toEqualTypeOf<Generator<number, void, unknown>>();
    expectTypeOf(syncOps.range(0, 1)).toEqualTypeOf<Generator<number, void, unknown>>();
  });
});

describe("async results are async generators", () => {
  it("every operator returns an AsyncGenerator", async () => {
    const source = asyncOps.iterateStream(new ReadableStream<number>());
    expectTypeOf(source).toEqualTypeOf<AsyncGenerator<number, void, unknown>>();
    expectTypeOf(asyncOps.map(source, String)).toEqualTypeOf<AsyncGenerator<string, void, unknown>>();
    expectTypeOf(asyncOps.filter(source, Boolean)).toEqualTypeOf<AsyncGenerator<number, void, unknown>>();
    expectTypeOf(asyncOps.take(source, 1)).toEqualTypeOf<AsyncGenerator<number, void, unknown>>();
    expectTypeOf(asyncOps.drop(source, 1)).toEqualTypeOf<AsyncGenerator<number, void, unknown>>();
    expectTypeOf(asyncOps.concat(source, source)).toEqualTypeOf<AsyncGenerator<number, void, unknown>>();
    expectTypeOf(asyncOps.zip(source, source)).toEqualTypeOf<AsyncGenerator<[number, number], void, unknown>>();
    expectTypeOf(asyncOps.enumerate(source)).toEqualTypeOf<AsyncGenerator<[number, number], void, unknown>>();
  });

  it("keep the deprecated AsyncItereti alias compatible", () => {
    expectTypeOf<asyncOps.AsyncItereti<number>>().toExtend<AsyncIterable<number>>();
  });
});

describe("results are iterator objects that keep return() and throw()", () => {
  it("sync results extend IteratorObject", () => {
    expectTypeOf<ReturnType<typeof syncOps.range>>().toExtend<IteratorObject<number, void, unknown>>();
  });

  it("async results extend AsyncIteratorObject", () => {
    expectTypeOf<ReturnType<typeof asyncOps.iterateStream<number>>>().toExtend<
      AsyncIteratorObject<number, void, unknown>
    >();
  });

  it("return() and throw() stay callable without optional chaining", async () => {
    const sync = syncOps.range(0, 3);
    expectTypeOf(sync.return()).toEqualTypeOf<IteratorResult<number, void>>();
    expectTypeOf(sync.throw(new Error("boom"))).toEqualTypeOf<IteratorResult<number, void>>();

    const source = asyncOps.iterateStream(new ReadableStream<number>());
    expectTypeOf(source.return()).toEqualTypeOf<Promise<IteratorResult<number, void>>>();
    expectTypeOf(source.throw(new Error("boom"))).toEqualTypeOf<Promise<IteratorResult<number, void>>>();

    const legacy: asyncOps.AsyncItereti<number> = asyncOps.map(source, (x) => x);
    expectTypeOf(legacy.return()).toEqualTypeOf<Promise<IteratorResult<number, void>>>();
  });
});
