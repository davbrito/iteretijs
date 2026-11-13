# iteretijs

Set of JavaScript iterator, generator and stream utilities.

## Guiding principle

iteretijs **complements the platform and never overlaps it**. It does not ship polyfills or ponyfills: if a native API, or a TC39/WHATWG proposal that is moving forward, already does something, iteretijs stops offering its own version and points you to the native one.

In practice that means two things:

- What the platform has no answer for stays here and keeps being supported: the operators for web streams (`TransformStream`s you pipe through), `enumerate`, `debounce` and `throttle`, among others.
- What the platform now covers is deprecated with a `@deprecated` tag that names its replacement. Nothing warns at runtime, and nothing is removed before v1.0. See the [migration guide](#migration-guide).

## Install

```sh
npm install iteretijs
```

The package is ESM only and has three entry points:

| Import                            | What it has                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| `iteretijs` (or `iteretijs/sync`) | operators for sync iterables, which return generators        |
| `iteretijs/async`                 | operators for async iterables, which return async generators |
| `iteretijs/stream`                | operators for web streams                                    |

### Supported runtimes

Node.js `^24.11.0 || >=26` (the `engines` field of `package.json`).

### TypeScript

The sync operators return `Generator<T, void, unknown>`, which is also an `IteratorObject`, so the [native iterator helpers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator#iterator_helper_methods) type-check on their results. For that you need TypeScript 5.6 or later and the `esnext.iterator` lib:

```json
{ "compilerOptions": { "lib": ["es2023", "esnext.iterator"] } }
```

```ts
import { enumerate } from "iteretijs";

enumerate(["a", "b", "c"])
  .map(([index, letter]) => `${index}:${letter}`)
  .toArray(); // ["0:a", "1:b", "2:c"]
```

## Usage

### Stream operators

Each operator that transforms a stream is a `TransformStream`, so you apply it with `pipeThrough`. Cancelling the output cancels the source, and an error in the source reaches the output.

```ts
import { drop, filter, map, take } from "iteretijs/stream";

const odds = ReadableStream.from([1, 2, 3, 4, 5])
  .pipeThrough(filter((n) => n % 2 === 1))
  .pipeThrough(map((n) => n * 10))
  .pipeThrough(take(2));

for await (const n of odds) console.log(n); // 10, 30
```

The operators that combine several streams give you back one:

```ts
import { concat, enumerate, iota, merge, zip, zipWith } from "iteretijs/stream";

concat([ReadableStream.from([1, 2]), ReadableStream.from([3])]); // 1, 2, 3
zip(ReadableStream.from(["a", "b", "c"]), ReadableStream.from([1, 2])); // ["a", 1], ["b", 2]
merge([clicks, keys]); // chunks of both, in arrival order
ReadableStream.from(["a", "b", "c"]).pipeThrough(zipWith(ReadableStream.from([1, 2, 3]))); // ["a", 1], ["b", 2], ["c", 3]
ReadableStream.from(["a", "b"]).pipeThrough(enumerate()); // [0, "a"], [1, "b"]
iota(3); // 0, 1, 2
```

`merge` closes when all the streams have closed, errors when it reads a failure from one (cancelling the rest), and reads each stream only while the output's queue has room. `concat` and `merge` take the streams as an array and, as a second argument, the output's `queuingStrategy`: `merge([a, b], { queuingStrategy: { highWaterMark: 0 } })` reads nothing before the consumer asks. `concat(a, b)`, with the streams as separate arguments, still works but is deprecated.

`zip` and `zipWith` close their output as soon as either stream ends, and cancel the one that is still open.

Two operators deal with time. Both emit the first chunk of a burst right away:

```ts
import { debounce, throttle } from "iteretijs/stream";

source.pipeThrough(debounce(200)); // ignores chunks until 200 ms pass without a new one
source.pipeThrough(throttle(200)); // lets one chunk through every 200 ms
```

`transform(fn)` is the building block of the others: a `TransformStream` made from a transform callback.

### Stream parsers: `lines`, `ndjson` and `sse`

Parsers for text streams, such as a `fetch` body. They take text, so put a `TextDecoderStream` in front, and they handle any chunk boundary:

```ts
import { lines, ndjson, sse } from "iteretijs/stream";

const text = res.body.pipeThrough(new TextDecoderStream());

text.pipeThrough(lines()); // one string per line (\n or \r\n)
text.pipeThrough(ndjson<Item>()); // one parsed JSON value per line, blank lines skipped
text.pipeThrough(ndjson({ onError: (error, line) => console.warn(line) })); // skip invalid lines instead of throwing

for await (const { event, data, id, retry } of text.pipeThrough(sse())) {
  // Server-Sent Events, following the WHATWG EventSource rules
}
```

### Events as a stream: `fromEvents`

`fromEvents(target, type)` turns the events of any `EventTarget` (DOM elements, `AbortSignal`, Node's `EventTarget`) into a `ReadableStream`, so they work with `for await` and with every operator here. Node's `events.on()` is Node-only and buffers without limit for an `EventTarget`, and the Observable proposal's `when()` is only in Chromium and is not async iterable.

```ts
import { fromEvents, throttle } from "iteretijs/stream";

for await (const click of fromEvents<MouseEvent>(button, "click", { signal }).pipeThrough(throttle(100))) {
  // … leaving the loop removes the listener
}

fromEvents(input, "input", { buffer: 1, strategy: "drop-oldest" }); // a slow consumer only sees the latest event
fromEvents(socket, "message", { buffer: 1000 }); // errors with a RangeError past 1000 unread events
```

The listener is added at once, so events dispatched before the first read are kept. While the consumer is busy, up to `buffer` events wait (`Infinity` by default); when it is full, `strategy` decides: `"error"` (the default) errors the stream, `"drop-oldest"` and `"drop-newest"` discard an event. The listener is removed when the stream is cancelled (as `for await` does when the loop exits early), errors, or `signal` aborts (the stream errors with its reason). The stream never closes on its own.

### Batching a stream: `batch`

`Iterator.prototype.chunks` only covers iterators, so `batch(size)` groups the chunks of a stream into arrays. The last array holds the remainder, and a `size` that is not a positive integer throws a `RangeError`:

```ts
import { batch } from "iteretijs/stream";

for await (const rows of stream.pipeThrough(batch(100))) {
  await insertMany(rows);
}
```

### Time-based transforms: `bufferTime`, `sampleTime` and `timeout`

They complement `debounce` and `throttle`. `sampleRandom` has no timer; it is the probabilistic counterpart of `sampleTime`. The timers are cleared when the stream ends, is cancelled or fails:

```ts
import { bufferTime, sampleRandom, sampleTime, timeout } from "iteretijs/stream";

stream.pipeThrough(bufferTime(1000, { maxSize: 100 })); // arrays every second, or every 100 chunks (the interval restarts); never empty
stream.pipeThrough(sampleTime(200)); // the latest chunk every 200ms, if there is a new one
stream.pipeThrough(sampleRandom(0.1)); // keeps about 10% of the chunks, at random
stream.pipeThrough(sampleRandom((line) => (line.startsWith("error") ? 1 : 0.01))); // probability per chunk
stream.pipeThrough(timeout(5000)); // errors with a TimeoutError if the source is silent for 5s
stream.pipeThrough(timeout(5000, { onTimeout: () => console.warn("idle") })); // closes the output instead of erroring
```

`bufferTime` and `sampleTime` emit what they still hold when the stream ends. The timers of `bufferTime` and `sampleTime` do not wait for the consumer, so a slow consumer makes the output queue up. `timeout` respects backpressure: it counts only while the consumer is waiting for a chunk, starting at the first read, so a slow consumer never triggers it.

### Sync and async iterables: `enumerate`

```ts
import { enumerate } from "iteretijs";

for (const [index, value] of enumerate(["a", "b"])) {
  console.log(index, value); // 0 "a", then 1 "b"
}
```

`enumerate` stays supported as a convenience, in `iteretijs/async` too:

```ts
import { enumerate } from "iteretijs/async";

for await (const [index, value] of enumerate(asyncSource)) console.log(index, value);
```

The operators close the iterables they read when you stop early (`break`, `return` or an exception in your loop), so a generator you pass in gets to run its `finally` block.

### Async iterables: `concat` and `zip`

The async iterator helpers proposal has no `concat` or `zip`, and `Iterator.concat` / `Iterator.zip` only take sync iterables, so for now these stay supported. They are planned for deprecation in v0.5 and for removal in v1.0, once the platform has general support for them.

```ts
import { concat, zip } from "iteretijs/async";

for await (const value of concat(first, second)) console.log(value);
for await (const [a, b] of zip(first, second)) console.log(a, b);
```

### Limiting concurrency: `parallel`

`parallel` calls a function on each item of a sync or async iterable (or a `ReadableStream`), with at most `concurrency` calls at once, and yields the results. The async iterator helpers have no concurrency limit, so this stays supported.

```ts
import { parallel } from "iteretijs/async";

const fetchJson = (url: string, _index: number, signal: AbortSignal) => fetch(url, { signal }).then((r) => r.json());

for await (const data of parallel(urls, fetchJson, { concurrency: 8 })) console.log(data); // in the order of urls
for await (const data of parallel(urls, fetchJson, { concurrency: 8, ordered: false })) console.log(data); // as they finish
```

- `ordered: true` (the default) yields in the order of the source, `false` in the order the calls finish. A result that is ready but not read yet keeps its slot, so at most `concurrency` results are ever held.
- The function gets the item, its index and an `AbortSignal`. That signal aborts when a call rejects, when you stop reading (`break`), or when the `signal` option aborts. Pass it on so the running calls stop quickly: `parallel` waits for them to settle before it rejects or finishes, and then closes the source.
- The source is read one item at a time, never with overlapping `next()` calls.
- Like any async generator, `return()` waits for a read that is still pending, and that read can wait for the running calls. To stop while a read is pending (after a timeout, for example), abort the `signal` option.
- The first error, from a call or from the source, is thrown by the next read. With the `signal` option, the error is the signal's reason.

### Cancellation: `signal`, `abortable` and `using`

Every async API here can be stopped from outside and cleans up what it opened. Which tool to use depends on what you hold:

| You have                                                             | To stop it with an `AbortSignal`                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| a stream made here: `concat`, `merge`, `zip`, `iota`, `fromEvents`   | the `signal` option                                                    |
| a pipe through an operator (`map`, `batch`, `debounce`…)             | the native `pipeThrough(op, { signal })` or `pipeTo(dest, { signal })` |
| `parallel`                                                           | its `signal` option, which also reaches your function                  |
| any other async iterable: the async operators, a generator, a stream | wrap it: `abortable(iterable, signal)` from `iteretijs/async`          |

```ts
import { abortable } from "iteretijs/async";
import { fromEvents, iota, merge } from "iteretijs/stream";

const ticks = merge([iota(Infinity, { signal }), fromEvents(socket, "message", { signal })], { signal });

for await (const line of abortable(readLines(file), AbortSignal.timeout(5000))) console.log(line);
```

The conventions are the same everywhere:

- Aborting rejects the read in progress, or the next one, with `signal.reason`, and cancels or closes the sources. A stream errors with the reason.
- A signal that is already aborted rejects the first read and does not open the sources (a stream source is cancelled).
- Aborting after the stream or the iteration finished does nothing: the listener is removed as soon as it ends, errors or is cancelled, so a long-lived signal keeps nothing alive.

Every iterator returned here is a generator or an async generator, so it already has `Symbol.dispose` or `Symbol.asyncDispose` (Node.js 24; the deprecated `iterateStream` implements it itself): `using` and `await using` close it, and its sources, at the end of the block.

```ts
{
  await using lines = abortable(readLines(file), signal);
  const header = await lines.next();
} // the file is closed here
```

`ReadableStream` has no `Symbol.asyncDispose` yet. Iterate it, or use its iterator: `await using it = stream.values()` cancels the stream at the end of the block.

## Migration guide

These APIs are deprecated, because the platform covers them or is about to. Instead of the iteretijs version, use:

| Instead of                                             | Use                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `map(iterable, fn)` from `iteretijs`                   | `Iterator.from(iterable).map(fn)`                                                            |
| `filter(iterable, fn)` from `iteretijs`                | `Iterator.from(iterable).filter(fn)`                                                         |
| `take(iterable, n)` from `iteretijs`                   | `Iterator.from(iterable).take(n)`                                                            |
| `drop(iterable, n)` from `iteretijs`                   | `Iterator.from(iterable).drop(n)`                                                            |
| `concat(a, b)` from `iteretijs`                        | `Iterator.concat(a, b)` (Stage 4, not in Node 24 yet)                                        |
| `zip(a, b)` from `iteretijs`                           | `Iterator.zip([a, b])` (Stage 4, not in Node 24 yet)                                         |
| `range(start, end, step)` from `iteretijs`             | `Iterator.range(start, end, step)` (Stage 2, not in Node 24 yet)                             |
| `iota(start, step)` from `iteretijs`                   | `Iterator.range(start, step < 0 ? -Infinity : Infinity, step)` (Stage 2, not in Node 24 yet) |
| `map`, `filter`, `take`, `drop` from `iteretijs/async` | `AsyncIterator.from(iterable).map(fn)` and the like (Stage 2, not in Node 24 yet)            |
| `reduce(iterable, fn, initial)` from `iteretijs/async` | `AsyncIterator.from(iterable).reduce(fn, initial)` (Stage 2, not in Node 24 yet)             |
| `count(iterable)` from `iteretijs/async`               | `AsyncIterator.from(iterable).reduce((count) => count + 1, 0)` (Stage 2, not in Node 24 yet) |
| `toArray(iterable)` from `iteretijs/async`             | `Array.fromAsync(iterable)`                                                                  |
| `iterateStream(stream)` from `iteretijs/async`         | `for await (const chunk of stream)`, or `stream.values({ preventCancel })`                   |

Status of each replacement, for the supported Node.js versions (`^24.11.0 || >=26`):

- Available: the iterator helpers (`map`, `filter`, `take`, `drop`, `Iterator.from`, part of ES2025), `Array.fromAsync`, and `ReadableStream` async iteration.
- Not in Node 24 yet: `Iterator.concat` and `Iterator.zip` (TC39 proposals at Stage 4), `Iterator.range` and the async iterator helpers (Stage 2). Using them today needs a polyfill; [core-js](https://github.com/zloirock/core-js) is the usual one for TC39 proposals.

The native replacements are not always drop-in:

- The native `map` and `filter` also pass the index to the callback, so `map(items, parseInt)` becomes `.map((x) => parseInt(x))`.
- The native `take` and `drop` throw a `RangeError` for a negative or `NaN` count; the iteretijs ones accept it.
- `Iterator.range` counts down with a negative step (`range(5, 0, -1)` yields nothing in iteretijs, `Iterator.range(5, 0, -1)` yields 5 to 1) and throws a `RangeError` for a step of `0`, where iteretijs never ends.

The deprecated functions keep working until v1.0.

`enumerate` (sync and async) is not in this table because it stays supported. Async `concat` and `zip` (from `iteretijs/async`) are not in it yet either. They are planned for deprecation in v0.5, once there is a native replacement to point to. Meanwhile, `concat` can be written with `yield*` in an async generator:

```ts
async function* concat<T>(...sources: AsyncIterable<T>[]) {
  for (const source of sources) yield* source;
}
```

## License

[MIT](LICENSE)
