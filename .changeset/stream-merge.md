---
"iteretijs": patch
---

Add `merge(streams, { queuingStrategy? })` to `iteretijs/stream`: it interleaves several streams by arrival order, errors as soon as one source errors and cancels the rest.

`concat` in `iteretijs/stream` also takes the streams as an array, with the same `queuingStrategy` option: `concat([a, b])`. The variadic form `concat(a, b)` still works but is deprecated.
