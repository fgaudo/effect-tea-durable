# Design

## What it is for

A server holds two kinds of state:

- **Rows that requests read and write**, with no life of their own: a profile, a product in a catalogue. A
  request handler is a function from the request to an effect, and the database keeps the state. This library
  is not for them: Effect's HTTP modules already are.
- **Entities that live in time**, whose state changes with events from outside and with the passing of time: an
  order waiting for its payment, a booking held until a deadline, a job with steps and retries. Their bugs are
  the costly ones: a timer that fires after a cancellation, a payment taken twice, a process that died halfway
  through. This library is for them.

An entity is addressed by its id, handles one message at a time, and its state survives crashes, restarts and
deploys. Its program is written as in effect-tea: a pure `update`, states that say which operation is under
way, `reject` for what may arrive and does not apply, a defect for what cannot arrive.

The same intuition is behind Erlang's `gen_server`, Akka Persistence and Restate's virtual objects. What this
library adds is effect-tea's discipline: everything that matters is in the state, and every behaviour is
tested by calling pure functions, crashes included.

## A program

| Piece        | What it does                                                                              |
| ------------ | ----------------------------------------------------------------------------------------- |
| `schemas`    | how the state, flags, messages, operations, reasons and projection leave the process      |
| `name`       | what the runtime stores the entity under, and what other entities see it as               |
| `keys`       | every key the work under way is held under                                                |
| `init`       | the first state, from the flags the entity is created with and the time of its creation   |
| `update`     | `(message, meta) => (state) =>` the next state, a rejection, or a defect                  |
| `durable`    | the work under way in each state, by key: operations, as data, and timers                 |
| `operations` | how each kind of operation runs, what it answers, and what a crash does to it             |
| `project`    | what callers read of the state, with the actions it allows                                |
| `indexes`    | what a query across the program's entities filters and orders by, read off the projection |
| `migrations` | how the versions before this one are read, in order                                       |

A program is declared in one place, `program(schemas)(…)`: the schemas first, which give every type the program
is written in, and then what it does. Everything else is inferred from the pieces — the keys `durable` may use,
the messages each kind of operation answers, the names a query may order by, and the services the operations run
in ([decision 0035](decisions/0035-one-place-where-a-program-is-declared.md)).

There are no commands. Every piece of work that must survive a crash is derived from the state by `durable`
([decision 0003](decisions/0003-durable-work-derived-from-state.md)). An operation is data, as effect-tea's
commands are, and its runner sees it, never the state
([decision 0018](decisions/0018-operations-are-data.md)). Everything that leaves the process has a schema: what
is stored, and the projection callers read
([decision 0025](decisions/0025-operations-and-projections-have-schemas.md)), and each of them encodes to what
JSON holds ([decision 0030](decisions/0030-a-schema-encodes-to-json.md)).

A state is an object, as in the Guide ([decision 0031](decisions/0031-a-state-is-an-object.md)). A tag is no rule
of the types, and the Guide's one state machine per concern is how the examples are written: it is also what
gives `durable` and `project` a case to match on.

Nothing that crosses the library is mutated: the program and its schemas, its states, flags, messages,
operations, timers and projections, and what the library gives back. A new value is a new object, as the Guide
says of a state. The library relies on it — a step whose next state is the same object stores nothing callers
read, and an operation changed in place is never seen to change — and, as for purity, checks nothing of it
([decision 0052](decisions/0052-what-crosses-the-library-is-never-mutated.md)).

A program is checked where it enters — `deploy`, which a fix is too, and `rehearse` — before anything is stored
or run: one whose name is empty, which declares a key twice, or one of whose indexes is not a word, is
refused. The check is pure and made once, since a program is never mutated
([decision 0054](decisions/0054-a-program-is-checked-where-it-enters.md)).

[`examples/order/order.ts`](../examples/order/order.ts) is a whole program.

## Messages

A message is one of two kinds, and the rule for a message that does not apply follows from its kind.

