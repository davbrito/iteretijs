# iteretijs

## 0.4.1

### Patch Changes

- [#61](https://github.com/davbrito/iteretijs/pull/61) [`e05cbd3`](https://github.com/davbrito/iteretijs/commit/e05cbd30a64a6669749aeed77d116865ccab95ee) Thanks [@davbrito](https://github.com/davbrito)! - Fix `debounce` and `throttle` keeping their timer running after the output is cancelled.

  The timer was only cleared when the stream ended normally, so cancelling early left it pending for up to `ms` milliseconds, which could keep a Node process alive.

- [#62](https://github.com/davbrito/iteretijs/pull/62) [`d89b097`](https://github.com/davbrito/iteretijs/commit/d89b097fee6c92204ac6b02cb80d09cf2cd06a85) Thanks [@davbrito](https://github.com/davbrito)! - Add `batch(size)` to `iteretijs/stream`: a transform stream that groups chunks into arrays of `size` and flushes the last partial batch.

- [#59](https://github.com/davbrito/iteretijs/pull/59) [`557016c`](https://github.com/davbrito/iteretijs/commit/557016cbbc399af5766ca11bf965be0b2301b983) Thanks [@davbrito](https://github.com/davbrito)! - Add the stream parsers `lines()`, `ndjson()` and `sse()` to `iteretijs/stream`.

  They are `TransformStream`s from text chunks, so they chain after `TextDecoderStream` and are safe against any chunk boundary:

  ```ts
  import { sse } from "iteretijs/stream";

  const events = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(sse());
  for await (const { event, data, id, retry } of events) {
    // …
  }
  ```

  - `lines()` splits on `\n` and `\r\n` and flushes the final partial line.
  - `ndjson(options?)` parses one JSON value per line, skips blank lines, and either throws on invalid JSON (default) or skips it through `onError(error, line)`.
  - `sse()` follows the WHATWG EventSource parsing rules (multi-line `data`, comments, `retry`, BOM).

## 0.4.0

### Minor Changes

- [#56](https://github.com/davbrito/iteretijs/pull/56) [`1229e26`](https://github.com/davbrito/iteretijs/commit/1229e26b4bb51bfdb63c04aa4d9a655a286f01b0) Thanks [@davbrito](https://github.com/davbrito)! - The stream `take` now closes its output right after the last chunk, and cancels the source.

  Before, `take(count)` emitted `count` chunks but kept reading the source to the end and discarded the rest, so `endless.pipeThrough(take(2))` never closed and the source was never cancelled. Now the output closes as soon as the `count`-th chunk is out, even if the source is idle, like `Iterator.prototype.take`, and `take(0)` (or a negative count) closes the output without waiting for a chunk. This matches `zip` and `zipWith`.

  It is a `minor`, like the same change to `zipWith`: code that drives the `TransformStream` by hand (`writer.write()`, then `writer.close()`) now sees `close()` and later writes reject with a `TypeError` once the output has closed, as with any `controller.terminate()`. With `pipeThrough` the output simply closes.

- [#51](https://github.com/davbrito/iteretijs/pull/51) [`776a218`](https://github.com/davbrito/iteretijs/commit/776a2189284a6fedade347a7a823890d9ef9caa6) Thanks [@davbrito](https://github.com/davbrito)! - `zipWith` now closes its output as soon as the other stream ends, and the main stream is cancelled.

  Before, `zipWith` stopped emitting pairs when the other stream ended, but kept reading the main stream to the end and discarded its items, so an endless main stream never finished. This matches the stream `zip`, which already closes as soon as either source ends.

  - The end of the other stream is noticed even if the main stream is idle: `zipWith` reads one item of the other stream ahead, so nobody else should read from it. When it ends, the output closes, the main stream is cancelled and the other stream is released (`other.locked` is `false` again).
  - If the other stream fails, the output errors with the same error and the main stream is cancelled.
  - It is a `minor` because code that drives the `TransformStream` by hand (`writer.write()`, then `writer.close()`) now sees `close()` and later writes reject with a `TypeError` once the other stream has ended, as with any `controller.terminate()`. With `pipeThrough` the output simply closes.

### Patch Changes

- [#52](https://github.com/davbrito/iteretijs/pull/52) [`e869919`](https://github.com/davbrito/iteretijs/commit/e869919d6570c27519de7c5d9a188baab946bf50) Thanks [@davbrito](https://github.com/davbrito)! - Deprecate the APIs that a native feature or an active TC39 proposal already covers. This only adds `@deprecated` JSDoc tags, so editors strike them through and show the replacement; nothing warns at runtime and nothing is removed yet (removal is planned for v1.0).

  | Deprecated                                      | Use instead                                                                 |
  | ----------------------------------------------- | --------------------------------------------------------------------------- |
  | sync `map`, `filter`, `take`, `drop`            | `Iterator.prototype.map` / `filter` / `take` / `drop` (ES2025)              |
  | sync `concat`                                   | `Iterator.concat` (Stage 4, not in Node 24 yet)                             |
  | sync `zip`                                      | `Iterator.zip` (Stage 4, not in Node 24 yet)                                |
  | sync `range`, `iota`                            | `Iterator.range` (Stage 2, not in Node 24 yet)                              |
  | async `map`, `filter`, `take`, `drop`, `reduce` | the matching `AsyncIterator.prototype` helper (Stage 2, not in Node 24 yet) |
  | async `count`                                   | `AsyncIterator.prototype.reduce((count) => count + 1, 0)`                   |
  | async `toArray`                                 | `Array.fromAsync`                                                           |
  | `iterateStream`                                 | `for await (const chunk of stream)` or `stream.values({ preventCancel })`   |

  The replacements are not always drop-in:

  - The native `map` and `filter` also pass the index to the callback, so `map(items, parseInt)` becomes `.map((x) => parseInt(x))`.
  - The native `take` and `drop` throw a `RangeError` for a negative or `NaN` count; the iteretijs ones accept it.
  - `Iterator.range` counts down with a negative step and throws a `RangeError` for a step of `0`. For `iota`, use `Iterator.range(start, step < 0 ? -Infinity : Infinity, step)`.

  ```diff
  - zip(a, b)
  + Iterator.zip([a, b])
  ```

  `enumerate` (sync and async) is not deprecated: it stays as a convenience.

  Async `concat` and `zip` are not deprecated yet, because the platform has nothing that covers them: the async iterator helpers proposal has neither, and `Iterator.concat` / `Iterator.zip` only take sync iterables. They are planned for deprecation in v0.5, and for removal in v1.0, once there is general support. Their JSDoc says so.

  Where a replacement is not in Node 24 yet, [core-js](https://github.com/zloirock/core-js) provides a polyfill.

- [#48](https://github.com/davbrito/iteretijs/pull/48) [`de66f0b`](https://github.com/davbrito/iteretijs/commit/de66f0b860212753d24461b5f1e223ea356a9098) Thanks [@davbrito](https://github.com/davbrito)! - Fix cancellation and error propagation in the stream `zip`, `concat` and `zipWith`.

  - `zip` and `concat` now return a pull-based `ReadableStream`. Cancelling the output cancels every source, and an error in one source errors the output and cancels the others. Before, `zip` never cancelled its sources and its output hung forever after a source error or when a source ended; `concat` only cancelled the stream being read and surfaced unhandled rejections.
  - `zip` now closes its output as soon as either source ends, and cancels the one that is still open.
  - `zipWith` cancels the other stream when the output is cancelled, and also once the main stream ends, since nothing reads it anymore.

- [#46](https://github.com/davbrito/iteretijs/pull/46) [`d5da2b0`](https://github.com/davbrito/iteretijs/commit/d5da2b05a61fda7b2cda571582c8d09a0bfc8f81) Thanks [@davbrito](https://github.com/davbrito)! - Fix `zip` (sync and async) leaking its sources when it stops early.

  Previously the source iterators were only closed when one of them ran out. Now `return()` is called on both sources when the consumer exits early (`break`, `return` or an exception in the loop body), when either source's `next()` throws or rejects, and when getting the second iterator throws, before the error propagates. A source that already completed or threw is not closed again. If closing a source throws while another error is already propagating, the original error is kept.

  The sync `zip` also no longer pulls from the second source once the first one is done.

- [#50](https://github.com/davbrito/iteretijs/pull/50) [`ee6f023`](https://github.com/davbrito/iteretijs/commit/ee6f0239aa269d9ed1d817e792e57bce9ea15d69) Thanks [@davbrito](https://github.com/davbrito)! - Type the results as generators so the native iterator helpers are visible to TypeScript.

  The sync operators (`map`, `filter`, `take`, `drop`, `concat`, `zip`, `enumerate`, `iota` and `range`) now return `Generator<T, void, unknown>` instead of `Iterable<T>`. At runtime they were already generators, so the native iterator helpers already worked; only the types hid them:

  ```ts
  range(0, 10)
    .map((x) => x * 2)
    .toArray(); // type-checks now
  ```

  The async operators and `iterateStream` now return `AsyncGenerator<T, void, unknown>`. `AsyncItereti` stays as an alias of that type, so `return()` and `throw()` remain required and nothing changes for code that already called them. TypeScript has no async iterator helpers, so for async only the base type changes.

  `Generator` and `AsyncGenerator` extend `IteratorObject` and `AsyncIteratorObject` from TypeScript 5.6, and the helper methods come from the `esnext.iterator` lib, so add it to `lib` in your `tsconfig.json` to see them:

  ```json
  { "compilerOptions": { "lib": ["es2023", "esnext.iterator"] } }
  ```

- [#57](https://github.com/davbrito/iteretijs/pull/57) [`41fbc54`](https://github.com/davbrito/iteretijs/commit/41fbc5472ba2e99bbf9281a481586da3833a3439) Thanks [@davbrito](https://github.com/davbrito)! - Make `zip` (sync and async) follow the spec's `Iterator.zip` more closely when a source misbehaves.

  - A source whose `value` getter throws is now treated like one whose `next()` throws: it is done, so it does not get `return()`, and the other source is closed. Before, `zip` read the values only when it built the pair, so the sync `zip` had already stepped the second source and then called `return()` on the iterator whose `value` threw.
  - On an early exit, the sources are closed in reverse order, as `IteratorCloseAll` does. If both `return()` calls throw, the error of the last source is the one that surfaces.

## 0.3.1

### Patch Changes

- [#42](https://github.com/davbrito/iteretijs/pull/42) [`64c7354`](https://github.com/davbrito/iteretijs/commit/64c73547e92e52ebdbbb3e238afb5ef4e5d99e6b) Thanks [@davbrito](https://github.com/davbrito)! - Releases are now automated with Changesets. Every release has a changelog entry, a git tag and a GitHub Release, and is published to npm with provenance. There are no changes to the library code.

## 0.3.0

### Breaking changes

- The package is ESM only and its `exports` map is generated by tsdown.
- Node 24 (`^24.11.0 || >=26`) is now required.

### Features

- `iterateStream` implements `Symbol.asyncDispose`.

### Fixes

- `zipWith` no longer waits forever for the other stream to close.

### Other

- The library is built with tsdown and marked as side-effect free.

## 0.2.0 – 0.2.3

- Added the test suite (vitest), the vite build and the npm publish workflow.
- `0.2.1`–`0.2.3` adjusted the `exports` map and the build step to get publishing working.

## 0.0.1 – 0.1.x

- Initial releases of the iterator, generator and stream utilities.

> Changes from the next release on are generated by [Changesets](https://github.com/changesets/changesets).
