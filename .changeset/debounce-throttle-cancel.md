---
"iteretijs": patch
---

Fix `debounce` and `throttle` keeping their timer running after the output is cancelled.

The timer was only cleared when the stream ended normally, so cancelling early left it pending for up to `ms` milliseconds, which could keep a Node process alive.
