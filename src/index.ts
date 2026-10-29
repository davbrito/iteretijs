/**
 * @deprecated Use the native `Iterator.prototype.map` (ES2025): `Iterator.from(iterable).map(mapper)`.
 */
export function* map<T, U>(iterable: Iterable<T>, mapper: (value: T) => U): Generator<U, void, unknown> {
  for (const item of iterable) {
    yield mapper(item);
  }
}

/**
 * @deprecated Use the native `Iterator.prototype.filter` (ES2025): `Iterator.from(iterable).filter(predicate)`.
 */
export function* filter<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): Generator<T, void, unknown> {
  for (const item of iterable) {
    if (predicate(item)) {
      yield item;
    }
  }
}

/**
 * @deprecated Use the native `Iterator.prototype.take` (ES2025): `Iterator.from(iterable).take(count)`.
 */
export function* take<T>(iterable: Iterable<T>, count: number): Generator<T, void, unknown> {
  let i = 0;
  for (const item of iterable) {
    if (i >= count) {
      break;
    }
    yield item;
    i++;
  }
}

/**
 * @deprecated Use the native `Iterator.prototype.drop` (ES2025): `Iterator.from(iterable).drop(count)`.
 */
export function* drop<T>(iterable: Iterable<T>, count: number): Generator<T, void, unknown> {
  let i = 0;
  for (const item of iterable) {
    if (i >= count) {
      yield item;
    }
    i++;
  }
}

/**
 * @deprecated Use `Iterator.concat` (TC39 iterator sequencing proposal, Stage 4): `Iterator.concat(a, b)`.
 * Polyfill: core-js.
 */
export function* concat<T>(...iterables: Iterable<T>[]): Generator<T, void, unknown> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

/**
 * @deprecated Use `Iterator.zip` (TC39 joint iteration proposal, Stage 4), which takes an iterable of iterables: `Iterator.zip([a, b])`.
 * Polyfill: core-js.
 */
export function* zip<T, U>(iterable1: Iterable<T>, iterable2: Iterable<U>): Generator<[T, U], void, unknown> {
  const iter1 = iterable1[Symbol.iterator]();
  let iter2: Iterator<U>;
  try {
    iter2 = iterable2[Symbol.iterator]();
  } catch (error) {
    closeAll([iter1], true);
    throw error;
  }

  // An iterator that is mid-`next()`, threw or completed must not get `return()`.
  // `iter2` is open until its first `next()`, even if `iter1` ends the first round.
  let open1 = false;
  let open2 = true;
  let failed = false;

  try {
    for (;;) {
      open1 = false;
      const item1 = iter1.next();
      if (item1.done) break;
      open1 = true;

      open2 = false;
      const item2 = iter2.next();
      if (item2.done) break;
      open2 = true;

      yield [item1.value, item2.value];
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    closeAll([open1 && iter1, open2 && iter2], failed);
  }
}

/**
 * Calls `return()` on every given iterator, like the spec's `IteratorClose`: an error thrown by
 * `return()` only propagates when there is no error already in flight (`suppress`).
 */
function closeAll(iterators: (Iterator<unknown> | false)[], suppress: boolean): void {
  let failed = false;
  let failure: unknown;
  for (const iterator of iterators) {
    if (!iterator) continue;
    try {
      iterator.return?.();
    } catch (error) {
      if (!failed) [failed, failure] = [true, error];
    }
  }
  if (failed && !suppress) throw failure;
}

export function* enumerate<T>(iterable: Iterable<T>): Generator<[number, T], void, unknown> {
  let index = 0;
  for (const item of iterable) {
    yield [index, item];
    index++;
  }
}

/**
 * @deprecated Use `Iterator.range` (TC39 `Iterator.range` proposal, Stage 2): `Iterator.range(start, Infinity, step)`.
 * Polyfill: core-js.
 */
export function* iota(start = 0, step = 1): Generator<number, void, unknown> {
  for (let i = start; ; i += step) {
    yield i;
  }
}

/**
 * @deprecated Use `Iterator.range` (TC39 `Iterator.range` proposal, Stage 2): `Iterator.range(start, end, step)`.
 * Polyfill: core-js.
 */
export function* range(start: number, end: number, step = 1): Generator<number, void, unknown> {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}
