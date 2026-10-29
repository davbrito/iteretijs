---
"iteretijs": patch
---

Add `batch(size)` to `iteretijs/stream`: a transform stream that groups chunks into arrays of `size` and flushes the last partial batch.
