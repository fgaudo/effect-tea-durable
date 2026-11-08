# effect-tea-persistent

The Elm architecture for long-lived entities on a server: an order, a booking, a job, each addressed by its id,
whose state is stored in SQL, on SQLite or PostgreSQL, and survives crashes, restarts and deploys. A program is written as in
[effect-tea](https://github.com/fgaudo/effect-tea), with a pure `update`, and tested without a database, a
cluster or a clock.

An entity keeps one **state**. A pure **`update`** changes it in response to messages. There are no commands:
the work under way — operations, as data, and timers — is derived from the state by **`work`**, by key, and
answers with messages of the same incarnation. Callers read a **projection**, made from the state, which is
also the row a query reads and what the outbox publishes, by **topic**: a part of the projection, written when it
changes, and read as that part.

```mermaid
flowchart LR
  caller -->|create, with flags| init
  init -->|Created or Rejected| caller
  init --> state([state])
  caller -->|inbound message, with a request id| bound{within the bound of callers' messages}
  bound -->|yes| update
  bound -->|no: Full| caller
  update -->|Accepted, Rejected or Suspended| caller
  update --> state
  update -->|wrapped message| child[a child's update]
  child -->|raised event| onEvent
  onEvent --> state
  child --> state
  state --> work[work, by key, the children's included]
  work -->|operations| runner[runners]
  work -->|timers| timers
  runner -->|completion, same incarnation| update
  timers -->|firing, same incarnation| update
  runner -->|send, create| other[another entity]
  state --> project
  project -->|projection| read[read, query, count, sum, countBy]
  project -->|a row in each topic whose selection changes| outbox
```

## Quick start

A seat held for a quarter of an hour, confirmed in time or released when the time runs out. The program is
[`examples/quick-start/hold.ts`](examples/quick-start/hold.ts):

```ts
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import { noWork, program, reject, timer } from '@fgaudo/effect-tea-persistent/program'

// A seat held for a quarter of an hour: confirmed in time, or released when the time runs out.
const State = Schema.Union([
  Schema.TaggedStruct('Held', { until: Schema.DateTimeUtcFromMillis }),
  Schema.TaggedStruct('Confirmed', {}),
  Schema.TaggedStruct('Released', {}),
])

export const hold = program({
  state: State,
  flags: Schema.Null,
  inbound: Schema.TaggedStruct('Confirm', {}),
  internal: Schema.TaggedStruct('Expired', {}),
  projection: Schema.Struct({ status: Schema.Literals(['Held', 'Confirmed', 'Released']) }),
})({
  name: 'Hold',
  keys: ['expiry'],
  init: (_, at) => ({ _tag: 'Held', until: DateTime.add(at, { minutes: 15 }) }),
  // `Expired` arrives only while the state holds its timer, so only while the seat is held.
  update: (message) => (state) =>
    message._tag === 'Expired' ? { _tag: 'Released' } : state._tag === 'Held' ? { _tag: 'Confirmed' } : reject,
  // The timer is data, derived from the state: a confirmed seat holds none, and nothing has to cancel it.
  work: (state) => (state._tag === 'Held' ? { expiry: timer(state.until, { _tag: 'Expired' }) } : noWork),
  project: (state) => ({ status: state._tag }),
})
```

Its rehearsal fires the timer without waiting for it, and its launch stores the seat in SQLite, in
[`examples/quick-start/hold.test.ts`](examples/quick-start/hold.test.ts), which `bun test` runs:

```ts
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { launch } from '@fgaudo/effect-tea-persistent'
import { rehearse, rejected } from '@fgaudo/effect-tea-persistent/testing'
import { hold } from './hold.ts'

// Rehearsed, without a database or a clock: the timer fires because the test fires it.
test('a seat nobody confirms in time is released', () =>
  Effect.runPromise(rehearse(
    hold,
    { flags: null, at: DateTime.makeUnsafe('2026-11-08T10:00:00Z') },
    Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.fire('expiry')
      expect(yield* rehearsal.send({ _tag: 'Confirm' }, null)).toMatchObject(rejected)
      expect(yield* rehearsal.projection).toEqual({ status: 'Released' })
    }),
  )))

// Launched on SQLite: the state is stored, and a retry of a request is answered as the first time.
test('a seat confirmed in time is confirmed once', () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const holds = yield* runtime.deploy(hold)
    yield* holds.create('seat-12', null, { requestId: 'hold-1', sender: null })
    const confirm = { requestId: 'confirm-1', sender: null }
    expect(yield* holds.send('seat-12', { _tag: 'Confirm' }, confirm)).toEqual({ _tag: 'Accepted' })
    expect(yield* holds.send('seat-12', { _tag: 'Confirm' }, confirm)).toEqual({ _tag: 'Accepted' })
    expect(yield* holds.read('seat-12')).toEqual({ status: 'Confirmed' })
  })).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })))))
```

An operation, the work a program asks of the world with an idempotency key, is shown by
[`examples/order`](examples/order), and each piece of a program by [`docs/design.md`](docs/design.md).

## Why

An entity that lives in time, an order waiting for its payment or a booking held until a deadline, has the
costly bugs: a timer that fires after a cancellation, a retry that pays twice, a process that died halfway
through. The code that prevents them is the same for every entity: a request applied once, a timer that survives
a restart, work resumed after a crash with the key a provider needs to act once, an outbox, a version that reads
what the one before stored. This library writes it once, so that a program holds only its use case. A row with
no life of its own, a profile or a product, does not need it.

- **The state is the only truth.** There are no commands and no history to replay: the work under way is derived
  from the state, by `work`, and a state that holds no timer has no timer. A cancellation is a state change,
  and the timer follows.
- **Time is a value.** A timer is data, derived from the state, and a test fires it instead of waiting for it: a
  deadline a month away is tested as fast as one a second away.
- **A program is read in one place.** `update`, `work` and `project` are pure functions over data, with
  nothing of storage, locks, retries or timers in them, and the scenarios read as the use case does, crashes
  included. Whoever writes a program can get only the use case wrong, and a type error or a failed scenario says
  so without a database or a clock. What holds where the process may die is checked once, in the library.
- **One model, in the browser and on the server.** A program is written as in effect-tea: who writes the Elm
  architecture for a screen writes it the same way for an order. [`src/program.ts`](src/program.ts) imports no
  module of Node or of Bun, so a browser imports a program's schemas from it
  ([decision 0192](docs/decisions/0192-the-digest-of-a-key-is-computed-by-the-machine.md)).

**This repository holds a design, its pure core, and a runtime on SQLite or PostgreSQL that runs on one process.** It has:

- [`docs/design.md`](docs/design.md): what the library is for, its model of execution, and what it guarantees
  at each point where the process may die;
- [`src/`](src): the one place a program is declared, with its types and the migrations of its schemas
  ([`src/program.ts`](src/program.ts)), the runtime's semantics as a pure state machine
  ([`src/machine.ts`](src/machine.ts)), which `rehearse` runs and property tests check, and the runtime that
  interprets it over `SqlClient` ([`src/runtime.ts`](src/runtime.ts) and the modules it is divided into,
  [`src/storage.ts`](src/storage.ts)),
  unloading an entity that has nothing to do and waking it from its stored timers, tested by dying at each point
  of the design's crash table and comparing where it ends with the machine
  ([`src/runtime.test.ts`](src/runtime.test.ts));
- [`docs/decisions/`](docs/decisions): one note per decision, with the alternatives it rejected, listed by what
  they decide in [its index](docs/decisions/README.md);
- [`docs/glossary.md`](docs/glossary.md): the words of the design, each defined once;
- [`docs/open-questions.md`](docs/open-questions.md): what is not decided yet;
- [`docs/roadmap.md`](docs/roadmap.md): the steps from this design to a library, in order;
- [`examples/quick-start`](examples/quick-start): the quick start, a seat held until a deadline;
- [`examples/order`](examples/order): an order's lifecycle, with its scenarios as tests, the question a
  query across entities answers — which orders nobody paid, how many, and what they owe — what each of its steps publishes for other
  systems, and a report built from the log, how many orders are in each status
  ([`examples/order/runtime.test.ts`](examples/order/runtime.test.ts)), and the orders on a runner of Effect Cluster
  ([`examples/order/cluster.test.ts`](examples/order/cluster.test.ts)). If an example reads badly, the
  API is wrong;
- [`examples/subscription`](examples/subscription): a subscription billed every month, which never ends;
- [`examples/cart`](examples/cart): a cart whose lines are children by id, each reserving its own stock;
- [`examples/booking`](examples/booking): a booking that holds seats in an event's inventory, two entities
  that talk, rehearsed and also run on the runtime
  ([`examples/booking/runtime.test.ts`](examples/booking/runtime.test.ts));
- [`examples/server`](examples/server): the orders served over HTTP by a runner of Effect Cluster, run as a
  process, which a test kills during a charge and starts again on the same file. A second test runs two runners
  on one file, kills one during its charges, and the other one finishes its orders.

The modules of `src/`, each built on the one above it:

```mermaid
flowchart TB
  program["program.ts: program(schemas)(…), with init, update, work,<br/>operations, project, indexes and migrations;<br/>part, child and each, which compose children"]
  machine["machine.ts: the pure machine, from an event<br/>to the next machine and the rows it writes"]
  rehearse["rehearse.ts: a scenario without storage or clock,<br/>of one entity or of a world"]
  testing["testing.ts: the checks of a program's migrations and projections,<br/>and the scheduler that moves where the fibers of a test yield"]
  subgraph runtime["the runtime"]
    launch["runtime.ts: launch and deploy, a deployment's handle,<br/>settled and the planned stop"]
    callers["callers.ts: create, send, resume and discard,<br/>and the Entities an operation sends with"]
    loop["loop.ts: an entity's loop, under its own lock:<br/>its steps, fibers, timers, passivation and crash"]
    doors["doors.ts: on Cluster, the step of a door, settled by the count of steps,<br/>and a singleton per shard that activates and crashes its entities"]
    waker["waker.ts: the waker of the stored timers"]
    readings["readings.ts: the readings of the log that wait for a commit"]
    process["process.ts: what the runtime of one process holds,<br/>which its modules share"]
  end
  cluster["cluster.ts: on Effect Cluster, the Sharding of a runner,<br/>built once its versions are recorded, its RunnerHealth,<br/>the door of each program, which steps at the newest version,<br/>the client every request is sent through,<br/>and launch, the runtime of a runner"]
  storage["storage.ts: the tables, each named with tea_: entities, entity_keys,<br/>mailbox, replies, projections, publications, outbox, log, heads,<br/>consumers and cursors; on Cluster, versions, runner_versions,<br/>waiting, sent_requests and given_requests"]
  db[(SQLite or PostgreSQL)]
  entries["the package's four entries: index.ts, the main one;<br/>index.program.ts, what declares a program; index.testing.ts,<br/>rehearse and the checks; index.cluster.ts, the runtime on Cluster"]

  program --> machine
  machine --> rehearse
  program --> testing
  machine --> runtime
  program --> cluster
  runtime --> storage
  cluster --> runtime
  cluster --> storage
  storage --> db
  rehearse --> entries
  testing --> entries
  cluster --> entries
  runtime --> entries
```

```sh
bun install
bun run typecheck
bun test
```

The name is a working one. The library will be separate from effect-tea, which it shares ideas with but no
code. It depends on Effect's unstable modules, `effect/sql`, `effect/cluster`, `effect/rpc` and `effect/workflow`,
and is released as experimental, not for production, as long as it does: an API that changes under it costs an
update of the runtime, never of the pure core or of a program.

## License

MIT
