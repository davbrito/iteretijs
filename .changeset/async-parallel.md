---
"iteretijs": patch
---

Add `parallel(source, fn, { concurrency, ordered, signal })` to `iteretijs/async`: calls `fn` on each item of a sync or async iterable (or a `ReadableStream`) with at most `concurrency` calls at once, and yields the results.

```ts
import { parallel } from "iteretijs/async";

for await (const data of parallel(urls, (url, _i, signal) => fetch(url, { signal }).then((r) => r.json()), {
  concurrency: 8,
})) {
  console.log(data);
}
```

Results come in source order by default, or as soon as each is ready with `ordered: false`. `fn` gets an `AbortSignal` that aborts when a call rejects, when you stop reading or when `signal` aborts. `parallel` then waits for the running calls to settle and closes the source.
