---
"iteretijs": patch
---

Make `zip` (sync and async) follow the spec's `Iterator.zip` more closely when a source misbehaves.

- A source whose `value` getter throws is now treated like one whose `next()` throws: it is done, so it does not get `return()`, and the other source is closed. Before, `zip` read the values only when it built the pair, so the sync `zip` had already stepped the second source and then called `return()` on the iterator whose `value` threw.
- On an early exit, the sources are closed in reverse order, as `IteratorCloseAll` does. If both `return()` calls throw, the error of the last source is the one that surfaces.
