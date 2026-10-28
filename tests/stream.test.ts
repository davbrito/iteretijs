import { describe, expect, it } from "vitest";
import { zip, zipWith } from "../src/stream.ts";
import { dumbReadableStream, trackedReadableStream } from "./utils.ts";

async function readAll<T>(stream: ReadableStream<T>) {
  const items: T[] = [];
  const reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    items.push(r.value);
  }
  return items;
}

describe("zipWith", () => {
  it("pairs each value with the next value of the other stream", async () => {
    const result = dumbReadableStream(0, 3).pipeThrough(zipWith(dumbReadableStream(10, 13)));

    expect(await readAll(result)).toEqual([
      [0, 10],
      [1, 11],
      [2, 12],
    ]);
  }, 1000);

  it("stops emitting when the other stream is shorter", async () => {
    const result = dumbReadableStream(0, 5).pipeThrough(zipWith(dumbReadableStream(10, 12)));

    expect(await readAll(result)).toEqual([
      [0, 10],
      [1, 11],
    ]);
  }, 1000);

  it("does not wait for the other stream to close before emitting", async () => {
    const values = [10, 11, 12];
    const openStream = new ReadableStream<number>({
      pull(controller) {
        const next = values.shift();
        if (next !== undefined) controller.enqueue(next);
        // never closes: the next pull stays pending
        else return new Promise(() => {});
      },
    });

    const result = dumbReadableStream(0, 2).pipeThrough(zipWith(openStream));

    expect(await readAll(result)).toEqual([
      [0, 10],
      [1, 11],
    ]);
  }, 1000);

  it("does not error a finished output when the other stream errors after the last pair", async () => {
    let controller!: ReadableStreamDefaultController<number>;
    const other = new ReadableStream<number>({
      start(c) {
        controller = c;
        c.enqueue(10);
      },
    });
    const reader = dumbReadableStream(0, 1).pipeThrough(zipWith(other)).getReader();

    expect(await reader.read()).toEqual({ done: false, value: [0, 10] });
    controller.error(new Error("late"));
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  }, 1000);
});

describe("zip", () => {
  /** A stream that never produces anything and records when it is cancelled. */
  function idleStream() {
    const state = { cancelled: false };
    const stream = new ReadableStream<number>({
      cancel() {
        state.cancelled = true;
      },
    });
    return { stream, state };
  }

  it("closes when one source ends while the other is idle, cancelling the idle one", async () => {
    const idle = idleStream();
    const reader = zip(dumbReadableStream(0, 0), idle.stream).getReader();

    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(idle.state.cancelled).toBe(true);
  }, 1000);

  it("errors when one source fails while the other is idle, cancelling the idle one", async () => {
    const idle = idleStream();
    const failing = trackedReadableStream(0, 10, { failOn: 0 });
    const reader = zip(failing, idle.stream).getReader();

    await expect(reader.read()).rejects.toThrow("source failed");
    expect(idle.state.cancelled).toBe(true);
  }, 1000);
});
