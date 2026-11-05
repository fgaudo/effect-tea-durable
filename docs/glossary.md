# Glossary

The words of [`design.md`](design.md) and of the notes, each defined once. A word used in a sense of Effect's or of
Cluster's says so.

- **Activation.** The runtime loads an entity: it reads the state, the incarnations and the stored work, computes
  `durable(state)`, starts its operations and arms its timers. A restart, a passivation and a deploy each end in one.
- **Boundary.** The code that calls a deployment's `create`, `send` and `read` for a caller: it authenticates the
  caller, and writes the sender. The runtime trusts the sender the boundary gives, and `read` takes none.
- **Capacity.** How many entities a process keeps loaded, an option of the runtime. Over it, the least recently used
  of the idle ones is unloaded; a busy entity, or one whose timer is due, never is.
- **Child, parent.** A part a program or another part holds in its state, declared in its `children` with `child`
  for one, or `each` for children by id; the one that holds it is its parent. The library routes a child's messages,
  holds its work under `<child>.<key>`, and runs its operations under `<child>.<tag>`.
- **Consumer.** A name under which one topic of the outbox is read, with a stored cursor per partition that `ack`
  moves forward and never back. One name in two topics is two consumers.
- **Crash.** The process dies at a point of the crash table, or an entity leaves the process on an event the runtime
  cannot finish. To the machine, a passivation is a crash the runtime chose.
- **Defect.** What the program does that it should not: a function or a schema of its that throws, or a rule of the
  design it breaks. A defect suspends the entity. A bug of the runtime's crashes it instead.
- **Delivery.** What a crash does to an operation, and what an idempotent one is given, declared by its runner:
  *idempotent*, run again with the same idempotency key, readable or as its digest; *at least once*, run again; *at
  most once*, not run again, its `unknown` message delivered instead; *droppable*, acting on nothing, run again, and
  interrupted when a step drops it or changes it.
- **Deploy, deployment.** `deploy(program)` gives a handle to one program's entities, under the program's name, in a
  scope of its own. A new version, a fix included, is deployed by a new process.
- **Durable work, work.** What the state holds under its keys, operations and timers, computed by `durable(state)` and
  compared with the previous state's after each step: a new key starts its work, a missing one ends it.
- **Entity.** One long-lived thing with an id, an order or a booking, with one state, one mailbox and one message
  handled at a time.
- **Event.** What moves the machine: a message arriving, an operation completing or dying, a timer firing, a step, the
  process dying, an operator resuming or discarding. What a child tells its parent is a raised event, not an event.
- **External message.** What a parent sends a child through `children.<child>.update`, of a type the child's schema
  `external` gives. It is no inbound message: no caller can send it, and a child takes it in every state.
- **Flags.** What an entity is created with, which `init` reads and nothing else keeps.
- **Full.** What `send` answers for an entity that holds as many callers' messages as the runtime's option
  `callers.messages`, 4096 by default: the messages of `send` offered to it and not yet applied. Nothing of the
  message is offered or stored. An operation of another entity is never answered `Full`, and sends again after the
  retry.
- **Handle.** What `deploy` gives: `create`, `send`, `read` and `query` for callers, `feed`, `ack` and the rest of the
  outbox for its consumers, `reindex`, and `suspended`, `resume` and `discard` for an operator.
- **Hold, lock.** Each entity is found, loaded, unloaded and crashed under a lock of its own. A caller holds the entity
  while it waits for its activation, and nothing under one entity's lock waits for another's.
- **Idempotency key.** The entity's program and id, the operation's key and its incarnation, given to an idempotent
  operation, which passes it to the service it calls. A restarted operation gets the same one. Its *digest*, 43
  characters whatever the id's length, is given instead to a runner declared with `operation.digest`.
- **Incarnation.** The number of a run of a key's work, drawn from one counter of the entity each time work starts
  anew under any key, so it never goes back. An internal message carries the incarnation of the work that sent it,
  and is dropped once the key's has moved on.
- **Index.** A pure function from the projection to a scalar, named by the program, which a query filters and orders
  by. Its values are stored with the projection's row.
- **Key.** A name the program declares, under which `durable` holds one piece of work, or one piece for each
  *parameter* of a key declared with a schema for it. Two parameters are one when they encode alike. The names are
  finite, and one the program does not declare is a defect.
- **Machine.** The runtime's semantics as a pure state machine, in [`src/machine.ts`](../src/machine.ts): from an event
  to the next machine and the rows it writes. `rehearse` runs it, and the runtime interprets it.
- **Mailbox.** The entity's stored queue of messages, in order. A message that finds it empty is received and handled
  in one event, and one transaction.
- **Message.** *Inbound*, from a caller, with a request id, answered `Accepted`, `Rejected`, `Suspended`, `NotFound` or
  `Full`;
  or *internal*, from the entity's own work, a completion or a firing, carrying an incarnation.
- **Migration.** A record of pure functions from the JSON a version wrote to the JSON the next one reads, by kind of
  stored value. A program carries every migration it ever had, in order.
- **Migration case.** A JSON value a version wrote of one kind, and the JSON value the next version reads of it,
  recorded by a test when the migration is written. `migrationViolations` checks a program against its cases.
