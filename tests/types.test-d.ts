import { describe, expectTypeOf, it } from "vitest";
import * as asyncOps from "../src/async.ts";
import * as syncOps from "../src/index.ts";

describe("sync results are iterator objects", () => {
  it("inherit the native iterator helpers", () => {
    const doubled = syncOps.range(0, 10).map((x) => x * 2);
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

  it("every operator returns an IteratorObject", () => {
    const source = [1, 2, 3];
    expectTypeOf(syncOps.map(source, String)).toEqualTypeOf<IteratorObject<string, undefined, unknown>>();
    expectTypeOf(syncOps.filter(source, Boolean)).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
    expectTypeOf(syncOps.take(source, 1)).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
    expectTypeOf(syncOps.drop(source, 1)).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
    expectTypeOf(syncOps.concat(source, source)).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
    expectTypeOf(syncOps.zip(source, ["a"])).toEqualTypeOf<IteratorObject<[number, string], undefined, unknown>>();
    expectTypeOf(syncOps.enumerate(source)).toEqualTypeOf<IteratorObject<[number, number], undefined, unknown>>();
    expectTypeOf(syncOps.iota()).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
    expectTypeOf(syncOps.range(0, 1)).toEqualTypeOf<IteratorObject<number, undefined, unknown>>();
  });
});

describe("async results are async iterator objects", () => {
  it("every operator returns an AsyncIteratorObject", async () => {
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

  it("are assignable to AsyncIteratorObject", () => {
    expectTypeOf<ReturnType<typeof asyncOps.map<number, number>>>().toExtend<
      AsyncIteratorObject<number, void, unknown>
    >();
  });

  it("keep the deprecated AsyncItereti alias compatible", () => {
    expectTypeOf<asyncOps.AsyncItereti<number>>().toExtend<AsyncIterable<number>>();
  });
});
