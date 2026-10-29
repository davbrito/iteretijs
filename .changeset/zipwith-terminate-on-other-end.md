---
"iteretijs": minor
---

`zipWith` now closes its output as soon as the other stream ends, and the main stream is cancelled.

Before, `zipWith` stopped emitting pairs when the other stream ended, but kept reading the main stream to the end and discarded its items, so an endless main stream never finished. This matches the stream `zip`, which already closes as soon as either source ends.

- The end of the other stream is noticed even if the main stream is idle: `zipWith` reads one item of the other stream ahead, so nobody else should read from it. When it ends, the output closes, the main stream is cancelled and the other stream is released (`other.locked` is `false` again).
- If the other stream fails, the output errors with the same error and the main stream is cancelled.
- It is a `minor` because code that drives the `TransformStream` by hand (`writer.write()`, then `writer.close()`) now sees `close()` and later writes reject with a `TypeError` once the other stream has ended, as with any `controller.terminate()`. With `pipeThrough` the output simply closes.
