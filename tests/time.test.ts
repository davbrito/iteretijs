import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bufferTime, sample, timeout } from "../src/stream.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Reads the output in the background so the tests can look at what has been emitted so far. */
function setup<I, O>(transform: ReadableWritablePair<O, I>) {
  const out: O[] = [];
  const state = { closed: false, error: undefined as unknown };
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  void (async () => {
    try {
      for (let r = await reader.read(); !r.done; r = await reader.read()) out.push(r.value);
      state.closed = true;
    } catch (error) {
      state.error = error;
    }
  })();
  return { out, state, writer, reader };
}

describe("bufferTime", () => {
  it("restarts the interval when maxSize is reached", async () => {
    const { out, writer } = setup(bufferTime<number>(100, { maxSize: 2 }));
    await vi.advanceTimersByTimeAsync(90);
    await writer.write(1);
    await writer.write(2);
    expect(out).toEqual([[1, 2]]);
    await writer.write(3);
    await vi.advanceTimersByTimeAsync(20); // t=110: the old interval would have fired at 100
    expect(out).toEqual([[1, 2]]);
    await vi.advanceTimersByTimeAsync(80); // 100ms after the full buffer
    expect(out).toEqual([[1, 2], [3]]);
  });

  it("emits the collected chunks every interval and skips empty ones", async () => {
    const { out, writer } = setup(bufferTime<number>(100));
    await writer.write(1);
    await writer.write(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toEqual([[1, 2]]);

    await vi.advanceTimersByTimeAsync(300);
    expect(out).toEqual([[1, 2]]);

    await writer.write(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toEqual([[1, 2], [3]]);
  });

  it("emits as soon as maxSize chunks are collected", async () => {
    const { out, writer } = setup(bufferTime<number>(1000, { maxSize: 2 }));
    await writer.write(1);
    expect(out).toEqual([]);
    await writer.write(2);
    await writer.write(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(out).toEqual([[1, 2]]);
  });

  it("emits the remaining chunks when the stream ends", async () => {
    const { out, state, writer } = setup(bufferTime<number>(1000));
    await writer.write(1);
    await writer.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(out).toEqual([[1]]);
    expect(state.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, 1.5, NaN])("throws a RangeError for maxSize %s", (maxSize) => {
    expect(() => bufferTime(10, { maxSize })).toThrow(RangeError);
  });

  it("clears its timer when the output is cancelled", async () => {
    const { reader } = setup(bufferTime<number>(1000));
    expect(vi.getTimerCount()).toBe(1);
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the input is aborted", async () => {
    const { writer, state } = setup(bufferTime<number>(1000));
    const reason = new Error("source failed");
    await writer.abort(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.error).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("sample", () => {
  it("emits only the latest chunk of each interval, and only if there is a new one", async () => {
    const { out, writer } = setup(sample<number>(100));
    await writer.write(1);
    await writer.write(2);
    await writer.write(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toEqual([3]);

    await vi.advanceTimersByTimeAsync(300);
    expect(out).toEqual([3]);

    await writer.write(4);
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toEqual([3, 4]);
  });

  it("emits a falsy chunk", async () => {
    const { out, writer } = setup(sample<number>(100));
    await writer.write(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toEqual([0]);
  });

  it("emits the pending chunk when the stream ends", async () => {
    const { out, state, writer } = setup(sample<number>(1000));
    await writer.write(1);
    await writer.write(2);
    await writer.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(out).toEqual([2]);
    expect(state.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the output is cancelled", async () => {
    const { reader } = setup(sample<number>(1000));
    expect(vi.getTimerCount()).toBe(1);
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the input is aborted", async () => {
    const { writer } = setup(sample<number>(1000));
    await writer.abort(new Error("source failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("timeout", () => {
  it("does not time out while a slow consumer is busy and the source has chunks ready", async () => {
    const t = timeout<number>(50);
    const source = new ReadableStream<number>({
      pull(controller) {
        controller.enqueue(1);
      },
    });
    const reader = source.pipeThrough(t).getReader();
    for (let i = 0; i < 5; i++) {
      const result = await reader.read();
      expect(result.value).toBe(1);
      await vi.advanceTimersByTimeAsync(80); // the consumer is busy, longer than ms
    }
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts counting when the consumer first asks for data, not when created", async () => {
    const t = timeout<number>(20);
    await vi.advanceTimersByTimeAsync(40);
    const source = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1);
        controller.close();
      },
    });
    const reader = source.pipeThrough(t).getReader();
    expect(await reader.read()).toEqual({ done: false, value: 1 });
    expect((await reader.read()).done).toBe(true);
  });

  it("cancels the source when it times out", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<number>({ pull: () => new Promise(() => {}), cancel });
    const reader = source.pipeThrough(timeout<number>(100)).getReader();
    const read = reader.read().catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(((await read) as DOMException).name).toBe("TimeoutError");
    expect(cancel).toHaveBeenCalled();
  });

  it("passes the chunks through while they keep arriving in time", async () => {
    const { out, state, writer } = setup(timeout<number>(100));
    for (const n of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(80);
      await writer.write(n);
    }
    await writer.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(out).toEqual([1, 2, 3]);
    expect(state.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("errors with a TimeoutError when no chunk arrives within ms", async () => {
    const { writer, state } = setup(timeout<number>(100));
    await writer.write(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(state.error).toBeInstanceOf(DOMException);
    expect((state.error as DOMException).name).toBe("TimeoutError");
    await expect(writer.write(2)).rejects.toBe(state.error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("errors when the first chunk is late", async () => {
    const { state } = setup(timeout<number>(100));
    await vi.advanceTimersByTimeAsync(100);
    expect((state.error as DOMException).name).toBe("TimeoutError");
  });

  it("calls onTimeout instead of erroring, then closes the output", async () => {
    const onTimeout = vi.fn();
    const { out, state, writer } = setup(timeout<number>(100, { onTimeout }));
    await writer.write(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(out).toEqual([1]);
    expect(state.closed).toBe(true);
    expect(state.error).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("errors the stream when onTimeout throws", async () => {
    const failure = new Error("boom");
    const { state } = setup(
      timeout<number>(100, {
        onTimeout() {
          throw failure;
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(state.error).toBe(failure);
  });

  it("clears its timer when the output is cancelled", async () => {
    const { reader } = setup(timeout<number>(1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the input is aborted", async () => {
    const { writer } = setup(timeout<number>(1000));
    await writer.abort(new Error("source failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
