# 0132. A key may take a parameter

**Status:** proposed, for the step Work under many keys of the [roadmap](../roadmap.md); rewritten in place while
the step is under way. Decides the open question on [work under many keys](../open-questions.md#programs), which
[decision 0033](archive/0033-a-program-declares-its-keys.md) left open, and changes decision 0033 and
[decision 0004](archive/0004-incarnations-guard-internal-messages.md).

## Context

A program declares every key it holds work under, and the space of keys is finite
([decision 0033](archive/0033-a-program-declares-its-keys.md)). An order that charges each of its lines apart has
nowhere to put one operation per line. Decision 0033 sent such items to entities of their own. An entity is the
unit of storage and of concurrency, so a line that must change in the same step as its order cannot be one.

effect-tea holds the same work under keys a state computes. Its children by id keep their subscriptions under
`[<child>, id, key]`: the child and its key are declared, and the id is data (the Guide, under Children by id). This
note gives the machine that shape of key. [Decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md)
builds children on it.

The machine keeps a row for every key a state ever returned, also once its work is gone, so that the key's
incarnation never goes back (`Key` in [`src/machine.ts`](../../src/machine.ts)). Under keys a state computes, those
rows grow for as long as the entity lives. A row cannot simply be forgotten either. A key that came back with
incarnation 0 would be given the idempotency key of its first run, and a service would take a new payment for the
old one.

## Decision

The terms below are a draft, rewritten while the step is under way.

- **A key may take a parameter.** A program declares a key with a schema for its parameter, beside the keys it
  declares as names. Under such a key, `durable` holds a piece of work for each parameter it gives. The names stay
  finite and declared, and the parameters are data.
- **A parameter is compared by its JSON.** The machine reads a key with a parameter as the canonical JSON of its name
  and its encoded parameter, `["charge","line-7"]`, as it compares work by what is stored
  ([decision 0058](archive/0058-work-is-compared-by-what-is-stored.md)). A key without a parameter stays its name, so
  the idempotency keys of programs written today do not change.
- **What the machine checks.** A key whose name the program does not declare is a defect, as
  [decision 0037](archive/0037-the-machine-checks-the-declared-keys.md) says. So is a parameter its schema does not
  encode, and two pieces of work whose parameters encode to the same JSON.
- **An incarnation is drawn from one counter of the entity.** The counter grows by one each time a key's work starts
  anew, and is stored with the state. An internal message is still dropped once its key's incarnation has moved on.
  Since the counter never goes back, no key is given an incarnation it was given before, also after its row is gone.
- **A key whose work is gone has no row.** The machine deletes it in the step whose state no longer holds the key.
  The rows of an entity are then the work under way, however many parameters its states have held.

## What it rests on

- That an incarnation drawn from one counter keeps every rule a key's own counter keeps: a late message of an earlier
  run is dropped, and two runs of one key never share an idempotency key. **Only reasoned**: each rule compares a
  key's incarnation for equality, and a counter of the entity gives each run of each key a value no other run had.
  The step writes a test in [`src/machine.test.ts`](../../src/machine.test.ts) for a key that leaves, loses its row,
  and comes back, with a parameter and without one.
- That nothing reads the row of a key whose work is gone, other than to keep its incarnation. **Only reasoned**. A
  reply to an entity is kept while the work that asked holds
  ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)), and the storage looks for that
  work among the rows of `entity_keys` ([`src/storage.ts`](../../src/storage.ts)). The step reads every reader of
  the table again.
- That the canonical JSON of an encoded parameter is the same in every process and every version that encodes it
  alike. **Only reasoned**, on `canonical` in [`src/machine.ts`](../../src/machine.ts), which the machine already
  writes a request's text with. The step writes a test of a key whose parameter is a struct, encoded in two orders of
  its properties.

## Alternatives

- **Every item an entity of its own**, as decision 0033 says. An item that must change in the same step as its
  parent cannot be one, since an entity is the unit of storage: the parent and the item would agree through
  messages, and every rule that holds across them would be a protocol.
- **A key a program computes as a string.** It needs no schema, and loses what decision 0033 is for: a misspelt name
  is a new key, which no type and no check sees.
- **The row of a key kept for ever.** Its incarnation never goes back, and the rows grow with every parameter an
  entity has held.
- **A count of the runs in the parameter**, written by the program. It gives the program the attempt numbers
  incarnations exist to keep out of it ([decision 0004](archive/0004-incarnations-guard-internal-messages.md)).

## Consequences

- `Types` gains the parameters of its keys, and `Work` a shape for the work under a key with a parameter.
  `rehearse`'s `pending` takes a key and its parameter.
- An entity stored before this step has an incarnation per key and no counter. The library is not released, so no
  stored entity is migrated: the step changes the tables. The recorded cases of the migrations
  ([decision 0126](0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md)) record a state's JSON,
  which does not change, and stay as they are.
- The comment of `entity_keys` in [`src/storage.ts`](../../src/storage.ts) cites decision 0004 for the row a key
  without work keeps. The step moves the citation to this note.
- `docs/design.md` says under Durable work and Incarnations what a key and an incarnation are, and the glossary's
  entries on a key and an incarnation change with it.
- An entity may hold as many operations at once as its state gives parameters. Where that stops being an entity is
  the open question on [large states](../open-questions.md#storage-and-reading), which
  [decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md) takes up.
