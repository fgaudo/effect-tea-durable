# 0146. An index that is an integer beyond 2^53 is written with its exact digits

**Status:** accepted, 2026-11-05. Changes
[decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md), whose premise that the indexes stored with a
row are the ones the query compares did not hold of an integer beyond 2^53.

## Context

The storage writes the indexes of a row with `JSON.stringify`, and a query reads each through `json_extract` and
compares it with the value it binds: a criterion's, or the cursor's, which is the value a row found carries
([decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)). A number of JavaScript is a double, and
`JSON.stringify` writes it with the fewest digits that read back as the same double. For an integer beyond 2^53
those digits spell another integer: `2^60` is written `1152921504606847000`, which is `2^60 + 24`. SQLite reads
the digits as the exact integer they spell, and compares an integer with a real exactly, so the stored value is
not equal to the double bound, and is greater than it or smaller.

A criterion `=` on such a value then misses the row. A page whose cursor is such a row gives the row again: the
statement of the rows that tie finds none, and the statement of the rows past the value finds the row itself, so
a caller that pages until a page is empty never ends. A nanosecond timestamp, held as a number, is such an index.

## Decision

- **An index that is an integer beyond the safe range is written with the exact digits of its double**, those of
  `BigInt(value)`; any other scalar is written as `JSON.stringify` writes it. SQLite reads the exact digits as the
  same number, within the range of its integers and beyond it, and `JSON.parse` reads them back as the double, so
  the row found carries the value the query compared, and the text stays JSON, within
  [decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md).
- **The text is written once**, by `indexesText` in [`src/storage.ts`](../../../src/storage.ts), where a step writes
  the row and where `reindex` writes it again. A row written before holds the digits `JSON.stringify` wrote until
  `reindex` writes it again, as a row of an older version holds its indexes
  ([decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)).

## What it rests on

- That SQLite reads the digits `JSON.stringify` writes of an integer beyond 2^53 as another number, and the exact
  digits of the double as the same number, from a safe integer to a double beyond SQLite's integers: **seen**, in
  the spike [`spikes/sqlite-json-integer-digits.test.ts`](../../../spikes/sqlite-json-integer-digits.test.ts), over a
  sample of every magnitude. **Documented**, by SQLite's page on datatypes, where an integer and a real compare by
  their numeric values, and by its page on JSON, where a JSON integer too large for SQLite's is read as a real.
- That `BigInt(value)` gives the exact integer a double holds, and `JSON.parse` of its digits gives the double
  back: **documented**, by ECMAScript's `BigInt` and `Number::toString`, and checked in the same spike.
- That a page past a cursor of such a value, and a criterion `=` on it, read the row once and find it: **tested**,
  by the test `a query pages past, and finds by its value, a row whose index is an integer beyond 2^53` in
  [`src/storage.test.ts`](../../../src/storage.test.ts), which fails without the exact digits.

## Alternatives

- **Refusing such an index as the program's defect**, as a non-finite number is refused. A timestamp in
  nanoseconds is an index a program may well declare, and the storage can write it right.
- **Comparing the stored value as a real**, with `CAST` in the clause. The index of the expression would not be
  used, and every page would walk the rows of its program.
- **A cursor that carries the stored digits**, as a string or a bigint. A caller cannot hold the number itself,
  and a criterion would need the same form.

## Consequences

- `indexesText` in [`src/storage.ts`](../../../src/storage.ts) writes the indexes, and the status line of decision
  0143 names this note. `docs/design.md` says under Reading how such an integer is written.
