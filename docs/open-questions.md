# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Programs

- **Replies with data.** A reply says only `Accepted` or `Rejected`, and the caller reads the projection.
  Should a rejection carry a reason the caller can show ("already shipped")? Should an acceptance ever carry
  data, or is everything a caller needs in the projection?
- **At-least-once operations.** An operation restarted after a crash acts on the world again. How does an
  operation declare whether it is idempotent (with the key it passes on) or accepts acting twice, so that the
  difference shows in its type?
- **Work that may be abandoned.** An operation leaves only through its completion. Is there a kind of work with
  no effect on the world (a computation, a read) that a state may drop, as effect-tea drops a subscription?
- **Live streams.** A timer and an operation survive passivation. A stream from a socket or a feed does not.
  Are they allowed, keeping the entity loaded while their key is present, or left out?
- **Children inside an entity.** effect-tea composes programs into a tree. Does an entity's program compose
  children the same way, stored as one state?
- **Entities that talk to each other.** An operation may send a message to another entity, using its
  idempotency key as the request id, so that a restart sends the same request. Is that enough, or does it need
  a kind of work of its own?
- **Creation.** Who creates an entity, with which flags? What does creating one that exists answer?
- **Who may send what.** `update` reads `meta.from` and rejects what a sender may not do. Should authorization
  that is not domain (a valid token) happen before the mailbox, and what does the caller get then?

## Storage and reading

- **Queries across entities.** "Orders unpaid for a day" cannot be asked of stored states. A pure function
  from the state to rows of a read table, written in the step's transaction, would answer it. How are those
  tables declared and migrated?
- **Large states.** Each message stores the whole state. Where is the limit, and what does a program with a
  large state do: split into entities, or store a difference?
- **Schemas that change.** States, flags and messages in the mailbox are stored in the schema of the version
  that wrote them. How does a migration of a state's schema look, and when does it run: at activation, or all
  at once?

## Running

- **Two versions at once.** During a rolling deploy, a state written by the new version may be read by the
  old one. Is forward compatibility for one version required, or do deploys avoid it?
- **Suspended entities.** What does a caller of a suspended entity get? How does an operator see, resume and
  discard?
- **Failing operations.** A transient failure (a timeout) is retried inside the operation, or becomes a
  message. After how many retries does it become a defect, if ever?
- **Dependence on unstable Effect modules.** Cluster, Workflow and the SQL modules are `@stability unstable`
  in Effect 4.1.

## Naming

- The name of the library, once there is code to publish.