- **Inbound** messages come from callers. Each one carries a request id chosen by the caller, and is answered
  `Accepted` or `Rejected`, with the reason `update` gave, if any
  ([decision 0010](decisions/0010-a-rejection-may-carry-a-reason.md)). A caller that retries with the same id
  gets the same answer, and the message is applied once. Request ids are their sender's: another entity's are
  stored under its address, apart from everyone else's
  ([decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)), and a caller's under its sender, as the
  program's schema writes it ([decision 0048](decisions/0048-a-callers-request-belongs-to-its-sender.md)). A
  request is a value — a caller's sender and request id, or the run of another entity's operation and the name it
  gave — stored as its schema writes it, and never parsed out of a string
  ([decision 0059](decisions/0059-a-request-is-a-value.md)).
  `meta.from` says who sent it, read off the request, so that
  `update` decides who may do what. An inbound message may arrive in any state: a slow client, a retry, a second
  device, a malicious caller. One that does not apply is rejected.
  A caller may be another entity's operation: `meta.from` is then `Entity`, with the sender's name and id,
  filled in by the runtime (see [entities that talk](#entities-that-talk)).
- **Internal** messages come from the entity's own durable work: an operation's completion, a timer's firing.
  The runtime delivers one only while its key is in `durable(state)`, in the same incarnation that sent it
  ([decision 0004](decisions/0004-incarnations-guard-internal-messages.md)). So an internal message in a state
  where its key is absent cannot arrive. `update` answers it with a defect.

`meta.at` is the time the runtime handles the message, read once, before `update`. A program that needs time
reads it there, and `update` stays pure. A timer's message is the fact that its time has passed: `update`
trusts it, and never compares `meta.at` with the deadline. Another node's clock may be a few milliseconds
behind.

An entity is created by a request of its own, with its flags, answered `Created` once and `AlreadyExists`
after. A message to an entity that does not exist is answered `NotFound`, and creates nothing
([decision 0012](decisions/0012-creation-is-a-request-of-its-own.md),
[decision 0017](decisions/0017-creation-in-the-machine.md)). A creation and a message may share a request id,
and each is answered apart ([decision 0050](decisions/0050-a-creation-is-answered-apart-from-a-message.md)).

## Durable work

`durable(state)` returns the work of the state, under the keys the program declares and no others: the space of
keys is finite, and a key a program computes is not one of them
([decision 0033](decisions/0033-a-program-declares-its-keys.md)). The types catch a key never declared; a
declared key beside a misspelt one they accept, so the machine checks what `durable` returns against `keys`
wherever it reads it, and a key the program does not declare is a defect
([decision 0037](decisions/0037-the-machine-checks-the-declared-keys.md)). So is an operation the program gives
no runner for, which a cast lets through
([decision 0054](decisions/0054-a-program-is-checked-where-it-enters.md)). The runtime compares the work with
the previous state's, as effect-tea compares subscriptions:

- a new key starts its work;
- a kept key leaves it as it is;
- a missing key ends it.

Work ends when its message is handled. In the step that handles it, its key counts as gone, so a next state
that returns it starts new work: that is how a timer repeats
([decision 0008](decisions/0008-delivered-work-is-done.md)).

Two kinds of work exist.

- **An operation** is a value of the program's own type, usually a `Schema.TaggedUnion`, which says what to do.
  The program's `operations` give a runner for each tag, which turns it into an effect that ends with one of the
  internal messages its kind of operation answers
  ([decision 0034](decisions/0034-an-operation-answers-the-messages-of-its-runner.md)). Expected failures become
  messages, as in effect-tea's commands. The runner says what a crash does to it
  ([decision 0011](decisions/0011-an-operation-declares-what-a-crash-does.md)): an idempotent
  one receives an **idempotency key** (the entity's program and id, the operation's key and its incarnation:
  [decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)), and passes it on; one that may
  act twice runs again; one that must act at most once is not run again after a crash, and delivers its
  `unknown` message.
  A restarted operation gets the same idempotency key. A new attempt in a later incarnation gets another. An
  operation leaves the state only through its completion: a step whose next state drops the key of an operation
  still running is a defect ([decision 0005](decisions/0005-an-operation-leaves-only-by-completing.md)).
- **A timer** delivers one internal message at a time. It may be dropped in any state, since it has done
  nothing yet.

A kept key keeps its work only if the work is the same as it is stored: an operation that encodes to the JSON of
the one under way, a timer at the same time whose message encodes alike. A property a schema does not declare is
not stored, and makes no difference: what a step compares is what a crash compares
([decision 0058](decisions/0058-work-is-compared-by-what-is-stored.md)). A timer that changes is armed again, as new work. An operation
that changes while it runs is a defect, as one dropped is: otherwise an operation restarted after a crash,
built from the stored state, would act with other parameters under the same idempotency key. The rule holds
until `update` is given the operation's message, even while its completion waits in the mailbox and a crash
could no longer rebuild it: the program sees the step that handles the message, never the moment the completion
is recorded. A key whose kind changes, from a timer to an operation, is new work
([decision 0014](decisions/0014-rules-the-machine-settled.md),
[decision 0018](decisions/0018-operations-are-data.md)).

What runs is always what the state says. After a crash the runtime does not look for what was running: it
computes `durable(state)` again. It compares that with the work stored with the state, so that a new program,
after a deploy, keeps the incarnations of the same work and starts anything else as new work. A new program that
changes or drops an operation under way, delivers it otherwise, or bears another name is a defect
([decision 0020](decisions/0020-a-new-program-is-checked-against-the-stored-work.md),
[decision 0022](decisions/0022-a-new-program-keeps-what-work-started-with.md)).

### Incarnations

Each key has an incarnation, a counter stored with the state. It grows each time the key comes back after
leaving, stays after its work delivered, changes kind, or keeps a timer that changed. An internal message
carries the incarnation of the work that sent it, and the runtime drops it when the key's incarnation has moved
on.

Without it, the second attempt of a payment could receive the late answer of the first. The runtime makes this
impossible, so that no program has to remember attempt numbers.

### Entities that talk

An entity sends a message to another from an operation, with `send` and a name for the request. The runtime gives
each run of an operation its own `Entities`, so the request is that run's — its entity, key and incarnation — under
the name, whatever the operation's delivery, and no operation can send under another's
([decision 0060](decisions/0060-send-and-create-take-no-key.md)): an operation that sends twice under one name to
the same entity dies ([decision 0047](decisions/0047-a-request-of-an-operation-has-a-name.md)). A restarted operation sends
the same requests, and gets the receiver's stored replies, kept while the work that sent them is stored
([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). While the receiver is
suspended, `send` waits for its resumption, and an operation that reaches a program not deployed yet waits for
its deploy ([decision 0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md)): each is woken by
what it waits for, and nothing looks again on a clock
([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)). A receiver that crashes has no reply
yet either, and the operation sends again after a while; only a defect of the sender's own suspends it
([decision 0046](decisions/0046-a-receiver-that-crashes-is-sent-again.md)). An operation creates an
entity the same way, with `create` and a name. So an operation that talks only to entities may run at least once:
run again, it sends the same requests, and acts once. `update` never sends: a step never waits on another entity
([decision 0009](decisions/0009-entities-talk-through-operations.md)).

[`examples/booking`](../examples/booking) holds seats in an event's inventory this way, and releases them when
the booking is cancelled or expires.

## Persistence

After each message the runtime stores, in one transaction:

- the new state, when the step changed it;
- the incarnations of the keys, and the work the state holds, with how each operation is delivered;
- the message, marked as handled, with its reply for an inbound one;
- and, when the state changed, the row a query reads: the projection, and the value of each index on it
  ([decision 0032](decisions/0032-a-projection-is-a-row.md));
- and, when what callers read changed with it, the row other systems learn from
  ([decision 0038](decisions/0038-what-happened-is-published-through-an-outbox.md), see
  [publishing](#publishing-what-happened)).

It stores the state, not the messages that led to it: a fixed `update` changes what happens next, never what
already happened ([decision 0002](decisions/0002-store-the-state-not-the-messages.md)). The messages may be
kept as an audit, but nothing replays them.

The runtime on SQLite writes all of it through the program's schemas, as JSON, in seven tables — the entity, the
keys with their incarnations and work, the mailbox in order, the replies by request, the read model, the
outbox and the cursors of its consumers ([`src/storage.ts`](../src/storage.ts)). Each row carries the version of the program that wrote it, and is read
by migrating its JSON to the program's version (see [schemas that change](#schemas-that-change)). The row around
the JSON is read through its table's schema, which says what the storage writes: nothing is filled in or cast, and
a row it refuses fails the call that meets it ([decision 0062](decisions/0062-a-row-is-read-through-a-schema.md)). A schema whose
encoded side is not JSON does not compile: a time is held as `Schema.DateTimeUtcFromMillis`, not as
`Schema.DateTimeUtc` ([decision 0030](decisions/0030-a-schema-encodes-to-json.md)). A value its schema refuses,
or that encodes to a number JSON does not hold (`NaN`, `Infinity`), cannot be stored: the machine encodes what a
step would store, and such a step is a defect; an inbound message that does not encode is its caller's defect,
and reaches no entity ([decision 0040](decisions/0040-what-is-stored-encodes-to-json-as-it-is.md)). So are flags
that do not encode: `init` sees only flags its schema takes
([decision 0049](decisions/0049-flags-are-checked-by-their-schema.md)).

What an event writes is the machine's: besides the next machine, a transition gives the rows it writes, already
encoded — the state when it changed, the keys that changed, the messages that leave the mailbox and the ones
queued, the replies added, the work that ended, the read model's row and the outbox's — and the storage writes
them and decides nothing. Each value is encoded once, and the projection of a state computed once
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)).

A reply to another entity is deleted in the transaction that ends the work that asked for it, which the machine
names, or in the one that stores it, if that work has already ended: only the storage sees another entity's keys
([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).

The machine holds no reply. A message that arrives is given the reply stored under its request, which the runtime
reads by the request just before the step, where no other event of the entity is applied; an activation reads
none, and what a loaded entity holds grows with its mailbox and its keys only. A deletion changes no machine, so
only a step changes one ([decision 0065](decisions/0065-the-machine-holds-no-replies.md)).

A reply's row is keyed by its request's text and by the version that wrote it: a migration of the sender may give
one caller's request the text another's had, and its reply then replaces nothing that other caller's retry reads
([decision 0069](decisions/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md)).

## Schemas that change

A program's schemas are what is stored, so a version of the program that changes one finds the version before it
in the database. `migrations` is how it reads it, in order: the first is the step from version 1 to version 2,
and **the program's version is how many migrations it carries, plus one** — a migration is the bump, and there is
none to declare ([decision 0036](decisions/0036-a-migration-is-a-function-on-the-json.md)).

A migration is a record of pure functions **from the JSON a version wrote to the JSON the next one reads**, by
kind of stored value: `state`, `operation`, `inbound`, `internal`, `rejection`, `sender` and `projection`, and a
kind left out is unchanged. It works on the JSON, which every schema encodes to
([decision 0030](decisions/0030-a-schema-encodes-to-json.md)), so the types and schemas of the version before do
not live on in the code.

Every row carries the version that wrote it, and is read by migrating its JSON from that version and decoding it
with the program's schema: the machine sees values of the program's own version only. A row is written at the
program's version whenever an event writes it, and an event writes only what it changed: the state, a key, a
message in the mailbox, a reply and the row a query reads are migrated at every read until they are written again
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)), and
`reindex` writes the read model again, which a deploy that changed the projection's schema runs, as one that
changed an index does.

This is what lets a deploy change the shape of an operation under way: the stored operation, migrated, must be
the one the new `durable` computes from the migrated state, and a migration that gives anything else suspends the
entity at its activation, as a program that changes an operation does
([decision 0020](decisions/0020-a-new-program-is-checked-against-the-stored-work.md)). A row written by a version
the program does not have is not read at all: the call that meets it fails, and the process serves the entities
it can read ([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)).

## Execution

- **Activation.** The runtime loads the state, the incarnations and the stored work, computes `durable(state)`,
  compares it with the stored work, starts its operations and arms its timers.
- **A message.** It reads `meta.at`, calls `update`, checks the step (defects included, and `durable`,
  `project` and the indexes on the next state), stores it, answers the caller, and starts or ends the work
  whose keys changed.
  An internal message `update` rejects is a defect, since it cannot be late
  ([decision 0014](decisions/0014-rules-the-machine-settled.md)).
- **Passivation.** An entity with no message for a while is unloaded. An operation under way keeps it loaded; a
  suspended entity, which runs nothing, is unloaded with the message it died on. To the machine, a passivation is
  a crash the runtime chose: a `Restart` activates the entity again, and arms the same timers in the same
  incarnations. The timers stored are the stored work's, which says each one's time: the earliest wakes the
  entity, and nothing else needs storing. So a process starts with the entities whose state holds an operation,
  which only an activation runs again, and the stored times wake the rest — except a suspended entity's, which
  nothing of fires until an operator resumes it
  ([decision 0029](decisions/0029-an-idle-entity-is-unloaded.md)).

These rules are a pure state machine, [`src/machine.ts`](../src/machine.ts): its events are a message arriving,
an operation completing or dying, a timer firing, a step, the process dying, and an operator resuming or
discarding. A runtime interprets its outputs ([decision 0013](decisions/0013-the-runtime-is-a-pure-machine.md)).
The program is not part of the machine: each event is stepped by the program that runs the entity, and a deploy
is a `Restart` stepped by another one, so the machine and the runtime never see two programs
([decision 0064](decisions/0064-the-program-is-not-the-machines-state.md)).

## What survives a crash

| The process dies…                                                      | After the restart                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| before a step's transaction commits                                    | the message is handled again, on the stored state; nothing of the step was seen   |
| after the commit, before the reply reaches the caller                  | the caller retries with the same request id, and gets the stored reply            |
| after the commit, before the work it started                           | activation computes `durable(state)` and starts it                                |
| while an operation runs, its effect done in the world but not recorded | it runs again, with the same idempotency key, or delivers `unknown` if at most once |
| after an operation's completion is recorded, before it is handled      | it is handled as any message in the mailbox                                       |
| after a timer fired, before its message is handled                     | its message is still in the mailbox, or the timer fires again from the state      |

The fourth line is the one the library cannot close. An effect on the world is at least once, or at most once
and then perhaps not at all. A service with idempotency keys, such as a payment provider, makes it exactly once.
One without them, such as an email, may act twice, or is declared at most once, and the state says when it is
not known ([decision 0011](decisions/0011-an-operation-declares-what-a-crash-does.md)). Another entity makes it
exactly once, with its stored replies ([decision 0009](decisions/0009-entities-talk-through-operations.md)).

## Defects

On a phone, a defect ends the app. On a server it must not end the process, and an entity whose message died
would receive it again and die again, forever. So a defect **suspends** the entity: its state stays as it was
before the message, the message stays unhandled, and nothing is delivered to it until someone resumes it or
discards the message ([decision 0006](decisions/0006-a-defect-suspends-the-entity.md)). A defect in an
operation, in `durable` or `project` on a step's next state, or in a new program activating the stored state,
suspends it too. A defect is what the program does: what one of its functions or schemas throws, each caught on
its own, or a rule of the design it breaks. Anything else thrown while an event is applied — a bug of the machine,
a row the runtime corrupted — is the runtime's, and crashes the entity instead
([decision 0061](decisions/0061-only-what-the-program-does-is-its-defect.md)). Resuming activates it as after a
crash, by the program deployed: a fixed program is a deploy, which the entity stays suspended through, and the
resumption follows it ([decision 0064](decisions/0064-the-program-is-not-the-machines-state.md)); a discarded
inbound message stores no reply, and its caller's retry is a new message
([decision 0014](decisions/0014-rules-the-machine-settled.md)). An internal message is not discarded: the state
before it still holds its work, so an operation's completion would run the operation again under another
idempotency key, and a timer's firing would fire again at once. Only a program that handles it gets the entity
past it ([decision 0041](decisions/0041-a-completion-is-not-discarded.md),
[decision 0044](decisions/0044-a-firing-is-not-discarded.md)). A caller meanwhile is answered `Suspended`, which
is not stored: every caller whose message waits in the mailbox when the entity suspends, and every message that
arrives while it is, which is not queued. `Suspended` says only that the request has no reply yet. The caller
retries under the same request id, and gets the stored reply once the entity is resumed: the message is applied
once, whichever retry finds it
([decision 0010](decisions/0010-a-rejection-may-carry-a-reason.md),
[decision 0023](decisions/0023-suspended-means-no-reply-yet.md)).

## Reading

`project(state)` is what callers read of an entity: its status, and the actions it allows. It is the
counterpart of effect-tea's model, and follows the same rule: it shows no action that `update` would reject.
A caller learns how an operation ended by reading the projection. The reply says only whether the message was
accepted and, for a rejection, perhaps why: an acceptance never carries data.

Queries across entities — "the orders nobody paid" — read the same thing. The runtime keeps one row per
entity, written in the step's transaction, holding the encoded projection; `indexes` gives, for each name, a
pure function from the projection to a scalar, which is what a query filters and orders by. So a query answers
with the values a caller reads of a single entity, and nothing is queried that a caller cannot read
([decision 0032](decisions/0032-a-projection-is-a-row.md)). A time is its milliseconds, as a stored time is.

`query` takes the criteria that hold, an index to order by and a limit, and gives the ids found with their
projections; `reindex` writes every row again from the stored states, which is what an index added or changed
by a new version of the program needs. It runs while entities step, and writes a row only if the state it was
computed from is still the one stored, in one statement: a step that committed since keeps the row it wrote
([decision 0070](decisions/0070-reindex-writes-a-row-only-over-its-state.md)). [`examples/order/runtime.test.ts`](../examples/order/runtime.test.ts)
asks for the orders still awaiting their payment.

## Publishing what happened

A queue, an event store or another service learns what an entity did from an **outbox**: a step that changes
what callers read writes one row in its own transaction, holding the entity's address, the message the step
handled and the projection it left. An entity's creation writes its first projection, with no message. Nothing
more is declared: the message names the fact, and the projection is already the public contract
([decision 0038](decisions/0038-what-happened-is-published-through-an-outbox.md)).

Each row carries a `seq`, which rises with every row and is never reused. A consumer is a name, and its cursor
is stored: `feed(consumer, limit)` reads from it and `ack(consumer, through)` moves it once the rows are acted
on, never back and never past the last `seq` written, so a crash before the ack delivers them again — at least once, deduplicated by `seq`. `prune` drops what
every consumer has read, through the lowest stored cursor, and drops nothing where no consumer has read from the
log. `consumers` says where each one is and how many rows are past it, and `forget` lets the log go past one
that is gone; `published(after, limit)` reads from a cursor the caller holds, and registers nothing
([decision 0039](decisions/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)). A cursor and a limit a handle
is given are non-negative integers, and anything else is its caller's defect, which stores nothing
([decision 0053](decisions/0053-what-a-handle-is-given-is-checked.md)). The log is kept for its
consumers and is not an archive: a program whose past must stay readable keeps it where callers read it, in the
state or in entities of its own.
A cursor skips nothing because the runtime writes one transaction at a time, so a row's `seq` is given and
committed in the same order; entities that step at once queue for it.
The runtime writes the log and does not deliver it — the transport, the retries and the acknowledgements are
the consumer's.

A step that changes the state without changing what callers read publishes nothing, and neither does a
rejected message, an internal message dropped, or a step that suspends the entity. The booking's inventory
shows what that costs: confirming seats moves them from held to sold and leaves `available` where it was, so
the sale is not published. A program whose fact must reach other systems shows it to callers.

A deploy publishes nothing of itself: a new `project` reaches the log at each entity's next step, and
`reindex` writes the read model again without publishing.

## Testing

Most of a program is pure, so most tests need no runtime:

- **`update`'s rules**, one test per message, for generated states;
- **the projection agrees with `update`**: every action it shows is accepted, and every accepted action is
  shown. `projectionViolations` checks it, as effect-tea's `dispatchViolations` checks a view, for a state and
  the messages its reader could send, once the test says which field of the projection stands for which message
  ([decision 0026](decisions/0026-the-test-maps-a-projection-to-its-messages.md)).
  [`examples/order/order.test.ts`](../examples/order/order.test.ts) checks it for generated states;
- **the defects**: an internal message in a state without its key.

`rehearse` runs a scenario on the program without storage, cluster or clock. It is the runtime's machine, which
handles the mailbox to its end after each act of the test. Time stands at the start's, and moves to a timer's
time when it fires. The test decides when each operation answers, when each timer fires, and when the process
dies:

- `send` delivers an inbound message, and returns the reply; `sendFrom` delivers one from another entity;
- `pending(key)` finds the work under way under one of the program's keys, with its idempotency key and its
  value, which a test asserts as it asserts a command in effect-tea;
- `answer(pending, message)` completes an operation, and says whether the message was delivered or dropped;
- `fire(pending)` fires a timer;
- `restart` drops everything that is not stored, and activates the entity again: an at-most-once operation
  under way delivers its `unknown` message. It rehearses a passivation too, which is the same thing — on an
  entity with only timers under way, where nothing delivers an `unknown`
  ([decision 0029](decisions/0029-an-idle-entity-is-unloaded.md));
- `deploy(program)` restarts it with a new version of the program, which keeps the work under way it returns
  the same and starts the rest as new work. One that changes, drops or delivers otherwise an operation under way
  fails the test, as a defect.

[`examples/order/scenarios.test.ts`](../examples/order/scenarios.test.ts) shows them, and
[`src/rehearse.test.ts`](../src/rehearse.test.ts) rehearses deploys of the order.

A migration is a pure function on JSON, and `rehearse` encodes what a step stores only to check it
([decision 0040](decisions/0040-what-is-stored-encodes-to-json-as-it-is.md)) and never reads it back, so a
rehearsed deploy does not exercise one: the runtime's tests deploy a version whose state, operation and
projection schemas changed.

The machine is tested with properties, under random orders of messages, completions, timers, crashes and
defects ([`src/machine.test.ts`](../src/machine.test.ts)). The runtime is tested against it
([`src/runtime.test.ts`](../src/runtime.test.ts)): a scenario, and then random sequences of events, are driven
on the real runtime with the process dying at each point of the table above, and what the database holds
afterwards is compared with where the machine ends on the events that committed. They run on Effect's
`TestClock`, and move time instead of waiting for it
([decision 0066](decisions/0066-the-runtimes-tests-move-time.md)). The machine's properties check
that what an event writes, applied to the rows before it, gives the rows after it, and
[`src/storage.test.ts`](../src/storage.test.ts) that the storage writes those rows as given
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)).
[`examples/booking/runtime.test.ts`](../examples/booking/runtime.test.ts) runs two entities that talk on it.

