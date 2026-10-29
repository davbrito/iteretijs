---
"iteretijs": patch
---

`zipWith` now closes its output as soon as the other stream ends, and the main stream is cancelled.

Before, `zipWith` stopped emitting pairs when the other stream ended, but kept reading the main stream to the end and discarded its items, so an endless main stream never finished. This matches the stream `zip`, which already closes as soon as either source ends.

With `pipeThrough`, the main stream is cancelled and the output closes cleanly. If you drive the `TransformStream` yourself, its writable side is errored with a `TypeError`, as with any `controller.terminate()`.
