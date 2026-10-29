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
  return transform(async (data, controller) => {
    if (count > 0) {
      controller.enqueue(data);
      count--;
    }
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
  return new TransformStream<T, T>({
    transform(data, controller) {
      if (!timer) {
        controller.enqueue(data);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
      }, ms);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  });
}

export function throttle<T>(ms: number): TransformStream<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new TransformStream<T, T>({
    transform(data, controller) {
      if (!timer) {
        controller.enqueue(data);
        timer = setTimeout(() => {
          timer = undefined;
        }, ms);
      }
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  });
}
