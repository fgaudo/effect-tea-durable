# 0062. A row is read through a schema, or not at all

**Status:** accepted, 2026-10-31. Its consequence that the waker dies on a row it refuses is changed by
[decision 0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md): the waker goes on, and tries the entity again.

## Context

The JSON a column holds is read through the program's schemas, and a version no migration reads fails the call
that meets it ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)). The row around that JSON was
not read through anything. `load` gave a missing key as `''`, a missing incarnation as `0` and a missing cause
as `''`; it read a reply of any tag but `Accepted` as a rejection, and a queued message of any tag but `Inbound` as
internal; it cast `delivery`, and `published` cast an outbox row's kind. A row the runtime never writes — a
corrupted database, a hand-written fix, a bug of the storage — became a value the machine trusted, and what it
did with it was the machine's problem, which [decision 0061](0061-only-what-the-program-does-is-its-defect.md)
says is the runtime's, never the program's.

## Decision

- **Each table's row has a schema**, in [`src/storage.ts`](../../src/storage.ts), which says what the storage
  writes and nothing else: a version from 1, a count from 0, a tag among those written, and the columns that go
  together — a suspension's event with its cause, a key's delivery with its work, an inbound message with its
  request and an internal one with its key and incarnation, a reason only on a rejection, a message on every row
  of the outbox but a creation's.
- **Every reading goes through its table's schema**, the aggregates and the rows a `DELETE … RETURNING` gives
  included. A row it refuses fails the call that meets it with a defect that names the table and the program, as a
  row no version reads does, and the process goes on serving what it can read.
- Nothing is filled in and nothing is cast: what a schema gives is the type the machine reads.

## Alternatives

- **Checking only the columns a reading used to fill in or cast.** The others are as much the storage's to get
  wrong, and a schema per table states the whole row in one place, beside the `CREATE TABLE` it mirrors.
- **`CHECK` constraints in the tables.** They would refuse a bad row as it is written, which is better where the
  writer is a hand-written fix, but a database created before them keeps its rows, and the type the machine reads
  would still be a cast.

## Consequences

- A corrupted row crashes the entity that loads it at every activation, and fails the query, the feed or the
  waker that reads it, as a row no version reads does. The waker dying with it stays an open question
  ([an entity the waker cannot load](../open-questions.md#running)).
- A change to what the storage writes is a change to its row's schema, which a storage test reads back.
