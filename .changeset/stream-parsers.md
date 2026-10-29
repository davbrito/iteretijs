---
"iteretijs": patch
---

Add the stream parsers `lines()`, `ndjson()` and `sse()` to `iteretijs/stream`.

They are `TransformStream`s from text chunks, so they chain after `TextDecoderStream` and are safe against any chunk boundary:

```ts
import { sse } from "iteretijs/stream";

const events = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(sse());
for await (const { event, data, id, retry } of events) {
  // …
}
```

- `lines()` splits on `\n` and `\r\n` and flushes the final partial line.
- `ndjson(options?)` parses one JSON value per line, skips blank lines, and either throws on invalid JSON (default) or skips it through `onError(error, line)`.
- `sse()` follows the WHATWG EventSource parsing rules (multi-line `data`, comments, `retry`, BOM).
