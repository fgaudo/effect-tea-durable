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
| `schemas` | how the state, the flags and the messages are stored                                         |
| `init`    | the first state, from the flags the entity is created with and the time of its creation      |
| `update`  | `(message, meta) => (state) =>` the next state, `reject`, or a defect                        |
| `durable` | the work under way in each state, by key: operations and timers                              |
| `project` | what callers read of the state, with the actions it allows                                   |

There are no commands. Every piece of work that must survive a crash is derived from the state by `durable`
([decision 0003](decisions/0003-durable-work-derived-from-state.md)).

[`examples/order/order.ts`](../examples/order/order.ts) is a whole program.

## Messages

A message is one of two kinds, and the rule for a message that does not apply follows from its kind.

- **Inbound** messages come from callers. Each one carries a request id chosen by the caller, and is answered
  `Accepted` or `Rejected`. A caller that retries with the same id gets the same answer, and the message is
  applied once. `meta.from` says who sent it, so that `update` decides who may do what. An inbound message may
  arrive in any state: a slow client, a retry, a second device, a malicious caller. One that does not apply is
  rejected.
- **Internal** messages come from the entity's own durable work: an operation's completion, a timer's firing.
  The runtime delivers one only while its key is in `durable(state)`, in the same incarnation that sent it
  ([decision 0004](decisions/0004-incarnations-guard-internal-messages.md)). So an internal message in a state
  where its key is absent cannot arrive. `update` answers it with a defect.

`meta.at` is the time the runtime handles the message, read once, before `update`. A program that needs time
reads it there, and `update` stays pure. A timer's message is the fact that its time has passed: `update`
trusts it, and never compares `meta.at` with the deadline. Another node's clock may be a few milliseconds
behind.

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

- **An operation** is an effect that ends with one internal message. Expected failures become messages, as in
  effect-tea's commands. It receives an **idempotency key**: the entity's id, the operation's key and its
  incarnation. A restarted operation gets the same idempotency key. A new attempt in a later incarnation gets
  another. An operation leaves the state only through its completion: a step whose next state drops the key of
  an operation still running is a defect ([decision 0005](decisions/0005-an-operation-leaves-only-by-completing.md)).
- **A timer** delivers one internal message at a time. It may be dropped in any state, since it has done
  nothing yet.

What runs is always what the state says. After a crash the runtime does not look for what was running: it
computes `durable(state)` again.

### Incarnations

Each key has an incarnation, a counter stored with the state. It grows each time the key comes back after
leaving, or stays after its work delivered. An internal message carries the incarnation of the work that sent it, and the runtime drops it when
the key's incarnation has moved on.

Without it, the second attempt of a payment could receive the late answer of the first. The runtime makes this
impossible, so that no program has to remember attempt numbers.

## Persistence

After each message the runtime stores, in one transaction:

- the new state;
- the incarnations of the keys;
- the message, marked as handled, with its reply for an inbound one.

It stores the state, not the messages that led to it: a fixed `update` changes what happens next, never what
already happened ([decision 0002](decisions/0002-store-the-state-not-the-messages.md)). The messages may be
kept as an audit, but nothing replays them.

## Execution

- **Activation.** The runtime loads the state and the incarnations, computes `durable(state)`, starts its
  operations and arms its timers.
- **A message.** It reads `meta.at`, calls `update`, checks the step (defects included), stores it, answers
  the caller, and starts or ends the work whose keys changed.
- **Passivation.** An entity with no message for a while is unloaded. A timer stays armed in storage, and wakes
  it. An operation under way keeps it loaded.

## What survives a crash

| The process dies…                                                      | After the restart                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| before a step's transaction commits                                    | the message is handled again, on the stored state; nothing of the step was seen   |
| after the commit, before the reply reaches the caller                  | the caller retries with the same request id, and gets the stored reply            |
| after the commit, before the work it started                           | activation computes `durable(state)` and starts it                                |
| while an operation runs, its effect done in the world but not recorded | the operation runs again with the same idempotency key: the world must recognise it |
| after an operation's completion is recorded, before it is handled      | it is handled as any message in the mailbox                                       |
| after a timer fired, before its message is handled                     | its message is still in the mailbox, or the timer fires again from the state      |

The fourth line is the one the library cannot close. An effect on the world is at least once. A service with
idempotency keys, such as a payment provider, makes it exactly once. One without them, such as an email, may
act twice. The open question of how an operation says which one it is is in
[open questions](open-questions.md).

## Defects

On a phone, a defect ends the app. On a server it must not end the process, and an entity whose message died
would receive it again and die again, forever. So a defect **suspends** the entity: its state stays as it was
before the message, the message stays unhandled, and nothing is delivered to it until someone resumes it or
discards the message ([decision 0006](decisions/0006-a-defect-suspends-the-entity.md)). A defect in an
operation suspends it too.

## Reading

`project(state)` is what callers read of an entity: its status, and the actions it allows. It is the
counterpart of effect-tea's model, and follows the same rule: it shows no action that `update` would reject.
A caller learns how an operation ended by reading the projection, not from the reply, which only says whether
the message was accepted.

Queries across entities ("orders unpaid for a day") are not designed yet ([open questions](open-questions.md)).

## Testing

Most of a program is pure, so most tests need no runtime:

- **`update`'s rules**, one test per message, for generated states;
- **the projection agrees with `update`**: every action it shows is accepted, and every accepted action is
  shown;
- **the defects**: an internal message in a state without its key.

`rehearse` runs a scenario on the program without storage, cluster or clock. The test decides when each
operation answers, when each timer fires, and when the process dies:

- `send` delivers an inbound message, and returns the reply;
- `pending(key)` finds the work under way under a key, with its idempotency key;
- `answer(pending, message)` completes an operation, and says whether the message was delivered or dropped;
- `fire(pending)` fires a timer;
- `restart` drops everything that is not stored, and activates the entity again.

[`examples/order/scenarios.ts`](../examples/order/scenarios.ts) shows them.

The runtime itself is tested apart, by dying at every point of the table above, under random orders of
messages, completions and timers.

## Where it departs from effect-tea

| effect-tea                                       | here                                                                 | why                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| commands, started by a step                      | none: operations are derived from the state                          | a command started before a crash would be lost                           |
| subscriptions, by key                            | operations and timers, by key, with incarnations                     | work outlives the process, and its answers are delivered at least once   |
| a model, with the messages the view sends        | a projection, with the actions it allows                             | a caller is remote: it receives data, never functions                    |
| a defect ends the run                            | a defect suspends the entity                                         | one entity's bug must not stop the others                                |
| one program, a tree of children                  | many entities, by id; children inside an entity are an open question | an entity is the unit of storage and of concurrency                      |
| no persistence                                   | the state after each message                                         | the state is the data                                                    |

## Where it runs

First on one process, with SQLite: the mailbox, the states and the timers sit in one database, so each step is
one transaction ([decision 0007](decisions/0007-one-process-first.md)). Effect Cluster's entities, sharding and
message storage come once the runtime survives every crash of the table on one process.