## Where it departs from effect-tea

| effect-tea                                       | here                                                                 | why                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| commands, started by a step                      | none: operations are derived from the state                          | a command started before a crash would be lost                           |
| subscriptions, by key                            | operations and timers, by key, with incarnations                     | work outlives the process, and its answers are delivered at least once   |
| a subscription whose value changes starts anew   | an operation whose value changes while it runs is a defect           | an operation cannot be interrupted, and a crash would restart it changed |
| an ended subscription waits for its key to leave | a key kept after its work delivered is new work                      | kept, it would not run again until a crash, which starts it anew         |
| a model, with the messages the view sends        | a projection, with the actions it allows                             | a caller is remote: it receives data, never functions                    |
| a defect ends the run                            | a defect suspends the entity                                         | one entity's bug must not stop the others                                |
| one program, a tree of children                  | many entities, by id; children inside an entity are an open question | an entity is the unit of storage and of concurrency                      |
| no persistence                                   | the state after each message                                         | the state is the data                                                    |

## Where it runs

On one process, with SQLite: the mailbox, the states and the timers sit in one database, so each step is one
transaction ([decision 0007](decisions/0007-one-process-first.md)). `launch` gives a runtime, `deploy(program)`
a handle to one program's entities — `create`, `send`, `read`, and `resume` and `discard` for an operator — and
the operations of a program are run with the services it was deployed with
([`src/runtime.ts`](../src/runtime.ts), [decision 0028](decisions/0028-rules-the-runtime-settled.md)).

An entity with nothing to do is unloaded, and the earliest of its stored timers wakes it
([decision 0029](decisions/0029-an-idle-entity-is-unloaded.md)); how long it stays loaded is an option of the
runtime. An event the runtime cannot finish — a write that fails — crashes its entity alone: it leaves the
process, its callers are given the defect, and the next one loads it from what is stored
([decision 0042](decisions/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)); nothing else waits
for its operations to stop ([decision 0056](decisions/0056-nothing-waits-for-an-operation-under-the-permit.md)).
Each entity is found, loaded, unloaded and crashed under a lock of its own, so the callers of one entity never
wait on another's activation ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)).
Everything a deployment runs runs in a scope of its own: a deploy that cannot finish stops what it started, and
is never seen by other programs ([decision 0051](decisions/0051-a-deploy-that-fails-leaves-nothing-running.md)). Effect Cluster's entities, sharding and message storage come next ([roadmap](roadmap.md)).
