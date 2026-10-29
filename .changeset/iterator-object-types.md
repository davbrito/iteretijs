---
"iteretijs": minor
---

Type the results as iterator objects so the native helpers are visible to TypeScript.

The sync operators (`map`, `filter`, `take`, `drop`, `concat`, `zip`, `enumerate`, `iota` and `range`) now return `IteratorObject<T, undefined, unknown>` instead of `Iterable<T>`. At runtime they were already generators, so the native iterator helpers already worked; only the types hid them:

```ts
range(0, 10)
  .map((x) => x * 2)
  .toArray(); // type-checks now
```

The async operators and `iterateStream` now return `AsyncIteratorObject<T, undefined, unknown>` instead of the custom `AsyncItereti` interface, which stays as a deprecated alias. TypeScript has no async iterator helpers, so this only changes the base type.

**Breaking, types only:**

- `return()` and `throw()` are optional on `AsyncIteratorObject`. Code that calls them on the result of an async operator, or on a value typed `AsyncItereti`, must now use `iterator.return?.()`.
- `IteratorObject` and `AsyncIteratorObject` need TypeScript 5.6 or later. Older versions fail with `Cannot find name 'IteratorObject'`.
