import { describe, expect, it } from "vitest";
import { merge } from "../src/stream.ts";
import { tick, trackedReadableStream } from "./utils.ts";

/** A stream whose chunks the test pushes by hand. */
function manual<T>() {
  const cancels: unknown[] = [];
  let controller!: ReadableStreamDefaultController<T>;
  const stream = new ReadableStream<T>({
    start(c) {
      controller = c;
    },
    cancel(reason) {
      cancels.push(reason);
    },
  });
  return {
    stream,
    cancels,
    push: (value: T) => controller.enqueue(value),
    close: () => controller.close(),
    error: (e: unknown) => controller.error(e),
  };
}

function stringStream(value: string) {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(value);
      controller.close();
    },
  });
}

async function readAll<T>(stream: ReadableStream<T>) {
  const items: T[] = [];
  const reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) items.push(r.value);
  return items;
}

describe("merge", () => {
  it("emits the chunks in arrival order", async () => {
    const a = manual<string>();
    const b = manual<string>();
    const reader = merge([a.stream, b.stream]).getReader();

    const first = reader.read();
    b.push("b1");
    expect(await first).toEqual({ done: false, value: "b1" });

    const second = reader.read();
    a.push("a1");
    expect(await second).toEqual({ done: false, value: "a1" });

    const third = reader.read();
    b.push("b2");
    expect(await third).toEqual({ done: false, value: "b2" });
  });

  it("keeps every chunk and closes when all the sources close", async () => {
    const out = await readAll(
      merge([trackedReadableStream(0, 3), trackedReadableStream(10, 12), trackedReadableStream(20, 21)]),
    );
    expect(out.sort((x, y) => x - y)).toEqual([0, 1, 2, 10, 11, 20]);
  });

  it("keeps reading the sources that are left when one closes", async () => {
    const a = manual<number>();
    const b = manual<number>();
    const reader = merge([a.stream, b.stream]).getReader();
    a.close();
    const next = reader.read();
    b.push(1);
    expect(await next).toEqual({ done: false, value: 1 });
    b.close();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it("closes right away without sources", async () => {
    expect(await readAll(merge([]))).toEqual([]);
  });

  it("errors as soon as a source errors and cancels the rest", async () => {
    const a = manual<number>();
    const b = manual<number>();
    const reader = merge([a.stream, b.stream]).getReader();
    const next = reader.read();
    const failure = new Error("a failed");
    a.error(failure);
    await expect(next).rejects.toBe(failure);
    expect(b.cancels).toEqual([failure]);
  });

  it("cancels every source when the output is cancelled", async () => {
    const a = manual<number>();
    const b = manual<number>();
    const reader = merge([a.stream, b.stream]).getReader();
    const pending = reader.read();
    await reader.cancel("stop");
    expect(a.cancels).toEqual(["stop"]);
    expect(b.cancels).toEqual(["stop"]);
    expect(await pending).toEqual({ done: true, value: undefined });
  });

  it("does not cancel a source that already closed", async () => {
    const a = manual<number>();
    const b = manual<number>();
    const reader = merge([a.stream, b.stream]).getReader();
    const next = reader.read();
    a.close();
    b.push(1);
    await next;
    await reader.cancel("stop");
    expect(a.cancels).toEqual([]);
    expect(b.cancels).toEqual(["stop"]);
  });

  it("respects backpressure", async () => {
    const pulls = [0, 0];
    const endless = (i: number) =>
      new ReadableStream<number>({
        pull(controller) {
          controller.enqueue(pulls[i]++);
        },
      });
    const reader = merge([endless(0), endless(1)]).getReader();
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The consumer asked for one chunk: each source is read a bounded number of times, not drained.
    expect(pulls[0] + pulls[1]).toBeLessThan(20);
    await reader.cancel();
  });

  it("takes streams of different types", async () => {
    const out: ReadableStream<number | string> = merge([trackedReadableStream(1, 2), stringStream("a")]);
    expect((await readAll(out)).sort()).toEqual([1, "a"]);
  });

  it("uses the queuing strategy for the output", async () => {
    let pulls = 0;
    const source = new ReadableStream<number>(
      {
        pull(controller) {
          controller.enqueue(pulls++);
        },
      },
      { highWaterMark: 0 },
    );
    const reader = merge([source], { queuingStrategy: { highWaterMark: 0 } }).getReader();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pulls).toBe(0); // nothing is read before the consumer asks
    expect(await reader.read()).toEqual({ done: false, value: 0 });
    await reader.cancel();
  });

  it("reads ahead up to a higher highWaterMark", async () => {
    let pulls = 0;
    const source = new ReadableStream<number>(
      {
        pull(controller) {
          controller.enqueue(pulls++);
        },
      },
      { highWaterMark: 0 },
    );
    const output = merge([source], { queuingStrategy: { highWaterMark: 5 } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pulls).toBeGreaterThanOrEqual(5);
    expect(pulls).toBeLessThan(8);
    await output.cancel();
  });

  it("throws for a stream passed twice and leaves it unlocked", () => {
    const a = manual<number>();
    expect(() => merge([a.stream, a.stream])).toThrow(TypeError);
    expect(a.stream.locked).toBe(false);
  });

  it("delivers the queued chunks before the error of a source that failed while nobody read", async () => {
    const a = manual<number>();
    const b = manual<number>();
    const reader = merge([a.stream, b.stream]).getReader();
    a.push(1);
    b.push(2);
    await tick();
    const failure = new Error("a failed");
    a.error(failure);
    expect(await reader.read()).toEqual({ done: false, value: 1 });
    expect(await reader.read()).toEqual({ done: false, value: 2 });
    await expect(reader.read()).rejects.toBe(failure);
    expect(b.cancels).toEqual([failure]);
  });
});
