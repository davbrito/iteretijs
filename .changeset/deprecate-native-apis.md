---
"iteretijs": patch
---

Deprecate the APIs that a native feature or an active TC39 proposal already covers. This only adds `@deprecated` JSDoc tags, so editors strike them through and show the replacement; nothing warns at runtime and nothing is removed yet (removal is planned for v1.0).

| Deprecated                                      | Use instead                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| sync `map`, `filter`, `take`, `drop`            | `Iterator.prototype.map` / `filter` / `take` / `drop` (ES2025)            |
| sync `concat`                                   | `Iterator.concat`                                                         |
| sync `zip`                                      | `Iterator.zip`                                                            |
| sync `range`, `iota`                            | `Iterator.range` (proposal)                                               |
| async `map`, `filter`, `take`, `drop`, `reduce` | the matching `AsyncIterator.prototype` helper (proposal)                  |
| async `count`                                   | `AsyncIterator.prototype.reduce((count) => count + 1, 0)`                 |
| async `enumerate`                               | `AsyncIterator.prototype.map((value, index) => [index, value])`           |
| async `toArray`                                 | `Array.fromAsync`                                                         |
| `iterateStream`                                 | `for await (const chunk of stream)` or `stream.values({ preventCancel })` |

```diff
- zip(a, b)
+ Iterator.zip([a, b])
```

Polyfills for the proposals that are not shipped yet: core-js.
