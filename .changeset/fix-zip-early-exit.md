---
"iteretijs": patch
---

Fix `zip` (sync and async) leaking its sources when it stops early.

Previously the source iterators were only closed when one of them ran out. Now `return()` is called on both sources when the consumer exits early (`break`, `return` or an exception in the loop body), when either source's `next()` throws or rejects, and when getting the second iterator throws, before the error propagates. A source that already completed or threw is not closed again. If closing a source throws while another error is already propagating, the original error is kept.

The sync `zip` also no longer pulls from the second source once the first one is done.
