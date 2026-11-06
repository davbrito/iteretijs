---
"iteretijs": patch
---

Add `merge(...streams)` to `iteretijs/stream`: it interleaves several streams by arrival order, errors as soon as one source errors and cancels the rest.
