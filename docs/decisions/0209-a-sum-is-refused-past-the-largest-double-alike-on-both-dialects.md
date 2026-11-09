# 0209. A sum is exact on PostgreSQL, and is refused alike on both dialects past the largest double

**Status:** accepted, 2026-11-09. Changes [decision 0148](archive/0148-a-count-and-a-sum-are-read-in-one-statement.md),
whose sum is a double that `TOTAL` adds.

## Context

`sum` added the numbers of an index with `TOTAL` on SQLite, and with `SUM` over `DOUBLE PRECISION` on PostgreSQL
([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). The test
`both dialects answer every call alike` of [`src/dialects.test.ts`](../../src/dialects.test.ts) runs the same calls
on a database of each dialect, and found two answers that differ.

- **The last digits.** Over the amounts `1`, `0.1` and `-1`, SQLite gave `0.1` and PostgreSQL
  `0.10000000000000009`. SQLite 3.53 adds with a compensated sum, and PostgreSQL adds doubles in the order it reads
  the rows, which no statement sets.
- **An overflow.** Over two amounts of `Number.MAX_VALUE`, SQLite gave `Infinity`, which JSON does not hold.
  PostgreSQL failed the statement, so the call died with an `SqlError`, a defect of the storage.

## Decision

- **PostgreSQL adds exactly.** Each number is cast to `NUMERIC`, the sum is read as text, and JavaScript reads that
  text as the nearest double. The exact sum of the decimals that JSON wrote is rounded once, so the total does not
  depend on the order of the rows. `NUMERIC` holds a total past the largest double, so the statement never fails
  on an overflow.
- **SQLite still adds with `TOTAL`.** SQLite has no exact type of decimals built in.
- **A sum past the largest double is its caller's defect, on both dialects.** The statement adds the absolute
  values too. When that total of magnitudes is past the largest double, the call dies with an `InvariantDefect`
  that names the index, and gives no total. A total of magnitudes that a double holds bounds every partial total,
  in whatever order the rows are added. So SQLite never meets an overflow on the way to a total that this rule
  lets through, and both dialects refuse the same sums.
- **The two dialects may differ in the last digits of a total.** PostgreSQL rounds the exact sum once. SQLite's
  compensated sum stays within a rounding of the total of magnitudes. The difference is bounded by a few units of
  the last place of that total of magnitudes, which the test allows, and the comment of `Handle.sum` says.

## What it rests on

- That `TOTAL` gives a double and adds with a compensated sum: **documented**, for the double, by SQLite's page on
  aggregates; **seen**, for the compensation, at the SQLite that bun 1.4.2 holds, 3.53.2, where `1 + 0.1 - 1` is
  `0.1`. The rule does not rest on the compensation: the test allows the difference a plain sum of doubles would
  make over the values it generates.
- That `SUM` over `DOUBLE PRECISION` fails the statement on an overflow, and `SUM` over `NUMERIC` does not:
  **seen**, on PGlite 0.5.15. **Documented** for `NUMERIC` by PostgreSQL's page on numeric types, whose range far
  exceeds a double's.
- That a cast of a number of `jsonb` to `NUMERIC` gives the decimal JSON wrote, exactly: **documented**, by
  PostgreSQL's page on JSON types, where a number of `jsonb` is stored as `numeric`.
- That `Number` reads the text of a decimal as the nearest double: **documented**, by ECMAScript's conversion of a
  string to a number.
- That both dialects refuse the same sums, and give totals within the bound: **tested**, by
  `both dialects answer every call alike`, and by `a sum whose magnitudes pass the largest double is its caller's
  defect` in [`src/storage.test.ts`](../../src/storage.test.ts), which fails against the code before the change.

## Alternatives

- **A total that is `Infinity`.** JSON writes it as `null`, so a boundary would answer a total nobody summed. It
  is also no criterion, since a criterion that is no finite number is refused
  ([decision 0207](0207-a-criterion-is-a-scalar-both-dialects-compare-alike.md)).
- **A sum added by the process.** Reading every number to add it exactly reads the whole read model, which
  decision 0148 avoids by one statement.
- **Doubles on both dialects, compared within a bound.** PostgreSQL's total would still depend on the order of its
  rows, and its overflow would still fail the statement.
