---
"iteretijs": patch
---

Add `AbortSignal` support across the API.

- The stream sources `concat` (array form), `merge`, `zip` and `iota` take a `signal` option, like `fromEvents`. Aborting errors the stream with `signal.reason` and cancels its sources:

  ```ts
  const ticks = merge([a, b], { signal });
  const pairs = zip(a, b, { signal });
  const numbers = iota(Infinity, { signal });
  ```

- New `abortable(iterable, signal)` in `iteretijs/async` stops any async iterable (the async operators, a generator, a `ReadableStream`, the native async iterator helpers). It rejects even while a read is pending, and closes the source.

  ```ts
  for await (const line of abortable(readLines(file), AbortSignal.timeout(5000))) console.log(line);
  ```

To stop a pipe through an operator, use the native `pipeThrough(op, { signal })`. Every iterator returned by iteretijs already works with `using` and `await using`. See "Cancellation" in the README for the conventions.
