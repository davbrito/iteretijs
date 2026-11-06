export function transform<T, U>(transform: TransformerTransformCallback<T, U>) {
  return new TransformStream<T, U>({ transform });
}

export function map<T, U>(mapper: (value: T) => U | Promise<U>): TransformStream<T, U> {
  return transform(async (data, controller) => {
    controller.enqueue(await mapper(data));
  });
}

export function filter<T>(predicate: (value: T) => boolean | Promise<boolean>): TransformStream<T, T> {
  return transform(async (data, controller) => {
    if (await predicate(data)) {
      controller.enqueue(data);
    }
  });
}

export function take<T>(count: number): TransformStream<T, T> {
  return new TransformStream<T, T>({
    start(controller) {
      // Nothing to emit: close the output and cancel the source without waiting for a chunk.
      if (!(count > 0)) controller.terminate();
    },
    transform(data, controller) {
      controller.enqueue(data);
      // That was the last chunk: close the output and cancel the source right away instead of
      // reading it to the end and dropping its chunks.
      if (--count <= 0) controller.terminate();
    },
  });
}

export function drop<T>(count: number): TransformStream<T, T> {
  return transform(async (data, controller) => {
    if (count > 0) {
      count--;
      return;
    }
    controller.enqueue(data);
  });
}

/**
 * Groups the chunks into arrays of `size`; the last array holds the remainder when the stream ends.
 * `Iterator.prototype.chunks` only covers iterators, not streams.
 * Throws a `RangeError` unless `size` is a positive integer.
 */
export function batch<T>(size: number): TransformStream<T, T[]> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`batch size must be a positive integer, got ${size}`);
  }
  let current: T[] = [];
  return new TransformStream<T, T[]>({
    transform(data, controller) {
      current.push(data);
      if (current.length === size) {
        controller.enqueue(current);
        current = [];
      }
    },
    flush(controller) {
      if (current.length > 0) controller.enqueue(current);
    },
  });
}

export function concat<T>(...streams: ReadableStream<T>[]): ReadableStream<T> {
  let index = 0;
  let reader: ReadableStreamDefaultReader<T> | undefined;

  /** Cancels the stream being read and every stream that was not started yet. */
  const cancelRest = (reason?: unknown) => {
    const pending = streams.slice(reader ? index + 1 : index).map((stream) => stream.cancel(reason));
    if (reader) pending.unshift(reader.cancel(reason));
    return cancelAll(pending);
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        while (index < streams.length) {
          reader ??= streams[index].getReader();
          const result = await reader.read();
          if (!result.done) {
            controller.enqueue(result.value);
            return;
          }
          reader.releaseLock();
          reader = undefined;
          index++;
        }
      } catch (error) {
        // Cancelling an errored stream rejects with its stored error, which is rethrown below.
        await cancelRest(error).catch(() => {});
        throw error;
      }
      controller.close();
    },
    cancel: cancelRest,
  });
}

// `cancel` is in the Streams spec but missing from the DOM typings of the TypeScript we build with.
interface CancellableTransformer<I, O> extends Transformer<I, O> {
  cancel?(reason?: unknown): void | PromiseLike<void>;
}

export function zipWith<T, U>(stream: ReadableStream<U>): TransformStream<T, [T, U]> {
  const reader = stream.getReader();
  let controller!: TransformStreamDefaultController<[T, U]>;
  // Set once this transformer cleans up `stream` itself (the main stream ended or the output was cancelled).
  let finished = false;
  // One item of `stream` is always being read ahead, so the end or a failure of `stream` is noticed
  // even while the main stream is idle.
  let pending: Promise<ReadableStreamReadResult<U>>;

  const read = () => {
    const result = reader.read();
    // Handling both outcomes here also keeps this promise from ever being an unhandled rejection.
    result.then(
      (value) => {
        if (!value.done || finished) return;
        // Nothing can be paired anymore: free `stream`, close the output and cancel the main stream
        // instead of reading it to the end and dropping its items.
        finished = true;
        reader.releaseLock();
        controller.terminate();
      },
      (error) => {
        if (finished) return;
        finished = true;
        reader.releaseLock();
        controller.error(error);
      },
    );
    return result;
  };

  const transformer: CancellableTransformer<T, [T, U]> = {
    start(c) {
      controller = c;
      pending = read();
    },
    flush() {
      // The main stream is over and nothing will read `stream` anymore. Cleaning it up must not
      // fail an output that already delivered everything, e.g. if `stream` errored in the meantime.
      finished = true;
      return reader.cancel().catch(() => {});
    },
    cancel(reason) {
      finished = true;
      return reader.cancel(reason);
    },
    transform: async (data, controller) => {
      const value = await pending;

      // The end of `stream` already terminated the output.
      if (value.done) return;

      pending = read();
      controller.enqueue([data, value.value]);
    },
  };
  return new TransformStream(transformer);
}

