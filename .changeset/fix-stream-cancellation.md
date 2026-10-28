---
"iteretijs": patch
---

Fix cancellation and error propagation in the stream `zip`, `concat` and `zipWith`.

- `zip` and `concat` now return a pull-based `ReadableStream`. Cancelling the output cancels every source, and an error in one source errors the output and cancels the others. Before, `zip` never cancelled its sources and its output hung forever after a source error or when a source ended; `concat` only cancelled the stream being read and surfaced unhandled rejections.
- `zip` now closes its output as soon as either source ends, and cancels the one that is still open.
- `zipWith` cancels the other stream when the output is cancelled, and also once the main stream ends, since nothing reads it anymore.
