---
"iteretijs": patch
---

Deprecate the APIs that a native feature or an active TC39 proposal already covers. This only adds `@deprecated` JSDoc tags, so editors strike them through and show the replacement; nothing warns at runtime and nothing is removed yet (removal is planned for v1.0).

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