export function zip<T, U>(stream1: ReadableStream<T>, stream2: ReadableStream<U>): ReadableStream<[T, U]> {
  const reader1 = stream1.getReader();
  const reader2 = stream2.getReader();

  return new ReadableStream<[T, U]>({
    async pull(controller) {
      // Cancelling the other reader as soon as one read ends or fails settles its pending read
      // with `done`, so an idle source cannot keep the output waiting.
      const read = <V>(reader: ReadableStreamDefaultReader<V>, other: ReadableStreamDefaultReader<unknown>) =>
        reader.read().then(
          (result) => {
            if (result.done) other.cancel().catch(() => {});
            return result;
          },
          (error) => {
            other.cancel(error).catch(() => {});
            throw error;
          },
        );
      // Wait for both reads, so a failure never leaves the other one in flight.
      const [result1, result2] = await Promise.allSettled([read(reader1, reader2), read(reader2, reader1)]);

      if (result1.status === "rejected" || result2.status === "rejected") {
        const error = result1.status === "rejected" ? result1.reason : (result2 as PromiseRejectedResult).reason;
        // Cancelling an errored stream rejects with its stored error, which is rethrown below.
        await cancelAll([reader1.cancel(error), reader2.cancel(error)]).catch(() => {});
        throw error;
      }

      if (result1.value.done || result2.value.done) {
        // Only cancel what is still open.
        await cancelAll([
          result1.value.done ? undefined : reader1.cancel(),
          result2.value.done ? undefined : reader2.cancel(),
        ]);
        controller.close();
        return;
      }

      controller.enqueue([result1.value.value, result2.value.value]);
    },
    cancel(reason) {
      return cancelAll([reader1.cancel(reason), reader2.cancel(reason)]);
    },
  });
}

/**
 * Emits the chunks of every stream as soon as they arrive. It closes when all of them have closed,
 * and errors as soon as one errors, cancelling the rest. Cancelling the output cancels every source.
 * Each source is read only while the consumer pulls, and holds at most one unconsumed chunk.
 */
export function merge<T>(...streams: ReadableStream<T>[]): ReadableStream<T> {
  type Settled = { index: number } & ({ result: ReadableStreamReadResult<T> } | { error: unknown });
  const readers = streams.map((stream) => stream.getReader());
  const open = new Set(readers.keys());
  const reading = new Map<number, Promise<Settled>>();
  let cancelled = false;

  /** Cancels the sources that have not closed. */
  const cancelOpen = (reason?: unknown) => {
    const pending = [...open].map((index) => readers[index].cancel(reason));
    open.clear();
    return cancelAll(pending);
  };

  return new ReadableStream<T>({
    async pull(controller) {
      while (open.size > 0) {
        for (const index of open) {
          // These promises never reject, so a read nobody waits for cannot go unhandled.
          if (reading.has(index)) continue;
          reading.set(
            index,
            readers[index].read().then(
              (result): Settled => ({ index, result }),
              (error): Settled => ({ index, error }),
            ),
          );
        }
        const settled = await Promise.race(reading.values());
        reading.delete(settled.index);
        if (cancelled) return;

        if ("error" in settled) {
          open.delete(settled.index);
          // Cancelling an errored stream rejects with its stored error, which is rethrown below.
          await cancelOpen(settled.error).catch(() => {});
          throw settled.error;
        }
        if (settled.result.done) {
          open.delete(settled.index);
          continue;
        }
        controller.enqueue(settled.result.value);
        return;
      }
      controller.close();
    },
    cancel(reason) {
      cancelled = true;
      return cancelOpen(reason);
    },
  });
}

/** Waits for every promise, then rejects with the first failure, if any. */
async function cancelAll(promises: (Promise<void> | undefined)[]): Promise<void> {
  const results = await Promise.allSettled(promises);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

export function enumerate<T>(): TransformStream<T, [number, T]> {
  let index = 0;
  return new TransformStream({
    transform(data, controller) {
      controller.enqueue([index++, data]);
    },
  });
}

export function iota(n = Infinity): ReadableStream<number> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      return new Promise((resolve) => {
        setTimeout(() => {
          if (index < n) {
            controller.enqueue(index++);
          } else {
            controller.close();
          }
          resolve();
        }, 0);
      });
    },
  });
}

export function debounce<T>(ms: number): TransformStream<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const transformer: CancellableTransformer<T, T> = {
    transform(data, controller) {
      if (!timer) {
        controller.enqueue(data);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
      }, ms);
    },
    flush: clear,
    cancel: clear,
  };
  return new TransformStream(transformer);
}

export function throttle<T>(ms: number): TransformStream<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const transformer: CancellableTransformer<T, T> = {
    transform(data, controller) {
      if (!timer) {
        controller.enqueue(data);
        timer = setTimeout(() => {
          timer = undefined;
        }, ms);
      }
    },
    flush: clear,
    cancel: clear,
  };
  return new TransformStream(transformer);
}

