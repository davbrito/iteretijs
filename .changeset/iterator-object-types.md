---
"iteretijs": patch
---

Type the results as iterator objects so the native helpers are visible to TypeScript.

The sync operators (`map`, `filter`, `take`, `drop`, `concat`, `zip`, `enumerate`, `iota` and `range`) now return `IteratorObject<T, undefined, unknown>` instead of `Iterable<T>`. At runtime they were already generators, so the native iterator helpers already worked; only the types hid them:

```ts
range(0, 10)
  .map((x) => x * 2)
  .toArray(); // type-checks now
```

The async operators and `iterateStream` now return `AsyncGenerator<T, void, unknown>`, which is an `AsyncIteratorObject<T, void, unknown>`. The `AsyncItereti` type is kept as a deprecated alias.

`IteratorObject` and `AsyncIteratorObject` need TypeScript 5.6 or later.
