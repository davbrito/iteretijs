/**
 * @deprecated Use the native `Iterator.prototype.map` (ES2025): `Iterator.from(iterable).map(mapper)`.
 * The native callback also receives the index, so `map(items, parseInt)` becomes `.map((x) => parseInt(x))`.
 */
export function* map<T, U>(iterable: Iterable<T>, mapper: (value: T) => U): Generator<U, void, unknown> {
  for (const item of iterable) {
    yield mapper(item);
  }
}

/**
 * @deprecated Use the native `Iterator.prototype.filter` (ES2025): `Iterator.from(iterable).filter(predicate)`.
 * The native callback also receives the index.
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
 * The native one throws a `RangeError` for a negative or `NaN` count.
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
 * The native one throws a `RangeError` for a negative or `NaN` count.
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
 * Not in Node 24 yet; polyfill: core-js.
 */
export function* concat<T>(...iterables: Iterable<T>[]): Generator<T, void, unknown> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

/**
 * @deprecated Use `Iterator.zip` (TC39 joint iteration proposal, Stage 4), which takes an iterable of iterables: `Iterator.zip([a, b])`.
 * Not in Node 24 yet; polyfill: core-js.
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
      // Each `value` is read right after its `next()`, like `IteratorStepValue`: a getter that throws
      // counts as `next()` throwing, so that iterator is done and the other one is not stepped.
      open1 = false;
      const item1 = iter1.next();
      if (item1.done) break;
      const value1 = item1.value;
      open1 = true;

      open2 = false;
      const item2 = iter2.next();
      if (item2.done) break;
      const value2 = item2.value;
      open2 = true;

      yield [value1, value2];
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    closeAll([open1 && iter1, open2 && iter2], failed);
  }
}

/**
 * Calls `return()` on every given iterator in reverse order, like the spec's `IteratorCloseAll`: an
 * error thrown by `return()` only propagates when there is no error already in flight (`suppress`).
 */
function closeAll(iterators: (Iterator<unknown> | false)[], suppress: boolean): void {
  let failed = false;
  let failure: unknown;
  for (const iterator of iterators.toReversed()) {
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
 * @deprecated Use `Iterator.range` (TC39 `Iterator.range` proposal, Stage 2):
 * `Iterator.range(start, step < 0 ? -Infinity : Infinity, step)`.
 * Not in Node 24 yet; polyfill: core-js.
 *
 * With a negative step this counts down forever, like `Iterator.range` with an infinite end; a step of
 * `0` repeats `start` forever, while `Iterator.range` throws a `RangeError`.
 */
export function* iota(start = 0, step = 1): Generator<number, void, unknown> {
  for (let i = start; ; i += step) {
    yield i;
  }
}

/**
 * @deprecated Use `Iterator.range` (TC39 `Iterator.range` proposal, Stage 2): `Iterator.range(start, end, step)`.
 * Not in Node 24 yet; polyfill: core-js.
 *
 * Differences with a negative or zero step: `Iterator.range(5, 0, -1)` counts down (5, 4, 3, 2, 1) where this
 * yields nothing, `Iterator.range(0, 5, -1)` yields nothing where this never ends, and a step of `0`
 * throws a `RangeError` where this never ends.
 */
export function* range(start: number, end: number, step = 1): Generator<number, void, unknown> {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}