/** Splits text into lines. `crAsTerminator` also treats a lone `\r` as a line break (SSE rules). */
function createLineSplitter(emit: (line: string) => void, crAsTerminator: boolean) {
  // Fragments of the line still waiting for its terminator; only each new chunk is scanned.
  const pending: string[] = [];
  let pendingCR = false;

  const emitLine = (tail: string) => {
    let line = pending.length ? pending.join("") + tail : tail;
    pending.length = 0;
    if (!crAsTerminator && line.endsWith("\r")) line = line.slice(0, -1);
    emit(line);
  };

  return {
    push(chunk: string) {
      if (chunk === "") return;
      let start = 0;
      if (pendingCR) {
        pendingCR = false;
        if (chunk[0] === "\n") start = 1;
      }
      if (crAsTerminator) {
        for (let i = start; i < chunk.length; i++) {
          const code = chunk.charCodeAt(i);
          if (code !== 10 && code !== 13) continue;
          emitLine(chunk.slice(start, i));
          if (code === 13) {
            if (i + 1 === chunk.length) pendingCR = true;
            else if (chunk[i + 1] === "\n") i++;
          }
          start = i + 1;
        }
      } else {
        for (let nl = chunk.indexOf("\n", start); nl !== -1; nl = chunk.indexOf("\n", start)) {
          emitLine(chunk.slice(start, nl));
          start = nl + 1;
        }
      }
      if (start < chunk.length) pending.push(chunk.slice(start));
    },
    /** Emits the final partial line, if any. */
    flush() {
      if (pending.length) emit(pending.join(""));
      pending.length = 0;
    },
  };
}

/**
 * Splits a stream of text chunks into lines, however the chunks are cut.
 * Handles `\n` and `\r\n` (even when split across chunks) and flushes the final line without terminator.
 */
export function lines(): TransformStream<string, string> {
  let splitter: ReturnType<typeof createLineSplitter>;
  return new TransformStream<string, string>({
    start(controller) {
      splitter = createLineSplitter((line) => controller.enqueue(line), false);
    },
    transform: (chunk) => splitter.push(chunk),
    flush: () => splitter.flush(),
  });
}

export interface NdjsonOptions {
  /**
   * What to do with a line that is not valid JSON.
   * `"throw"` (default) errors the stream; a function is called with the error and the line, and the line is skipped.
   */
  onError?: "throw" | ((error: unknown, line: string) => void);
}

/** Parses newline-delimited JSON from a stream of text chunks. Blank lines are skipped. */
export function ndjson<T = unknown>(options: NdjsonOptions = {}): TransformStream<string, T> {
  const { onError = "throw" } = options;
  let splitter: ReturnType<typeof createLineSplitter>;
  return new TransformStream<string, T>({
    start(controller) {
      splitter = createLineSplitter((line) => {
        if (line.trim() === "") return;
        let value: T;
        try {
          value = JSON.parse(line);
        } catch (error) {
          if (onError === "throw") throw error;
          onError(error, line);
          return;
        }
        controller.enqueue(value);
      }, false);
    },
    transform: (chunk) => splitter.push(chunk),
    flush: () => splitter.flush(),
  });
}

export interface ServerSentEvent {
  /** The event type; `"message"` when the event has no `event` field. */
  event: string;
  data: string;
  /** The last event ID seen on the stream, `""` if none. */
  id: string;
  /** The last reconnection time, in milliseconds, set on the stream; `undefined` if none was. */
  retry: number | undefined;
}

/**
 * Parses Server-Sent Events from a stream of text chunks, following the
 * [WHATWG EventSource parsing rules](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream):
 * multi-line `data`, comments, `retry`, a leading BOM, and `\n`, `\r` or `\r\n` line endings.
 * An event that is still incomplete when the stream ends is discarded.
 */
export function sse(): TransformStream<string, ServerSentEvent> {
  let splitter: ReturnType<typeof createLineSplitter>;
  return new TransformStream<string, ServerSentEvent>({
    start(controller) {
      let first = true;
      let data = "";
      let hasData = false;
      let event = "";
      let id = "";
      let retry: number | undefined;

      splitter = createLineSplitter((line) => {
        if (first) {
          first = false;
          if (line.startsWith("\uFEFF")) line = line.slice(1);
        }
        if (line === "") {
          if (hasData) {
            controller.enqueue({ event: event || "message", data, id, retry });
          }
          data = "";
          hasData = false;
          event = "";
          return;
        }
        if (line.startsWith(":")) return;

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);

        switch (field) {
          case "event":
            event = value;
            break;
          case "data":
            data = hasData ? `${data}\n${value}` : value;
            hasData = true;
            break;
          case "id":
            if (!value.includes("\0")) id = value;
            break;
          case "retry":
            if (/^\d+$/.test(value)) retry = Number(value);
            break;
        }
      }, true);
    },
    transform: (chunk) => splitter.push(chunk),
    flush: () => splitter.flush(),
  });
}
