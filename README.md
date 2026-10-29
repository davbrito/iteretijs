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
import { concat, enumerate, iota, zip, zipWith } from "iteretijs/stream";

concat(ReadableStream.from([1, 2]), ReadableStream.from([3])); // 1, 2, 3
zip(ReadableStream.from(["a", "b", "c"]), ReadableStream.from([1, 2])); // ["a", 1], ["b", 2]
ReadableStream.from(["a", "b", "c"]).pipeThrough(zipWith(ReadableStream.from([1, 2, 3]))); // ["a", 1], ["b", 2], ["c", 3]
ReadableStream.from(["a", "b"]).pipeThrough(enumerate()); // [0, "a"], [1, "b"]
iota(3); // 0, 1, 2
```

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
