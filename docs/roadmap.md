# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

The first audit's findings whose fix was plain are done. A second review found the bugs below. Each fix changes a
rule of the machine or of the runtime, so each is decided in a note, with a test that fails without it. After
them comes one of the [open questions](open-questions.md), decided in a note.

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
