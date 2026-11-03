# 0033. A program declares its keys

**Status:** accepted, 2026-10-30.

## Context

`durable(state)` returned `Record<string, Durable<…>>`, so any string was a key. A key misspelt in one state
and right in another is not a mistake the runtime can see: the key the state no longer holds ends its work, and
the misspelt one starts work anew, under its own idempotency key. Nothing in the types said which keys a program
holds work under, `rehearse`'s `pending(key)` took any string, and nothing stopped a program from computing its
keys — one per line of an order — which would be an entity running as many operations at once. Whether the space
of keys is finite and declared was an [open question](../../open-questions.md), and the first step of the
[roadmap](../../roadmap.md) asked it, since the answer belongs where a program is declared
([decision 0035](0035-one-place-where-a-program-is-declared.md)).

## Decision

- A program **declares every key it holds work under**, as `keys`, and `Types` gains a `key` slot for them, as
  it holds the tags of the operations and the names of the indexes
  ([decision 0018](0018-operations-are-data.md), [decision 0032](0032-a-projection-is-a-row.md)).
- `durable` returns work under those keys and no others: `Work<Key, Operation, Message>`, where every declared
  key is optional and nothing else is a key. The space is finite, and a key a program computes is not one.
- `rehearse`'s `pending(key)` takes a key the program declared, so a scenario naming a key it never holds does
  not compile.
- The machine is unchanged. It reads the work of a state by key, as before, and the keys it compares are the
  ones `durable` returned: `keys` is what the program says, and the types are where it is checked.

## Alternatives

- **The space inferred from `durable`**, with nothing declared. It costs no duplication and checks nothing: a
  misspelt key only widens the space it is inferred from, which is the mistake this decision is about.
- **A total record, one entry per key, `null` for no work.** Exact — a misspelt key is a missing one, which no
  assignment hides — and it makes every state name every key, five entries in each of an order's six states,
  where the state that holds no work says `noWork` today.
- **The machine checking the keys** of `durable` against the declared ones, and suspending the entity on one it
  does not declare. It would catch every misspelling, at the first step that returns it, and it is a rule of the
  machine, which this step of the roadmap does not touch. It stays an [open question](../../open-questions.md).
- **Keys left open**, so that a program may hold one operation per line of an order. The entity is the unit of
  concurrency, and a collection whose items each run work wants to be entities of its own, as a large state does
  ([decision 0032](0032-a-projection-is-a-row.md)). Work under many keys stays an
  [open question](../../open-questions.md).

## Consequences

- A program with no work of its own declares `keys: []`, as it returns `noWork` and declares `indexes: {}`.
- TypeScript catches a misspelt key where the state holds that key alone, since a record of optional keys shares
  none of them. A state that holds a declared key **and** a misspelt one is still accepted: the type is
  satisfied by the declared one. A machine that checked the keys would close it, which is the open question
  above.
- A new version of the program that renames a key changes the program's type, which a rehearsal's `deploy` and
  a runtime's `resume` see. At runtime a renamed key was already new work, and dropping the key of an operation
  under way a defect ([decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md),
  [decision 0022](0022-a-new-program-keeps-what-work-started-with.md)).
- `keys` is data the machine does not read. An operator's tool, or the check above, is what would.
