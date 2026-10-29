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

### Sync iterables: `enumerate`

```ts
import { enumerate } from "iteretijs";

for (const [index, value] of enumerate(["a", "b"])) {
  console.log(index, value); // 0 "a", then 1 "b"
}
```

The operators close the iterables they read when you stop early (`break`, `return` or an exception in your loop), so a generator you pass in gets to run its `finally` block.

### Async iterables: `concat` and `zip`

The async iterator helpers proposal has no `concat` or `zip`, so for now these stay:

```ts
import { concat, zip } from "iteretijs/async";

for await (const value of concat(first, second)) console.log(value);
for await (const [a, b] of zip(first, second)) console.log(a, b);
```

## Migration guide

These APIs are deprecated, because the platform covers them or is about to. Instead of the iteretijs version, use:

| Instead of                                             | Use                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `map(iterable, fn)` from `iteretijs`                   | `Iterator.from(iterable).map(fn)`                                               |
| `filter(iterable, fn)` from `iteretijs`                | `Iterator.from(iterable).filter(fn)`                                            |
| `take(iterable, n)` from `iteretijs`                   | `Iterator.from(iterable).take(n)`                                               |
| `drop(iterable, n)` from `iteretijs`                   | `Iterator.from(iterable).drop(n)`                                               |
| `concat(a, b)` from `iteretijs`                        | `Iterator.concat(a, b)`                                                         |
| `zip(a, b)` from `iteretijs`                           | `Iterator.zip([a, b])`                                                          |
| `range(start, end, step)` from `iteretijs`             | `Iterator.range(start, end, step)` (proposal)                                   |
| `iota(start, step)` from `iteretijs`                   | `Iterator.range(start, Infinity, step)` (proposal)                              |
| `map`, `filter`, `take`, `drop` from `iteretijs/async` | `AsyncIterator.from(iterable).map(fn)` and the like (proposal)                  |
| `reduce(iterable, fn, initial)` from `iteretijs/async` | `AsyncIterator.from(iterable).reduce(fn, initial)` (proposal)                   |
| `count(iterable)` from `iteretijs/async`               | `AsyncIterator.from(iterable).reduce((count) => count + 1, 0)` (proposal)       |
| `enumerate(iterable)` from `iteretijs/async`           | `AsyncIterator.from(iterable).map((value, index) => [index, value])` (proposal) |
| `toArray(iterable)` from `iteretijs/async`             | `Array.fromAsync(iterable)`                                                     |
| `iterateStream(stream)` from `iteretijs/async`         | `for await (const chunk of stream)`, or `stream.values({ preventCancel })`      |

Status of each replacement:

- Iterator helpers (`map`, `filter`, `take`, `drop`, `Iterator.from`) are part of ES2025. `Iterator.concat` and `Iterator.zip` are TC39 proposals at Stage 4.
- `Iterator.range` and the async iterator helpers are TC39 proposals at Stage 2, so they are not in engines yet.
- `Array.fromAsync` and `ReadableStream` async iteration are available in the supported Node.js versions.
- For the proposals that engines do not ship yet, [core-js](https://github.com/zloirock/core-js) provides polyfills.

The deprecated functions keep working until v1.0.

## License

[MIT](LICENSE)
