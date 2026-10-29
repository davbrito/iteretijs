---
"iteretijs": patch
---

Type the results as generators so the native iterator helpers are visible to TypeScript.

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
