# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

The first audit's findings whose fix was plain are done. A second review found the bugs below. Each fix changes a
rule of the machine or of the runtime, so each is decided in a note, with a test that fails without it. After
them comes one of the [open questions](open-questions.md), decided in a note.

- **A discarded timer's firing fires again at once.** `discard` arms the timer again in a new incarnation, at
  the time it had ([`src/machine.ts`](../src/machine.ts), `discard`). The state is the one before the message,
  so `durable` returns the same timer, whose time has passed: it fires at once, and a pure `update` dies on the
  same message. Discarding a firing gets no entity past it, and
  [decision 0041](decisions/0041-a-completion-is-not-discarded.md) is wrong to say that a timer "does nothing
  until its message is handled" is enough. Either a firing is not discarded either, as a completion is not, and
  only a fixed program gets the entity past it, or a discarded timer is armed again only at a time to come.
- **An entity that sends to a program not deployed yet is suspended.** `Entities.send` and `Entities.create` die
  when the receiver's program is not deployed in the process ([`src/runtime.ts`](../src/runtime.ts),
  `entities`), and the operation's defect suspends the sender. `deploy` starts the interrupted operations at once,
  so a process that deploys the booking before the inventory suspends every booking whose hold a crash
  interrupted. What works depends on the order of the deploys, which nothing says. Either `send` waits for the
  program as it waits for a suspended receiver, or `launch` takes every program and starts the interrupted
  operations once all of them are deployed.
- **A receiver that crashes suspends its sender.** An event the runtime cannot finish gives its waiting callers
  the defect, for them to retry ([decision 0042](decisions/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)),
  and so does a row of a version the program does not have
  ([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)). An operation that sends does
  not retry: its defect suspends the sender, which was not at fault, until an operator resumes it, even when the
  failure was transient. `send` from an operation should take a crash of the receiver as it takes `Suspended`,
  and send again.
- **An operation sends one message to an entity.** The request id of `send` is the operation's idempotency key
  ([`src/program.ts`](../src/program.ts), `send`), so a second message from the same operation to the same
  entity is answered with the reply stored for the first, and is never applied. Nothing fails. Either `send`
  takes a name for each request an operation makes, from which the request id is derived, or a request id that
  comes back with another message is a defect.
- **Callers share their request ids.** A caller's request is stored under its request id alone
  ([`src/machine.ts`](../src/machine.ts), `requestKey`), not under its sender: a second caller that picks the
  same id is answered `Accepted` with the first one's reply, or its reason, and its message is never applied. It
  is part of [who may send what](open-questions.md#programs), and is a bug until it is decided.
- **Flags are not checked by their schema.** An inbound message that does not encode is its caller's defect and
  reaches no entity ([decision 0040](decisions/0040-what-is-stored-encodes-to-json-as-it-is.md)); the flags of a
  `create` reach `init` unchecked ([`src/runtime.ts`](../src/runtime.ts), `create`).

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
