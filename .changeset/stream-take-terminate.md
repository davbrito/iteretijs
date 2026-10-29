---
"iteretijs": minor
---

The stream `take` now closes its output right after the last chunk, and cancels the source.

Before, `take(count)` emitted `count` chunks but kept reading the source to the end and discarded the rest, so `endless.pipeThrough(take(2))` never closed and the source was never cancelled. Now the output closes as soon as the `count`-th chunk is out, even if the source is idle, like `Iterator.prototype.take`, and `take(0)` (or a negative count) closes the output without waiting for a chunk. This matches `zip` and `zipWith`.

It is a `minor`, like the same change to `zipWith`: code that drives the `TransformStream` by hand (`writer.write()`, then `writer.close()`) now sees `close()` and later writes reject with a `TypeError` once the output has closed, as with any `controller.terminate()`. With `pipeThrough` the output simply closes.
