# Quick start

A seat held for a quarter of an hour, confirmed in time or released when its time runs out. It is the smallest
program that does something: a state, an inbound message that `update` rejects where it does not apply, a timer that
`work` derives from the state, and a projection. Its first test rehearses the seat without a database or a clock,
and fires the timer instead of waiting for it. Its second test launches the program on SQLite, and sends a request
twice under one request id, which is applied once. The [README](../../README.md#quick-start) shows both files whole.

- [`hold.ts`](hold.ts): the program.
- [`hold.test.ts`](hold.test.ts): its rehearsal, and its launch on SQLite.
