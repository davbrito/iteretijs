import { describe, expect, it, vi } from "vitest";
import { lines, ndjson, sse } from "../src/stream.ts";

async function run<I, O>(chunks: I[], transform: TransformStream<I, O>) {
  const input = new ReadableStream<I>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const out: O[] = [];
  for await (const value of input.pipeThrough(transform)) out.push(value);
  return out;
}

/** Every way of cutting `text` in two, plus one byte-per-chunk split. */
function splits(text: string) {
  const all = [Array.from(text)];
  for (let i = 0; i <= text.length; i++) all.push([text.slice(0, i), text.slice(i)]);
  return all;
}

describe("lines", () => {
  const text = "a\nb\r\n\r\nc\r\nlast";
  const expected = ["a", "b", "", "c", "last"];

  it("splits \\n and \\r\\n and flushes the final line", async () => {
    expect(await run([text], lines())).toEqual(expected);
  });

  it("is chunk-boundary safe at every offset", async () => {
    for (const chunks of splits(text)) {
      expect(await run(chunks, lines())).toEqual(expected);
    }
  });

  it("emits nothing for a trailing terminator", async () => {
    expect(await run(["a\n"], lines())).toEqual(["a"]);
    expect(await run([], lines())).toEqual([]);
  });
});

describe("long lines", () => {
  it("splits a line made of many chunks in linear time", async () => {
    const chunks = Array.from({ length: 4096 }, () => "x".repeat(1024));
    const start = performance.now();
    const result = await run([...chunks, "\n"], lines());
    expect(result).toEqual(["x".repeat(4096 * 1024)]);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("ndjson", () => {
  const text = '{"a":1}\n\n  \n[2]\r\n"x"';

  it("parses values, skipping blank lines, at every chunking", async () => {
    for (const chunks of splits(text)) {
      expect(await run(chunks, ndjson())).toEqual([{ a: 1 }, [2], "x"]);
    }
  });

  it("throws on invalid JSON by default", async () => {
    await expect(run(['{"a":1}\nnope\n'], ndjson())).rejects.toThrow(SyntaxError);
  });

  it("skips invalid lines through onError", async () => {
    const errors: string[] = [];
    const result = await run(["1\nnope\n2\n"], ndjson({ onError: (_, line) => errors.push(line) }));
    expect(result).toEqual([1, 2]);
    expect(errors).toEqual(["nope"]);
  });
});

describe("sse", () => {
  const text =
    "﻿: comment\nevent: greet\ndata: hello\ndata:world\nid: 7\nretry: 1500\n\n" +
    "data\n\r" +
    "data: second\rretry: abc\r\n\r\n" +
    "event: ignored\n\n" +
    "id: 9\ndata: x\n\n" +
    "data: incomplete";
  const expected = [
    { event: "greet", data: "hello\nworld", id: "7", retry: 1500 },
    { event: "message", data: "", id: "7", retry: 1500 },
    { event: "message", data: "second", id: "7", retry: 1500 },
    { event: "message", data: "x", id: "9", retry: 1500 },
  ];

  it("follows the EventSource parsing rules", async () => {
    expect(await run([text], sse())).toEqual(expected);
  });

  it("is chunk-boundary safe at every offset", async () => {
    for (const chunks of splits(text)) {
      expect(await run(chunks, sse())).toEqual(expected);
    }
  });

  it("keeps the reconnection time set in its own block", async () => {
    expect(await run(["retry: 3000\n\n", "data: hi\n\n", "data: again\n\n"], sse())).toEqual([
      { event: "message", data: "hi", id: "", retry: 3000 },
      { event: "message", data: "again", id: "", retry: 3000 },
    ]);
  });

  it("ignores empty chunks between a \\r and its \\n", async () => {
    expect(await run(["data: a\r", "", "\ndata: b\n\n"], sse())).toEqual([
      { event: "message", data: "a\nb", id: "", retry: undefined },
    ]);
    expect(await run(["a\r", "", "\nb"], lines())).toEqual(["a", "b"]);
  });

  it("ignores ids containing NULL", async () => {
    expect(await run(["id: a\0b\ndata: x\n\n"], sse())).toEqual([
      { event: "message", data: "x", id: "", retry: undefined },
    ]);
  });
});

describe("cancellation", () => {
  it.each([
    ["lines", lines, "1\n"],
    ["ndjson", ndjson, "1\n"],
    ["sse", sse, "data: 1\n\n"],
  ] as const)("%s cancels the source when the output is cancelled", async (_, parser, chunk) => {
    let cancelled: unknown;
    const source = new ReadableStream<string>({
      pull: (controller) => controller.enqueue(chunk),
      cancel: (reason) => void (cancelled = reason),
    });
    const reader = source.pipeThrough(parser() as TransformStream<string, unknown>).getReader();
    await reader.read();
    await reader.cancel("stop");
    await vi.waitFor(() => expect(cancelled).toBe("stop"));
  });
});