- **Name.** What the runtime stores a program's entities under, and what other entities address them by. A process
  deploys a name once.
- **Note.** A decision, numbered, in [`decisions/`](decisions); what one is, and when it is taken, is in
  [`AGENTS.md`](../AGENTS.md).
- **Operation.** Work that acts on the world, as a value of the program's own type. Its runner turns it into an effect
  that ends with an internal message. It leaves the state only through its completion, unless it is droppable: one
  that acts on nothing, which a step may drop or change while it runs.
- **Outbox, log.** One row per step that changed what callers read, in each topic whose selection changed, holding
  the entity's address, the message handled and the value the topic selects of the projection left, with its
  entity's partition and the step's
  `seq`, which never repeats within the partition. The rows of one step share its `seq`. A consumer reads one topic
  of it from its cursors.
- **Part.** A child, as declared in `part(schemas)(…)`: a program's pieces without a name, topics, indexes or
  migrations, which are its parent's, and with the schemas of the events it raises and the external messages it
  takes.
- **Partition.** One of the parts of the log, numbered from 1 to a number fixed for the life of the database, 300 by
  default. Each entity belongs to one, drawn from its id when it is created and stored. The rows of a partition are
  in the order of their `seq`, and the log promises no order across partitions.
- **Passivation.** The runtime unloads an entity that has nothing to do. It writes nothing, and the earliest of the
  stored timers wakes the entity.
- **Planned stop, drain.** The closing of the scope a runtime was launched in with the option `drain`. The runtime
  takes no caller's request, stops its timers and the operations that run again, and waits up to `drain.millis` for
  its at-most-once operations and the steps of their completions. Without the option, the closing is a crash.
- **Probe.** A reference in the context that the runtime tells what it did, which a test provides and the library does
  not export.
- **Program.** Everything declared in `program(schemas)(…)`: `name`, `keys`, `children`, `init`, `update`,
  `onEvent`, `durable`, `operations`, `project`, `topics`, `indexes` and `migrations`.
- **Projection, read model.** `project(state)`: what a caller reads of an entity, with the actions it allows, as
  JSON, a time as its milliseconds. Stored as a row with the value of each index, which `read` and a query read.
- **Raised event.** What a child's `update` tells its parent with `raise(event)(state)`, handled by the parent's
  `onEvent` in the same step, and never stored.
- **Rehearsal, `rehearse`.** A scenario run on the machine without storage, cluster or clock, where the test answers
  or runs the operations, fires the timers, kills the process and deploys new versions. `rehearse` runs one entity,
  and `rehearse.together` a world.
- **Reply.** The stored answer to a request, which a retry under the same request id reads. A caller's is kept for
  the `keep` its boundary gave `send`, from the step that answers, and for ever without one. Another entity's is kept
  while the work that asked is stored.
- **Request.** What identifies an inbound message: a caller's sender and request id, or the run of an operation and the
  name it gave `send`. A request is applied once, whichever retry finds it while its reply is kept.
- **Runner.** Of an operation: the function in `operations` that runs its kind. Of Cluster: a process that serves
  entities ([`cluster.md`](cluster.md)).
- **Schedule, seed.** In the runtime's tests: the recorded sequence of choices of where fibers yield, drawn from a seed.
  A run that fails is replayed exactly from it.
- **Sender.** Who sent an inbound message, as the program's schema writes it, read in `update` as `meta.from`. Request
  ids are their sender's. A caller's sender is the identity the boundary authenticated.
- **Settled.** The runtime's wait for the process to have nothing under way, an entity unloading included, which the
  tests use.
- **Spike.** A test in [`spikes/`](../spikes) that shows what a dependency does at the pinned version.
- **State.** The one truth of an entity, an object, stored after each step. Everything durable is derived from it.
- **Step.** `update` applied to one message: the next state, checked, and stored in one transaction with the message,
  its reply, the work that changed, and the rows a query and the outbox read.
- **Suspended.** An entity after a defect: its state stays, the message stays unhandled, its timers are disarmed, and
  nothing is handled until an operator resumes it or discards the message. Its operations run to their end, and
  their completions wait behind the message. A caller meanwhile is answered `Suspended`, which is no reply.
- **Timer.** Work that delivers one internal message at its time, derived from the state. It may be dropped in any
  state, and one that changes is armed again as new work.
- **Topic.** A part of the log, by name: a pure function, declared in `topics`, that selects of the projection what
  the topic watches. A step writes a row in a topic only when that changed, and the row gives it, selected of the
  stored projection by the program deployed. A program that declares no topics publishes its projection as the one
  topic `projection`.
- **Version.** Of a program: how many migrations it carries, plus one. Every row carries the version that wrote it,
  and is read by migrating its JSON to the program's.
- **Waker.** The runtime's fiber that reads the stored timers due and activates their entities, and tries again after
  `retry` one it could not load.
- **World, member.** In a rehearsal: entities on the machine together, with one time and one process for all of them,
  made by `rehearse.together`. A member is one entity of a world, whose `run` runs an operation's runner, and what
  the runner sends reaches the receiver's machine.
