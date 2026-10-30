# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

What an audit of the runtime found, whose fix is plain. What needs deciding first is in the
[open questions](open-questions.md).

- **Bound a consumer's ack to the log.** `ack(consumer, through)` stores any `through`, and a `prune` drops every
  row up to the lowest cursor: a consumer that acks past the last `seq` has the rows written after it dropped
  before it reads them. An ack moves the cursor at most to the last `seq` of the log
  ([`src/storage.ts`](../src/storage.ts), [decision 0039](decisions/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)).
- **Read the due timers without listing the loaded entities.** `due` passes the id of every entity the process
  holds as a parameter of its query. Past SQLite's limit on parameters the query fails, the waker dies with it,
  and no timer of an unloaded entity of the program fires again
  ([`src/storage.ts`](../src/storage.ts), [decision 0029](decisions/0029-an-idle-entity-is-unloaded.md)).
- **Pin Effect to an exact version.** [Decision 0019](decisions/0019-unstable-effect-modules.md) pins it once the
  runtime uses the unstable modules, which it does, and [`package.json`](../package.json) asks for `^4.1.0`: only
  the lockfile holds it.
- **Make a row no version reads stop the process, or say that it does not.** The design says the process dies on
  a row written by a version the program does not have
  ([decision 0036](decisions/0036-a-migration-is-a-function-on-the-json.md)). A deploy does, while it activates
  the entities with an operation; a row met later dies only the call that loads it, and the process goes on
  serving the others.
- **Say why there is no decision 0024.** The notes go from 0023 to 0025, and the history holds no 0024: the
  numbering is in order, so the gap is either a note to restore or one to explain.

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
