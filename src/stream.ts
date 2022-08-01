export function transform<T, U>(transform: TransformerTransformCallback<T, U>) {
  return new TransformStream<T, U>({ transform });
}

export function map<T, U>(
  mapper: (value: T) => U | Promise<U>
): TransformStream<T, U> {
  return transform(async (data, controller) => {
    controller.enqueue(await mapper(data));
  });
}

export function filter<T>(
  predicate: (value: T) => boolean | Promise<boolean>
): TransformStream<T, T> {
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
  const { readable, writable } = new TransformStream();

  streams
    .reduce(
      (prev, stream) =>
        prev.then(() => stream.pipeTo(writable, { preventClose: true })),
      Promise.resolve()
    )
    .then(() => writable.close());

  return readable;
}

export function zipWith<T, U>(
  stream: ReadableStream<U>
): TransformStream<T, [T, U]> {
  const reader = stream.getReader();
  return new TransformStream({
    flush() {
      reader.releaseLock();
    },
    transform: async (data, controller) => {
      if (await reader.closed) return;

      const value = await reader.read();

      if (value.done) {
        return;
      }

      controller.enqueue([data, value.value]);
    },
  });
}

export function zip<T, U>(
  stream1: ReadableStream<T>,
  stream2: ReadableStream<U>
): ReadableStream<[T, U]> {
  const { readable, writable } = new TransformStream<[T, U], [T, U]>();

  (async function () {
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();
    const writer = writable.getWriter();

    try {
      for (;;) {
        const [item1, item2] = await Promise.all([
          reader1.read(),
          reader2.read(),
        ]);

        if (item1.done || item2.done) {
          break;
        }

        writer.write([item1.value, item2.value]);
      }
    } finally {
      reader1.releaseLock();
      reader2.releaseLock();
      writer.releaseLock();
    }
  })();

  return readable;
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
  let timer: number | undefined;
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
  let timer: number | undefined;
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
