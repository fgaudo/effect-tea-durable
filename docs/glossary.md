# Glossary

The words of [`design.md`](design.md) and of the notes, each defined once. A word used in a sense of Effect's or of
Cluster's says so.

- **Activation.** The runtime loads an entity: it reads the state, the incarnations and the stored work, computes
  `durable(state)`, starts its operations and arms its timers. A restart, a passivation and a deploy each end in one.
- **Capacity.** How many entities a process keeps loaded, an option of the runtime. Over it, the least recently used
  of the idle ones is unloaded; a busy entity, or one whose timer is due, never is.
- **Consumer.** A name under which the outbox is read, with a stored cursor that `ack` moves forward and never back.
- **Crash.** The process dies at a point of the crash table, or an entity leaves the process on an event the runtime
  cannot finish. To the machine, a passivation is a crash the runtime chose.
- **Defect.** What the program does that it should not: a function or a schema of its that throws, or a rule of the
  design it breaks. A defect suspends the entity. A bug of the runtime's crashes it instead.
- **Delivery.** What a crash does to an operation, declared by its runner: *idempotent*, run again with the same
  idempotency key; *at least once*, run again; *at most once*, not run again, its `unknown` message delivered instead.
- **Deploy, deployment.** `deploy(program)` gives a handle to one program's entities, under the program's name, in a
  scope of its own. A new version, a fix included, is deployed by a new process.
- **Durable work, work.** What the state holds under its keys, operations and timers, computed by `durable(state)` and
  compared with the previous state's after each step: a new key starts its work, a missing one ends it.
- **Entity.** One long-lived thing with an id, an order or a booking, with one state, one mailbox and one message
  handled at a time.
- **Event.** What moves the machine: a message arriving, an operation completing or dying, a timer firing, a step, the
  process dying, an operator resuming or discarding.
- **Flags.** What an entity is created with, which `init` reads and nothing else keeps.
- **Handle.** What `deploy` gives: `create`, `send`, `read` and `query` for callers, `feed`, `ack` and the rest of the
  outbox for its consumers, `reindex`, and `resume` and `discard` for an operator.
- **Hold, lock.** Each entity is found, loaded, unloaded and crashed under a lock of its own. A caller holds the entity
  while it waits for its activation, and nothing under one entity's lock waits for another's.
- **Idempotency key.** The entity's program and id, the operation's key and its incarnation, given to an idempotent
  operation, which passes it to the service it calls. A restarted operation gets the same one.
- **Incarnation.** A counter stored with each key, which grows each time the key's work starts anew. An internal
  message carries the incarnation of the work that sent it, and is dropped once the key's has moved on.
- **Index.** A pure function from the projection to a scalar, named by the program, which a query filters and orders
  by. Its values are stored with the projection's row.
- **Key.** A name the program declares, under which `durable` holds one piece of work. The keys are finite, and one
  the program does not declare is a defect.
- **Machine.** The runtime's semantics as a pure state machine, in [`src/machine.ts`](../src/machine.ts): from an event
  to the next machine and the rows it writes. `rehearse` runs it, and the runtime interprets it.
- **Mailbox.** The entity's stored queue of messages, in order. A message that finds it empty is received and handled
  in one event, and one transaction.
- **Message.** *Inbound*, from a caller, with a request id, answered `Accepted`, `Rejected`, `Suspended` or `NotFound`;
  or *internal*, from the entity's own work, a completion or a firing, carrying an incarnation.
- **Migration.** A record of pure functions from the JSON a version wrote to the JSON the next one reads, by kind of
  stored value. A program carries every migration it ever had, in order.
- **Name.** What the runtime stores a program's entities under, and what other entities address them by. A process
  deploys a name once.
- **Note.** A decision, numbered, in [`decisions/`](decisions); what one is, and when it is taken, is in
  [`AGENTS.md`](../AGENTS.md).
- **Operation.** Work that acts on the world, as a value of the program's own type. Its runner turns it into an effect
  that ends with an internal message. It leaves the state only through its completion.
- **Outbox, log.** One row per step that changed what callers read, holding the entity's address, the message handled
  and the projection left, with a `seq` that never repeats. A consumer reads it from its cursor.
- **Passivation.** The runtime unloads an entity that has nothing to do. It writes nothing, and the earliest of the
  stored timers wakes the entity.
- **Probe.** A reference in the context that the runtime tells what it did, which a test provides and the library does
  not export.
- **Program.** Everything declared in `program(schemas)(…)`: `name`, `keys`, `init`, `update`, `durable`,
  `operations`, `project`, `indexes` and `migrations`.
- **Projection, read model.** `project(state)`: what a caller reads of an entity, with the actions it allows. Stored as
  a row with the value of each index, which a query reads.
- **Rehearsal, `rehearse`.** A scenario run on the machine without storage, cluster or clock, where the test answers
  the operations, fires the timers, kills the process and deploys new versions.
- **Reply.** The stored answer to a request, which a retry under the same request id reads. A caller's is kept for
  ever; another entity's while the work that asked is stored.
- **Request.** What identifies an inbound message: a caller's sender and request id, or the run of an operation and the
  name it gave `send`. A request is applied once, whichever retry finds it.
- **Runner.** Of an operation: the function in `operations` that runs its kind. Of Cluster: a process that serves
  entities ([`cluster.md`](cluster.md)).
- **Schedule, seed.** In the runtime's tests: the recorded sequence of choices of where fibers yield, drawn from a seed.
  A run that fails is replayed exactly from it.
- **Sender.** Who sent an inbound message, as the program's schema writes it, read in `update` as `meta.from`. Request
  ids are their sender's.
- **Settled.** The runtime's wait for the process to have nothing under way, an entity unloading included, which the
  tests use.
- **Spike.** A test in [`spikes/`](../spikes) that shows what a dependency does at the pinned version.
- **State.** The one truth of an entity, an object, stored after each step. Everything durable is derived from it.
- **Step.** `update` applied to one message: the next state, checked, and stored in one transaction with the message,
  its reply, the work that changed, and the rows a query and the outbox read.
- **Suspended.** An entity after a defect: its state stays, the message stays unhandled, and nothing is delivered to it
  until an operator resumes it or discards the message. A caller meanwhile is answered `Suspended`, which is no reply.
- **Timer.** Work that delivers one internal message at its time, derived from the state. It may be dropped in any
  state, and one that changes is armed again as new work.
- **Version.** Of a program: how many migrations it carries, plus one. Every row carries the version that wrote it,
  and is read by migrating its JSON to the program's.
- **Waker.** The runtime's fiber that reads the stored timers due and activates their entities, and tries again after
  `retry` one it could not load.
