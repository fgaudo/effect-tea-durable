# 0139. The projection is JSON, and `project` converts

**Status:** accepted, 2026-11-05. Changes [decision 0032](archive/0032-a-projection-is-a-row.md), whose query
gives the projections decoded and whose index converts a time of the projection to its milliseconds, and
[decision 0138](0138-the-log-publishes-topics.md), whose topic converts what it selects to JSON.

## Context

A projection has a schema, so that it is stored with a version and read through the migrations
([decision 0025](archive/0025-operations-and-projections-have-schemas.md),
[decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md)). A schema has two faces: the type the
program computes in `project`, and the JSON it encodes to. `Schema.DateTimeUtcFromMillis` gives a `DateTime.Utc` on
one face and a number on the other. `read` and `query` give the first face. An index gives a scalar, and a topic
gives JSON, so each of them converts the second face by hand: `examples/order` converts its deadline to
milliseconds in its index, and a topic that watches a time converts it in its selector
([decision 0138](0138-the-log-publishes-topics.md)).

A row of the log is to give the value its topic selects, and not the projection whole, so that a consumer has a
contract of its own, which the note after this one decides. A value selected from the first
face would then give a consumer a `DateTime.Utc` where `read` gives one, and one selected as JSON would give a
number where `read` gives a `DateTime.Utc`. One shape for every reader is simpler than a rule for each.

The design already leans one way. A query filters by milliseconds, as a stored time is
([decision 0032](archive/0032-a-projection-is-a-row.md)), and the projection departs from effect-tea's model
because a caller is remote and receives data ([`docs/design.md`](../design.md#where-it-departs-from-effect-tea)).

## Decision

- **The projection is JSON.** The type `project` gives, and the type of the projection's schema, is `Json`: `null`,
  a boolean, a number, a string, or a readonly array or record of such values. A branded string or number, a
  literal, a struct, a tuple and a tagged union are JSON. A `DateTime`, an `Option`, a `bigint` and a field that may
  be `undefined` are not.
- **`project` converts.** A time is its milliseconds, as a stored time is, and an absent value is `null` or a key
  left out. The state keeps the types the program's logic wants, and `project` is the one place the entity's
  contract is computed, so it is the one place the conversion is written.
- **The program is refused where it is declared.** `program(schemas)` and `part(schemas)` take a projection schema
  whose type is JSON, and the compiler refuses one that is not: `Projection extends Json` on both. A part's
  projection is JSON too, since the parent's projection holds it ([decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md)).
- **An index and a topic select JSON by construction**, and convert nothing. A topic's selector keeps its type
  `(projection) => Json`, which a selection of a JSON projection satisfies.

### What does not change

- **The projection keeps its schema.** The schema validates the row `read`, `query` and the log read, gives it a
  version, and is the written contract of the entity. Decoding a JSON schema checks the shape and converts nothing.
- **A migration of the projection is a function on its JSON**, as before. The JSON a projection encodes to is the
  same as before this note: `Schema.DateTimeUtcFromMillis` wrote milliseconds, and `Schema.Number` writes them. A
  row written before this note reads as it did.
- **`read` and `query` give the row as it is**, through the schema ([decision 0121](0121-a-read-answers-from-the-row-of-the-read-model.md)).
- **The other schemas are not constrained on their type.** A state, a message, an operation, a rejection and a
  sender keep the types the program wants, and encode to JSON, as [decision 0030](archive/0030-a-schema-encodes-to-json.md)
  decides. Their encoded face was JSON already: `Schema.Codec<_, Json>` refuses a schema whose encoded type holds
  `undefined` or an `Option`, in every schema of the program, which [`src/program.test.ts`](../../src/program.test.ts)
  checks of a `DateTime`.

## What it rests on

- That `Schema.Json` of the pinned version admits the type of a struct schema and refuses what JSON does not hold:
  **tested** by `a projection is JSON: a schema that decodes to a DateTime is refused where the program is declared`
  in [`src/program.test.ts`](../../src/program.test.ts), which declares a program and a part with a projection of
  numbers, and fails to compile one with a `DateTime`. Checked with the compiler on the pinned version for the
  rest: a struct of `readonly` fields, a brand, literals, an array, a tuple, a record, a tagged union and an
  `optionalKey` field satisfy `Json`; `DateTimeUtcFromMillis`, `Option`, `BigInt`, `optional` and `UndefinedOr` do
  not.
- That a caller in the process is served by JSON as well as by the decoded type: **only reasoned**. The boundary
  that answers a remote caller wants JSON, and a caller in the process converts in a line. The examples' tests read
  the projections in milliseconds.
- That the examples' projections keep their meaning in milliseconds: **tested**, by the tests of
  [`examples/booking`](../../examples/booking), [`examples/order`](../../examples/order) and
  [`examples/subscription`](../../examples/subscription), whose `deadline` and `paidUntil` were `DateTime`s.

## Alternatives

- **The projection decoded, with each index and topic converting**, as [decision 0138](0138-the-log-publishes-topics.md)
  took it. The conversion is written in every index and selector that reads a time, and a topic's value is JSON
  where `read` gives the decoded type.
- **A schema per topic**, `Projection.pick('deadline')`, with which the runtime encodes the selection to compare it
  and decodes it for the consumer. It gives every reader the decoded type, and selects fields only: a threshold or
  a nested value needs a function, so a topic would have two forms.
- **A projection checked at runtime**, with no constraint on the type. A program with a `DateTime` in its projection
  would learn it at its first step, as a defect, where the compiler says it at the declaration.

## Consequences

- `program(schemas)` and `part(schemas)` constrain `Projection` to `Json`, in [`src/program.ts`](../../src/program.ts),
  and [`src/program.test.ts`](../../src/program.test.ts) checks that a projection of a `DateTime` does not compile.
- [`examples/booking`](../../examples/booking), [`examples/order`](../../examples/order) and
  [`examples/subscription`](../../examples/subscription) give their times in milliseconds, converted in `project`,
  and the index of `order` converts nothing.
- `docs/design.md` says, under Reading, that the projection is JSON and `project` converts, and the table of the
  departures from effect-tea says the projection is JSON. The glossary's entry for the projection says so.
