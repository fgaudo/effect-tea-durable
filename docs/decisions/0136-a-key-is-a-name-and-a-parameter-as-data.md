# 0136. A key is a name and a parameter, as data

**Status:** accepted, 2026-11-04. Changes [decision 0132](0132-a-key-may-take-a-parameter.md): a key is no longer
the text `["charge","line-7"]`, and a name may start with `[`.

## Context

[Decision 0132](0132-a-key-may-take-a-parameter.md) let a key take a parameter. The machine wrote such a key as one
text, the canonical JSON of its name and its encoded parameter, `["charge","line-7"]`, and a key without a parameter
as its name. The machine told the two apart by the first character of the text, so `checkProgram` refused a declared
name that starts with `[`.

Four places trusted that convention, and no type linked them: the check of `checkProgram`, the test of a key's
first character in `src/program.ts`, the idempotency key built by hand from the text, and the `key` column of
`entity_keys` in `src/storage.ts`. [Decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md) would
multiply the places that read a key's text. A review of decision 0132 found this the one thing worth changing before
that.

## Decision

- **A key is a value of two fields.** `Key` in `src/program.ts` is `{ name, parameter? }`: the declared name, and for
  a key that takes one, the parameter as its schema encodes it. A key without a parameter has no `parameter` field,
  so a parameter whose JSON is `null` or `""` is still a parameter. The fields of each object of a parameter are in
  order, so two parameters that encode alike are equal, field for field, as decision 0132 compares them.
- **Every value that leaves the machine carries the key as data.** The events `Complete`, `Fire` and `Die`, every
  output that names a key, an internal message of the mailbox, a suspension on an operation, the rows the machine
  writes, the asker of a reply and the request that another entity's operation sends all hold a `Key`.
  `rehearsal.pending` gives its key so too. Nothing parses a key's text to find its name or its parameter.
- **The machine indexes its records by a text it never reads back.** `Stored.keys` and `Machine.running` are records
  by `keyText(key)`: the JSON of `[name]` for a key without a parameter, and of `[name, parameter]` for one with a
  parameter. Each record of `Stored.keys` carries its `Key`, which is what leaves the machine. The two shapes of
  array never give the same text, so a name that reads as the JSON of a key with a parameter is a key of its own.
- **A declared name may start with `[`.** The check of `checkProgram` is gone.
- **A key is stored in two columns.** `entity_keys` holds the name in `key` and the parameter's JSON in
  `parameter`, and both are in its primary key. A key without a parameter has `''` in `parameter`. No JSON text is
  empty, so `''` is never a parameter's. `parameter` is `NOT NULL`, since SQLite takes a `NULL` in the primary key of
  a table with a rowid, and two rows of one key could then stand side by side. The rows of an internal message in
  `mailbox` and of an asker in `replies` hold the key in the same two columns. A suspension's `on` and a stored
  request hold the key as the JSON `{ "name": …, "parameter": … }`.
- **The idempotency key keeps its format.** `idempotencyKey` writes it with `JSON.stringify`, from the name, or from
  the name and the parameter: `["Order","o-1",["charge","line-7"],4]` and `["Order","o-1","fee",4]`, as before.

## What it rests on

- That no two keys share an index of the machine's records. The index is the JSON of a one-element array for a key
  without a parameter, and of a two-element array for one with a parameter. **Tested**: `a name that reads as the
  JSON of a key with a parameter is a key of its own`, in [`src/machine.test.ts`](../../src/machine.test.ts),
  declares the name `["charge","a"]` beside `charge`, and finds two keys.
- That a key without a parameter and a parameter whose JSON is `null` or `""` are three rows. **Tested**: `a key is
  stored as its name and its parameter, apart from a key of the same name without one`, in
  [`src/storage.test.ts`](../../src/storage.test.ts), writes and loads the four keys, an internal message, a
  suspension, and replies kept for each, and deletes the row of one alone.
- That a `NULL` in a primary key column of a table with a rowid is no conflict in SQLite. **Documented** in SQLite's
  page on `CREATE TABLE`, under the primary key, as a fault kept for compatibility. The decision does not rely on it
  being so: the column is `NOT NULL`, which holds either way.
- That the JSON of a parameter keeps its order of fields through storage. `JSON.parse` gives the fields of an object
  in the order of the text, and the text was written in order. An object puts its integer-like fields first, in
  numeric order, whatever order they are written in, and does the same where the machine builds the parameter, so a
  parameter is the same value before and after storage. **Only reasoned**; the test above gives a record as a
  parameter.
- That the idempotency key is the one decision 0132 wrote. **Tested**: the digests of
  [`src/program.test.ts`](../../src/program.test.ts) and the readable keys of `holds a piece of work for each
  parameter, under the name and the encoded parameter` are unchanged.

## Alternatives

- **The name and the parameter flat on each value**, `{ key: 'charge', parameter: 'a', incarnation }`. A test of a
  key without a parameter would read as before. Every function that takes a key would take two arguments, and a
  request or an asker, whose `name` is another thing already, would hold a key in two of its fields.
- **The text kept, with a separator no name holds.** It is the convention this note removes, with another
  character.
- **A key without a parameter stored with a `NULL` parameter, in a `WITHOUT ROWID` table or under a unique index.**
  Either refuses two rows of one key. A comparison with `NULL` is never true in SQL, so each delete and each check
  of an asker would test for `NULL` apart.

## Consequences

- The record of a run under a key in `src/machine.ts` is `Run`, no longer `Key`, and carries its key.
  `Machine.Held` holds each piece of work with its key.
- `Waiting`, the asker of a reply and `Suspension` of the storage give the key as a `Key`.
- The tables changed. The library is not released, so no stored entity is migrated, as decision 0132 says.
