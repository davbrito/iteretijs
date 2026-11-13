---
"iteretijs": patch
---

Add `fromEvents(target, type, { buffer?, strategy?, signal?, capture?, passive? })` to `iteretijs/stream`: the events of an `EventTarget` as a `ReadableStream`.

`buffer` bounds the events kept while the consumer is busy (`Infinity` by default), and `strategy` (`"error"`, `"drop-oldest"` or `"drop-newest"`) decides what happens when it is full. The listener is removed on cancel (as when a `for await` loop exits early), error and `signal` abort.
