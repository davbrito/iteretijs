---
"iteretijs": patch
---

Add the time-based stream transforms `bufferTime`, `sampleTime` and `timeout`, and the probabilistic `sampleRandom` to `iteretijs/stream`.

Their timers are cleared on flush, cancel and error.
