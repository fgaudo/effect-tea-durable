# 0132. A key may take a parameter

**Status:** accepted, 2026-11-04. Decides the open question on work under many keys, which
[decision 0033](archive/0033-a-program-declares-its-keys.md) left open. Changes decision 0033, the checks of
[decision 0037](archive/0037-the-machine-checks-the-declared-keys.md) and
[decision 0054](archive/0054-a-program-is-checked-where-it-enters.md), and the counter of
[decision 0004](archive/0004-incarnations-guard-internal-messages.md). A key is a name and a parameter as data, not
the text `["charge","line-7"]`, and a name may start with `[`, since
[decision 0136](0136-a-key-is-a-name-and-a-parameter-as-data.md).

## Context

A program declares every key it holds work under, and the space of keys is finite
([decision 0033](archive/0033-a-program-declares-its-keys.md)). An order that charges each of its lines apart has
nowhere to put one operation per line. Decision 0033 sent such items to entities of their own. An entity is the
unit of storage and of concurrency, so a line that must change in the same step as its order cannot be one.

effect-tea holds the same work under keys a state computes. Its children by id keep their subscriptions under
`[<child>, id, key]`: the child and its key are declared, and the id is data (the Guide, under Children by id). This
note gives the machine that shape of key. [Decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md)
builds children on it.

The machine kept a row for every key a state ever returned, also once its work was gone, so that the key's
incarnation never went back. Under keys a state computes, those rows would grow for as long as the entity lives. A
row cannot simply be forgotten either. A key that came back with incarnation 0 would be given the idempotency key of
its first run, and a service would take a new payment for the old one.

## Decision

- **A program declares its keys as a record.** Each name maps to the schema of its parameter, or to `null` for a key
  without one: `keys: { fee: null, charge: Schema.String }`. The name and the type of its parameter are declared in
  one place, as every other type of a program is
  ([decision 0035](archive/0035-one-place-where-a-program-is-declared.md)). A name cannot be declared twice, so the
  check of [decision 0054](archive/0054-a-program-is-checked-where-it-enters.md) for a key declared twice is gone.
- **Under a key with a parameter, `durable` returns a list of pairs.** Each pair is a parameter and the piece of work
  under it: `charge: state.lines.map((line) => [line.id, charge(line)])`. A list and not a map, since two parameters
  are the same when they encode alike, which a map does not compare. The names stay finite and declared, and the
  parameters are data. A key whose value is `undefined` holds no work, as a key left out does.
- **A parameter is compared by its JSON.** The machine reads a key with a parameter as the canonical JSON of its name
  and its encoded parameter, `["charge","line-7"]`, as it compares work by what is stored
  ([decision 0058](archive/0058-work-is-compared-by-what-is-stored.md)). A key without a parameter stays its name.
  That text is the key in the outputs, the mailbox, a suspension and a request an operation sends.
- **The idempotency key holds the key as JSON.** It reads `["Lines","l",["charge","a"],4]`, with the key's JSON in
  place and not a string of it. A key without a parameter is a string there, as before.
- **A name never starts with `[`.** The machine tells a key with a parameter from a name by its first character, so
  `checkProgram` refuses a name that starts with one, where the program enters.
- **What the machine checks.** A key whose name the program does not declare is a defect, as
  [decision 0037](archive/0037-the-machine-checks-the-declared-keys.md) says. So is a parameter its schema does not
  encode, two pieces of work whose parameters encode to the same JSON, no list under a key that takes a parameter,
  and anything in the list that is no pair.
- **An incarnation is drawn from one counter of the entity.** The counter is the last incarnation the entity drew,
  stored with the entity's row. Each piece of work that starts anew, under any key, draws the next one. An internal
  message is still dropped once its key's incarnation has moved on. Since the counter never goes back, no key is
  given an incarnation it was given before, also after its row is gone.
- **A key whose work is gone has no row.** The machine says which rows to delete in the step whose state no longer
  holds the key. The rows of an entity are then the work under way, however many parameters its states have held.
- **`rehearse` finds the work under a key by its name and its parameter.** `pending('charge', 'a')` takes the
  parameter for a key that has one, and no parameter for a key that has none, which the types enforce.

## What it rests on

- That an incarnation drawn from one counter keeps every rule a key's own counter keeps: a late message of an earlier
  run is dropped, and two runs of one key never share an idempotency key. **Tested**: `a key that leaves loses its
  row, and comes back in an incarnation no run of it had`, in [`src/machine.test.ts`](../../src/machine.test.ts),
  takes a key with a parameter and one without out of the state and back, and drops a late message of each first
  run. The properties of the machine check the same rules over random events.
- That nothing reads the row of a key whose work is gone, other than to keep its incarnation. The readers of
  `entity_keys` in [`src/storage.ts`](../../src/storage.ts) are the load of an entity, the check that a reply's asker
  still holds its work, and the waker's two queries. **Tested** for the first two: `the work that ended takes the
  replies to its requests with it, and no others`, in [`src/storage.test.ts`](../../src/storage.test.ts), deletes a
  row, finds the reply gone and loads the entity without the row. **Only reasoned** for the waker's queries: each
  selects by `due`, which a row has only with the timer it holds.
- That the canonical JSON of an encoded parameter is the same in every process and every version that encodes it
  alike. **Tested**: `a parameter is compared by its JSON: one that encodes alike keeps its work` gives a parameter
  whose schema is a record, written in two orders of its properties, and nothing starts again.

## Alternatives

- **Every item an entity of its own**, as decision 0033 says. An item that must change in the same step as its
  parent cannot be one, since an entity is the unit of storage: the parent and the item would agree through
  messages, and every rule that holds across them would be a protocol.
- **A key a program computes as a string.** It needs no schema, and loses what decision 0033 is for: a misspelt name
  is a new key, which no type and no check sees.
- **The keys an array, and the schemas of the parameters in a record beside it.** No program written before this note
  would change. Two lists must then agree, and a name in one and not the other is a declaration the types let
  through, which the check would refuse at run time.
- **The work under a key with a parameter as a `HashMap`**, as effect-tea keys its subscriptions. It compares by
  `Equal`, where the machine compares by the JSON stored, so two parameters could be one key for the program and two
  for the machine.
- **The row of a key kept for ever.** Its incarnation never goes back, and the rows grow with every parameter an
  entity has held.
- **A count of the runs in the parameter**, written by the program. It gives the program the attempt numbers
  incarnations exist to keep out of it ([decision 0004](archive/0004-incarnations-guard-internal-messages.md)).

## Consequences

- `Types` gains `parameter`, the parameter of each key that takes one, and `Work` the list of pairs. `Keys` is the
  type of the declaration, exported with the library.
- Every program declares its keys as a record. The examples and the tests changed with this note.
- An incarnation is no longer a count of one key's runs, so the incarnations of a program's keys, and its idempotency
  keys, are not those it had before. The library is not released, so no stored entity is migrated: the tables
  changed. `entities` has a column `incarnations`, and `work` in `entity_keys` is never null. The recorded cases of
  the migrations ([decision 0126](0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md)) record a
  state's JSON, which does not change, and stay as they are.
- An entity may hold as many operations at once as its state gives parameters. Where that stops being an entity is
  the open question on [large states](../open-questions.md#storage-and-reading), which
  [decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md) and
  [decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) take up.
