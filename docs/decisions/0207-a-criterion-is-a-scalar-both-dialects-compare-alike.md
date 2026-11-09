# 0207. A criterion is a scalar both dialects compare alike

**Status:** accepted, 2026-11-09, with the step A criterion is a scalar a query compares of the
[roadmap](../roadmap.md). Changes [decision 0053](archive/0053-what-a-handle-is-given-is-checked.md), whose handle
checks what it is given, and [decision 0143](archive/0143-a-query-pages-after-the-last-row-it-gave.md), whose cursor
holds an id and a scalar of the index ordered by.

## Context

A criterion whose value was `NaN` found no row on SQLite, and found rows on PostgreSQL, where `NaN` is a number
greater than every other. So `count({ where: [{ index, is: '<', value: NaN }] })` counted nothing on one dialect,
and every entity whose index held a number on the other. `criteria` of [`src/storage.ts`](../../src/storage.ts)
checked the comparison and not the value. `cursorOf` refused a number that is not finite in `after`, and checked
neither its id nor a string of its index against what a database holds. A string with U+0000 in a parameter made
PostgreSQL fail the statement, `invalid byte sequence`, where SQLite answered. A lone surrogate is written by
PostgreSQL as U+FFFD, so that it compares as another string than on SQLite
([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)).

## Decision

- **A value a query compares is null, a boolean, a finite number, or a string that is text a database holds.**
  `isCompared` in [`src/storage.ts`](../../src/storage.ts) says it, and `criteria` and `cursorOf` ask it.
- **A criterion's value that is not one is the caller's defect, and nothing is read for it.** `query`, `count`,
  `sum` and `countBy` die with an `InvariantDefect` whose reason is
  `the value compared with the index '…' is …, which is no scalar a query compares`. A string in the reason is
  written as JSON writes it, so that U+0000 is read.
- **The row passed as `after` holds an id and a value of the index of the same kind.** An id that is no text a
  database holds is refused with `the id after is "…", which is no text a database holds`. A value of the index
  that is not one a query compares is refused as before, with `the index '…' after is …, which is no scalar`.
- **The checks stay in the storage.** The storage is what speaks each dialect, and it checked the comparison and
  the cursor already. The handle passes the call to it as it is.

## What it rests on

- That SQLite finds no row under `NaN`, and PostgreSQL rows: **seen** in the reproduction of this bug, on both
  dialects.
- That PostgreSQL fails a statement whose parameter of text holds U+0000, and SQLite answers it: **seen** in a probe
  of both dialects at the versions pinned, which counted rows under `id < 'a\u0000'`.
- That a lone surrogate compares otherwise on each dialect: **reasoned** from
  [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md), which saw PostgreSQL write it as U+FFFD.
  Refusing it needs no premise of how it compares.
- That every criterion and cursor of `query`, `count`, `sum` and `countBy` passes through `criteria` or
  `cursorOf`: **read in the code** of [`src/storage.ts`](../../src/storage.ts). The test
  `a criterion or a cursor that is no scalar a query compares is its caller’s defect, on both dialects` in
  [`src/storage.test.ts`](../../src/storage.test.ts) **tests** it, and fails against the code before the change.

## Alternatives

- **`NaN` read as a number no row holds, on both dialects.** The storage would write a clause no row holds for it.
  A caller who passes `NaN` has a bug, most likely a division by zero, and an answer of nothing hides it.
- **The check in the handle, beside `counted`.** It would hold the same rule twice, since the storage already
  checks the comparison and the cursor, and a test of the storage would not reach it.
