import { describe, expect, it, vi } from "vitest";
import { fromEvents } from "../src/stream.ts";
// A `read()` reaches the stream's `pull` a few microtasks later; real events always come in a later
// task, so the tests wait one `tick` before dispatching to a consumer that is waiting.
import { tick } from "./utils.ts";

/** An `EventTarget` that tracks the listeners still attached for `"ping"`. */
class Target extends EventTarget {
  #attached = new Set<EventListenerOrEventListenerObject>();

  get listeners() {
    return this.#attached.size;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    super.addEventListener(type, listener, options);
    if (type !== "ping" || !listener) return;
    this.#attached.add(listener);
    if (typeof options === "object") options.signal?.addEventListener("abort", () => this.#attached.delete(listener));
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    super.removeEventListener(type, listener, options);
    if (type === "ping" && listener) this.#attached.delete(listener);
  }

  ping(detail: number) {
    this.dispatchEvent(new CustomEvent("ping", { detail }));
  }
}

const details = (events: CustomEvent<number>[]) => events.map((event) => event.detail);

async function readN(stream: ReadableStream<CustomEvent<number>>, n: number) {
  const reader = stream.getReader();
  const out: CustomEvent<number>[] = [];
  for (let i = 0; i < n; i++) {
    const result = await reader.read();
    if (result.done) break;
    out.push(result.value);
  }
  reader.releaseLock();
  return details(out);
}

describe("fromEvents", () => {
  it("delivers the events in order, including the ones dispatched before the first read", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping");
    target.ping(1);
    target.ping(2);
    const reader = events.getReader();
    expect((await reader.read()).value?.detail).toBe(1);
    expect((await reader.read()).value?.detail).toBe(2);
    const next = reader.read();
    await tick();
    target.ping(3);
    expect((await next).value?.detail).toBe(3);
  });

  it("only listens to the given type", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping");
    target.dispatchEvent(new Event("other"));
    target.ping(1);
    expect(await readN(events, 1)).toEqual([1]);
  });

  it("removes the listener when the consumer breaks out of for await", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping");
    expect(target.listeners).toBe(1);
    target.ping(1);
    for await (const event of events) {
      expect(event.detail).toBe(1);
      break;
    }
    expect(target.listeners).toBe(0);
  });

  it("removes the listener when the loop body throws", async () => {
    const target = new Target();
    const events = fromEvents(target, "ping");
    target.ping(1);
    const failure = new Error("boom");
    await expect(
      (async () => {
        for await (const _ of events) throw failure;
      })(),
    ).rejects.toBe(failure);
    expect(target.listeners).toBe(0);
  });

  it("removes the listener when the stream is cancelled", async () => {
    const target = new Target();
    const events = fromEvents(target, "ping");
    await events.cancel();
    expect(target.listeners).toBe(0);
  });

  it("removes the listener and errors with the reason when the signal aborts", async () => {
    const target = new Target();
    const controller = new AbortController();
    const reader = fromEvents(target, "ping", { signal: controller.signal }).getReader();
    const next = reader.read();
    const reason = new Error("stop");
    controller.abort(reason);
    await expect(next).rejects.toBe(reason);
    expect(target.listeners).toBe(0);
  });

  it("never listens with a signal that is already aborted", async () => {
    const target = new Target();
    const reason = new Error("stop");
    const reader = fromEvents(target, "ping", { signal: AbortSignal.abort(reason) }).getReader();
    await expect(reader.read()).rejects.toBe(reason);
    expect(target.listeners).toBe(0);
  });

  it("errors with a RangeError when the buffer overflows with the default strategy", async () => {
    const target = new Target();
    const reader = fromEvents(target, "ping", { buffer: 2 }).getReader();
    target.ping(1);
    target.ping(2);
    expect(target.listeners).toBe(1);
    target.ping(3);
    expect(target.listeners).toBe(0);
    await reader.read();
    await reader.read();
    await expect(reader.read()).rejects.toBeInstanceOf(RangeError);
  });

  it("delivers the buffered events before the overflow error", async () => {
    const target = new Target();
    const reader = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 2 }).getReader();
    for (const n of [1, 2, 3]) target.ping(n);
    expect(target.listeners).toBe(0);
    expect((await reader.read()).value?.detail).toBe(1);
    expect((await reader.read()).value?.detail).toBe(2);
    await expect(reader.read()).rejects.toBeInstanceOf(RangeError);
  });

  it("errors a for await loop with a RangeError on overflow", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 1 });
    target.ping(1);
    target.ping(2);
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const event of events) seen.push(event.detail);
      })(),
    ).rejects.toBeInstanceOf(RangeError);
    expect(seen).toEqual([1]);
  });

  it("with buffer 0 and the default strategy, errors on an event nobody is waiting for", async () => {
    const target = new Target();
    const reader = fromEvents(target, "ping", { buffer: 0 }).getReader();
    target.ping(1);
    await expect(reader.read()).rejects.toBeInstanceOf(RangeError);
    expect(target.listeners).toBe(0);
  });

  it("with buffer 0 and drop-oldest, discards the events nobody is waiting for", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 0, strategy: "drop-oldest" });
    target.ping(1);
    const reader = events.getReader();
    const next = reader.read();
    await tick();
    target.ping(2);
    expect((await next).value?.detail).toBe(2);
  });

  it("passes capture and passive to addEventListener", () => {
    const target = new Target();
    const add = vi.spyOn(target, "addEventListener");
    fromEvents(target, "ping", { capture: true, passive: true });
    expect(add).toHaveBeenCalledWith(
      "ping",
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );
  });

  it("drops the oldest events with drop-oldest", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 2, strategy: "drop-oldest" });
    for (const n of [1, 2, 3, 4]) target.ping(n);
    expect(await readN(events, 2)).toEqual([3, 4]);
  });

  it("drops the new events with drop-newest", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 2, strategy: "drop-newest" });
    for (const n of [1, 2, 3, 4]) target.ping(n);
    expect(await readN(events, 2)).toEqual([1, 2]);
  });

  it("with buffer 0, keeps only the events the consumer is waiting for", async () => {
    const target = new Target();
    const events = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 0, strategy: "drop-newest" });
    target.ping(1); // nobody is waiting
    const reader = events.getReader();
    const next = reader.read();
    await tick();
    target.ping(2);
    target.ping(3); // the consumer has not asked again yet
    expect((await next).value?.detail).toBe(2);
    const after = reader.read();
    await tick();
    target.ping(4);
    expect((await after).value?.detail).toBe(4);
  });

  it("does not count the event handed to a waiting consumer against the buffer", async () => {
    const target = new Target();
    const reader = fromEvents<CustomEvent<number>>(target, "ping", { buffer: 1 }).getReader();
    const next = reader.read();
    await tick();
    target.ping(1); // goes straight to the waiting read
    target.ping(2); // fills the buffer
    expect((await next).value?.detail).toBe(1);
    expect((await reader.read()).value?.detail).toBe(2);
  });

  it.each([-1, 1.5, NaN])("throws a RangeError for buffer %s", (buffer) => {
    expect(() => fromEvents(new Target(), "ping", { buffer })).toThrow(RangeError);
  });

  it("throws a RangeError for an unknown strategy", () => {
    // @ts-expect-error: not a strategy
    expect(() => fromEvents(new Target(), "ping", { strategy: "drop" })).toThrow(RangeError);
  });
});
