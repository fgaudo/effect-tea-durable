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

| Piece     | What it does                                                                                 |
| --------- | -------------------------------------------------------------------------------------------- |
| `name`    | what the runtime stores the entity under, and what other entities see it as                  |
| `schemas` | how the state, flags, messages, operations, reasons and projection leave the process         |
| `init`    | the first state, from the flags the entity is created with and the time of its creation      |
| `update`  | `(message, meta) => (state) =>` the next state, a rejection, or a defect                     |
| `durable`    | the work under way in each state, by key: operations, as data, and timers                    |
| `operations` | how each kind of operation runs, and what a crash does to it                                 |
| `project`    | what callers read of the state, with the actions it allows                                   |

There are no commands. Every piece of work that must survive a crash is derived from the state by `durable`
([decision 0003](decisions/0003-durable-work-derived-from-state.md)). An operation is data, as effect-tea's
commands are, and its runner sees it, never the state
([decision 0018](decisions/0018-operations-are-data.md)). Everything that leaves the process has a schema: what
is stored, and the projection callers read
([decision 0025](decisions/0025-operations-and-projections-have-schemas.md)).

[`examples/order/order.ts`](../examples/order/order.ts) is a whole program.

## Messages

A message is one of two kinds, and the rule for a message that does not apply follows from its kind.

- **Inbound** messages come from callers. Each one carries a request id chosen by the caller, and is answered
  `Accepted` or `Rejected`, with the reason `update` gave, if any
  ([decision 0010](decisions/0010-a-rejection-may-carry-a-reason.md)). A caller that retries with the same id
  gets the same answer, and the message is applied once. Request ids are their sender's: another entity's are
  stored under its address, apart from everyone else's
  ([decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)). `meta.from` says who sent it, so that
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
[decision 0017](decisions/0017-creation-in-the-machine.md)).

## Durable work

`durable(state)` returns a record of work by key. The runtime compares it with the previous state's, as
effect-tea compares subscriptions:

- a new key starts its work;
- a kept key leaves it as it is;
- a missing key ends it.

Work ends when its message is handled. In the step that handles it, its key counts as gone, so a next state
that returns it starts new work: that is how a timer repeats
([decision 0008](decisions/0008-delivered-work-is-done.md)).

Two kinds of work exist.

- **An operation** is a value of the program's own type, usually a `Schema.TaggedUnion`, which says what to do.
  The program's `operations` give a runner for each tag, which turns it into an effect that ends with one
  internal message. Expected failures become messages, as in effect-tea's commands. The runner says what a
  crash does to it ([decision 0011](decisions/0011-an-operation-declares-what-a-crash-does.md)): an idempotent
  one receives an **idempotency key** (the entity's program and id, the operation's key and its incarnation:
  [decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)), and passes it on; one that may
  act twice runs again; one that must act at most once is not run again after a crash, and delivers its
  `unknown` message.
  A restarted operation gets the same idempotency key. A new attempt in a later incarnation gets another. An
  operation leaves the state only through its completion: a step whose next state drops the key of an operation
  still running is a defect ([decision 0005](decisions/0005-an-operation-leaves-only-by-completing.md)).
- **A timer** delivers one internal message at a time. It may be dropped in any state, since it has done
  nothing yet.

A kept key keeps its work only if the work is the same by value: an operation equal to the one under way, a
timer at the same time with the same message. A timer that changes is armed again, as new work. An operation
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

An entity sends a message to another from an operation, with `send`, and the operation's idempotency key as
the request id. A restarted operation sends the same request, and gets the receiver's stored reply, kept while
the work that sent it is stored
([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). While the receiver is
suspended, `send` waits. An operation creates an entity the same way, with `create`. `update`
never sends: a step never waits on another entity
([decision 0009](decisions/0009-entities-talk-through-operations.md)).

[`examples/booking`](../examples/booking) holds seats in an event's inventory this way, and releases them when
the booking is cancelled or expires.

## Persistence

After each message the runtime stores, in one transaction:

- the new state;
- the incarnations of the keys, and the work the state holds, with how each operation is delivered;
- the message, marked as handled, with its reply for an inbound one.

It stores the state, not the messages that led to it: a fixed `update` changes what happens next, never what
already happened ([decision 0002](decisions/0002-store-the-state-not-the-messages.md)). The messages may be
kept as an audit, but nothing replays them.

The runtime on SQLite writes all of it through the program's schemas, as JSON, in four tables — the entity, the
keys with their incarnations and work, the mailbox in order, and the replies by request
([`src/storage.ts`](../src/storage.ts)). A schema whose encoded side is not JSON cannot be stored: a time is
held as `Schema.DateTimeUtcFromMillis`, not as `Schema.DateTimeUtc`
([decision 0028](decisions/0028-rules-the-runtime-settled.md)).

## Execution

- **Activation.** The runtime loads the state, the incarnations and the stored work, computes `durable(state)`,
  compares it with the stored work, starts its operations and arms its timers.
- **A message.** It reads `meta.at`, calls `update`, checks the step (defects included, and `durable` and
  `project` on the next state), stores it, answers the caller, and starts or ends the work whose keys changed.
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
suspends it too. Resuming activates it as after a
crash; a discarded message ends its work as if it had been handled
([decision 0014](decisions/0014-rules-the-machine-settled.md)). A caller meanwhile is answered `Suspended`, which
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

Queries across entities ("orders unpaid for a day") are not designed yet ([open questions](open-questions.md)).

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
- `pending(key)` finds the work under way under a key, with its idempotency key and its value, which a test
  asserts as it asserts a command in effect-tea;
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

The machine is tested with properties, under random orders of messages, completions, timers, crashes and
defects ([`src/machine.test.ts`](../src/machine.test.ts)). The runtime is tested against it
([`src/runtime.test.ts`](../src/runtime.test.ts)): a scenario, and then random sequences of events, are driven
on the real runtime with the process dying at each point of the table above, and what the database holds
afterwards is compared with where the machine ends on the events that committed.
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
runtime. Effect Cluster's entities, sharding and message storage come next ([roadmap](roadmap.md)).
