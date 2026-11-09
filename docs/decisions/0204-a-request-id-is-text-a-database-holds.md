# 0204. A request id is text a database holds, and one that is not is the caller's defect

**Status:** accepted, 2026-11-09, with the step A caller's request id is text a database holds of the
[roadmap](../roadmap.md). Changes [decision 0053](archive/0053-what-a-handle-is-given-is-checked.md), whose handle
checks what it is given.

## Context

On PostgreSQL a request id that held U+0000 crashed its entity. The storage writes a caller's request id as it is,
in the column `request_id` of `tea_replies`, and reads a reply by it, in `reply` and `write` of
[`src/storage.ts`](../../src/storage.ts). PostgreSQL holds U+0000 in no text, so the statement failed. The entity
left the process, as on any write that fails, and its operations stopped. An at-most-once operation under way then
delivered its `unknown`. A handle's `create` and `send` checked the id of the entity and not the id of the request.
So a boundary that takes the request id from its caller let that caller stop the operations of any entity. On
SQLite a lone surrogate in a request id is given back as U+FFFD for each of its bytes, so that a retry finds no reply
([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)).

## Decision

- **A request id is text a database holds.** `requestIdFault` in [`src/program.ts`](../../src/program.ts) says why
  a value is no request id. It asks `isText`, the rule of
  [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md), and refuses a value that is no string.
- **A request id may be empty.** The empty id is refused because the waker and `reindex` page the entities from it
  ([decision 0179](0179-an-id-is-not-empty.md)). Nothing pages by a request id, so the empty one is a request id.
- **A request id that is no text a database holds is the caller's defect, and nothing is read or stored for it.** A
  handle's `create` and `send` die with an `InvariantDefect` whose reason is
  `the request id is "…", which is no text a database holds`. The entity is not loaded, and its operations run on.
- **A rehearsal refuses the request ids the runtime refuses.** A rehearsal's `send` under such a request id fails
  the test with the same defect, so that a test passes only what a deployment runs.

## What it rests on

- That PostgreSQL holds U+0000 in no text: **tested** by the storage's tests of
  [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md), and seen again in the reproduction of
  this bug on PGlite.
- That every request id a caller gives enters by a handle's `create` or `send`, or by a rehearsal's `send`: **read
  in the code** of [`src/runtime.ts`](../../src/runtime.ts) and [`src/rehearse.ts`](../../src/rehearse.ts). On
  Cluster a caller goes through the same handle. An operation's request carries no request id of a caller's. The
  tests `a request id that is no text a database holds is the caller’s defect, and reaches no entity` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on both dialects, and
  `fails a send under a request id that is no text a database holds` in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts) **test** it, and each fails against the code before the
  change.

## Alternatives

- **The column holds the request id as JSON writes it.** JSON escapes U+0000 and a lone surrogate as text every
  database holds, so every string would be a request id. It changes what `request_id` holds, and every statement
  that reads it, for a request id no boundary has a reason to give. A database written before would need a
  migration of its replies. An id of an entity is refused on the same grounds, so a request id refused alike keeps
  one rule for both.
- **The empty request id refused too, as the empty id is.** It would refuse a request id that works, for a rule
  whose reason holds of entity ids alone.

## Consequences

- The design and the glossary list the request id among the text every database holds.
- A database written before this change may hold a reply under a request id with a lone surrogate, on SQLite. No
  release was made, so none is migrated.
