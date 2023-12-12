export function* map<T, U>(
  iterable: Iterable<T>,
  mapper: (value: T) => U,
): Iterable<U> {
  for (const item of iterable) {
    yield mapper(item);
  }
}

export function* filter<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean,
): Iterable<T> {
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

export function* zip<T, U>(
  iterable1: Iterable<T>,
  iterable2: Iterable<U>,
): Iterable<[T, U]> {
  const iter1 = iterable1[Symbol.iterator]();
  const iter2 = iterable2[Symbol.iterator]();
  for (;;) {
    const item1 = iter1.next();
    const item2 = iter2.next();

    if (item1.done || item2.done) {
      break;
    }
    yield [item1.value, item2.value];
  }
}

export function* enumerate<T>(iterable: Iterable<T>): Iterable<[number, T]> {
  let index = 0;
  for (const item of iterable) {
    yield [index, item];
    index++;
  }
}
