export function* map<T, U>(iterable: Iterable<T>, mapper: (value: T) => U): Iterable<U> {
  for (const item of iterable) {
    yield mapper(item);
  }
}

export function* filter<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): Iterable<T> {
  for (const item of iterable) {
    if (predicate(item)) {
      yield item;
    }
  }
}

export function* take<T>(iterable: Iterable<T>, count: number): Iterable<T> {
  let i = 0;
  for (const item of iterable) {
    if (i >= count) {
      break;
    }
    yield item;
    i++;
  }
}

export function* drop<T>(iterable: Iterable<T>, count: number): Iterable<T> {
  let i = 0;
  for (const item of iterable) {
    if (i >= count) {
      yield item;
    }
    i++;
  }
}

export function* concat<T>(...iterables: Iterable<T>[]): Iterable<T> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

export function* zip<T, U>(iterable1: Iterable<T>, iterable2: Iterable<U>): Iterable<[T, U]> {
  const iter1 = iterable1[Symbol.iterator]();
  let iter2: Iterator<U>;
  try {
    iter2 = iterable2[Symbol.iterator]();
  } catch (error) {
    closeAll([iter1], true);
    throw error;
  }

  // An iterator that is mid-`next()`, threw or completed must not get `return()`.
  let open1 = false;
  let open2 = false;
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

export function* enumerate<T>(iterable: Iterable<T>): Iterable<[number, T]> {
  let index = 0;
  for (const item of iterable) {
    yield [index, item];
    index++;
  }
}

export function* iota(start = 0, step = 1): Iterable<number> {
  for (let i = start; ; i += step) {
    yield i;
  }
}

export function* range(start: number, end: number, step = 1): Iterable<number> {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}
