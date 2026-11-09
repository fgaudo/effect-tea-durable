# Schemas that change

This page changes a program whose entities are already stored. Its code is the bike of
[`examples/rental`](../../examples/rental/bike.ts), whose version 2 counts its rides, and
[`bike.test.ts`](../../examples/rental/bike.test.ts), which checks the migration. `bun test` runs both. Read the
guide's [first page](README.md) before it: this page uses its words for a state, a projection and an operation.
The words in bold are defined in [`glossary.md`](../glossary.md), and
[`design.md`](../design.md#schemas-that-change) is the specification behind each rule.

## Contents

- [The requirement](#the-requirement)
- [What needs a migration](#what-needs-a-migration)
- [A migration is a function on the JSON](#a-migration-is-a-function-on-the-json)
- [How a stored row is read](#how-a-stored-row-is-read)
- [Work under way](#work-under-way)
- [Recording what a migration does](#recording-what-a-migration-does)
- [No way back](#no-way-back)
- [Renaming a program](#renaming-a-program)
- [The rules, in one list](#the-rules-in-one-list)

## The requirement

The rental has run for a while, and its database holds bikes. The business adds a requirement:

- The operator's page shows how many rides each bike has had, to plan its service.

The bike's states gain a count, which a ride adds to when it docks:

```ts
const Rides = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const State = Schema.Union([
  Schema.TaggedStruct('Docked', { centsPerMinute: Rate, rides: Rides }),
  Schema.TaggedStruct('Ridden', { centsPerMinute: Rate, rides: Rides, ride: Schema.String }),
])
```

The projection gains `rides` too, and `project` copies it. The bikes stored hold no `rides`.

## What needs a migration

A program's schemas are what is stored. A new version of the program finds in the database the JSON the version
before it wrote, and decodes it with its own schemas. **A change needs a migration when the new schema cannot
decode what the old one wrote.** A field added that the schema requires is such a change, and so is a field
renamed, or a type changed.

Some changes need none, since the old JSON still decodes:

- a case added to a union, such as a state `Withdrawn` for a bike under repair;
- a field made nullable, or optional;
- a check that accepts more values than before.

A check that accepts fewer values needs a migration, or an entity stored with a value it refuses can no longer be
read.

## A migration is a function on the JSON

The bike declares its first migration:

```ts
/** A value version 1 wrote, with the count of rides it did not have. */
const withNoRides = (json: Json): Json => ({ ...json as Readonly<Record<string, Json>>, rides: 0 })

// in the bike's declaration
migrations: [{ state: withNoRides, projection: withNoRides }],
```

`migrations` is a list, in order. The first migration reads version 1 as version 2, the second reads version 2 as
version 3, and so on. **A program's version is how many migrations it carries, plus one**, so the bike is now
version 2, and there is no version number to declare or to forget.

A migration is a record of pure functions, **from the JSON a version wrote to the JSON the next version reads**,
one for each kind of stored value: `state`, `operation`, `inbound`, `internal`, `rejection`, `sender` and
`projection`. A kind left out is unchanged, so the bike's messages and reasons are read as they were. A migration
works on the JSON, which every schema encodes to, as the schema encodes it: a `DateTimeUtcFromMillis` is a number,
and the children of a parent are inside the parent's state, where its schema puts them. A part has no migrations:
the parent's read its children too, a child's messages wrapped in the parent's `inbound` and `internal`. So the
types and the schemas of version 1 do not live on in the code. `Json` is the type of
`@fgaudo/effect-tea-persistent/program`.

A migration gives only what the old version knew. Version 1 never counted rides, and a migration cannot know how
many a bike had. The business accepts that rides are counted from the deploy of version 2, so the migration gives
0. A migration that needs a value the old JSON does not hold, and that no default can stand for, is a sign that the
change is a new field the state fills from then on, not a field of every state.

The projection has a migration of its own, and it gives what `project` gives of the migrated state. A row of the
read model that version 1 wrote is then read as version 2 would write it.

## How a stored row is read

Every row carries the version that wrote it. The runtime reads a row by migrating its JSON from that version to the
program's, and decoding it with the program's schema. So the program sees values of its own version only, and
`update`, `work` and `project` are written for version 2 alone.

A row is written again at the program's version only when an event changes it. A bike that takes no step after the
deploy keeps the state version 1 wrote, migrated at every read. The read model works the same way: a query reads
each row through the projection's migrations. An index that version 2 adds or changes is computed only when a row is
written, so an operator runs `reindex` after such a deploy, and every row of the read model is written again.

## Work under way

A bike has no operation. A ride has three, and a deploy may find one under way, stored by the version before. **An
operation under way, migrated, must be the one the new `work` computes from the migrated state.** A ride whose
email is under way holds `EmailStart` under the key `email`. A version 2 that added a `subject` to `EmailStart`
would migrate the stored operation to the same `subject` its `work` computes. A migration that gives anything
else suspends the entity when it is activated, since the runtime would otherwise run a second, different email.

A timer has done nothing yet, so a timer the new `work` computes differently is new work, which starts again. A
message waiting in an entity's mailbox is read through its `inbound` or `internal` migration.

## Recording what a migration does

**A program keeps every migration it ever had.** A row is migrated only when it is written again, so a bike that
version 1 wrote may still be stored when the bike is version 9, and is read through all eight migrations. **A
migration once deployed is never changed**, since it is how the rows of its version are read.

A test records cases of each migration when it is written: the JSON a version wrote, of one kind, and the JSON
the next version reads of it. `migrationViolations` checks the program against them:

```ts
const cases: ReadonlyArray<MigrationCase> = [
  {
    from: 1,
    of: 'state',
    written: { _tag: 'Docked', centsPerMinute: 20 },
    read: { _tag: 'Docked', centsPerMinute: 20, rides: 0 },
  },
  // …, the state Ridden, and the projection
]

test('the bike reads what each version before it wrote', () => {
  expect(migrationViolations(bike, cases)).toEqual([])
})
```

A case fails as `Changed`, with what the migration now gives as `got`, and as `Failed`, with a `reason`, when the
migration, a migration after it or the program's schema dies on what was written. A kind that a migration changes and no case
records fails as `Unrecorded`, so a migration nobody recorded is not changed in silence. A later version adds
cases of its own migration, and keeps the bike's cases: each one still has to be read at the newest version.

## No way back

A row written by a version the program does not have is not read at all. Once version 2 has written a bike, a
deploy of version 1 fails each call that meets that bike, and serves the bikes it can read. A deploy of version 1
that must start again the work of an entity version 2 wrote dies. So a deploy is not
undone by deploying the version before. A fault found after a deploy is fixed by a version 3, whose migration reads
what version 2 wrote.

## Renaming a program

A program's name is stored with each of its entities. A program is renamed by its launch:

```ts
const runtime = yield* launch({ renames: { Bike: 'Cycle' } })
const cycles = yield* runtime.deploy({ ...bike, name: 'Cycle' })
expect(yield* cycles.read('bike-7')).toMatchObject({ status: 'Docked', centsPerMinute: 20 })
```

The program then carries its new name, `name: 'Cycle'`, here given by the deploy, and written in its declaration
once the old name is gone. The launch moves every row of the old name to the new one,
in one transaction, before any deploy. A reply stored for a request of the old name names the new name, so a
caller's retry and an entity's request sent again still find their replies. An entity keeps the idempotency keys
of its work, so an operation under way runs again under the key it was given. A state that holds an address of the
old name is the program's data, which a migration of its own moves.

A rename whose old name holds nothing moves nothing, so it may stay in the launch for as long as a database of the
old name may be launched. A program renamed twice names both its former names: `{ Bike: 'Vehicle', Cycle:
'Vehicle' }`. A deploy of a program under a name the launch renames dies, since it is the old program.

## The rules, in one list

1. **A change needs a migration when the new schema cannot decode what the old one wrote.** A case added or a
   field made optional needs none.
2. **A migration is a function from the JSON a version wrote to the JSON the next version reads**, by kind, and a
   program's version is how many migrations it carries, plus one.
3. **A migration gives only what the old version knew**, and the projection's migration gives what `project` gives
   of the migrated state.
4. **An operation under way, migrated, is the one the new `work` computes.** Anything else suspends the entity.
5. **A program keeps every migration, and never changes one once deployed.** A test records cases of each, and
   `migrationViolations` checks them.
6. **A deploy is not undone by the version before.** A fault is fixed by the next version.
7. **A program is renamed by its launch**, and keeps its entities, their replies and their keys.
