# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it. Each
question says what it waits for: a step of the [roadmap](roadmap.md), a release of a dependency, or a program
with a requirement that no example has yet.

## Storage and reading

- **Generated cases of a migration.** A case of a migration is recorded by hand, with the JSON a version wrote and
  the JSON the next one reads
  ([decision 0126](decisions/archive/0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md)). A changed
  migration that keeps every recorded case is not seen. That a row of an older version is still read at the
  program's version needs no recorded reading: a generated value of the older version, migrated and decoded,
  must not die. A case without `read` would check that alone, over values a property test generates. But an
  arbitrary of an older version's JSON is a shape of that version kept in the tests for as long as the
  migration, which decision 0036 keeps out of the code. Whether it is worth it is not decided. It waits for a
  program whose migrations a change could break unseen. It would be decided by:
  - a program with a migration of many branches, whose recorded cases a change could keep while it reads other
    rows otherwise;
  - what an arbitrary of an older version costs to keep, next to the cases recorded of it.
- **A caller that follows a projection.** A caller learns that an entity changed only by reading its projection
  again: `read` answers once, and the runtime writes the log without delivering it. A program of effect-tea in a
  browser would follow an entity with a subscription, and send to it with a command that retries under the same
  request id while the entity answers `Suspended`. That client would be a module of its own, which depends on both
  libraries while neither depends on the other. How a caller follows the changes of one projection, and whether the
  library ships that client, is not decided. It waits for a program that follows an entity, after the release. It
  would be decided by:
  - whether a boundary reads the log as one consumer and sends each row to the callers that follow its entity, given
    that the consumers of a topic are declared at deploy
    ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)) and a browser is not one;
  - what a caller that reconnects reads first, so that it misses no change between its last row and the next;
  - an example in which a program of effect-tea drives an entity of `examples/order`, whose view shows only the
    actions the projection allows.
- **A record of every step.** The outbox writes a row only for a step that changes what a topic selects, with the
  message the step handled and the projection it left
  ([decisions 0038](decisions/archive/0038-what-happened-is-published-through-an-outbox.md),
  [0138](decisions/archive/0138-the-log-publishes-topics.md)). A message that is rejected writes no row, and neither
  does a message that changes the state and leaves the projection as it was. A rejection is not lost to the
  application: only an inbound message can be rejected, since `update` rejecting an internal one is a defect, and
  its sender is answered `Rejected`, a caller by `send`, a creator by `create`, another entity's operation by the
  `send` it made. An application that must keep its rejections writes them where it sends. A fact of the state that
  must reach other systems is shown in the projection, where a topic selects it. What no application can make up
  for later is the past: a topic declared later has no rows for the steps before its deploy, so a new read model
  cannot be built from them. Event sourcing, as Akka Persistence does it, keeps every step by construction. Whether
  the runtime keeps a record of every step, and where, is not decided. It waits for a program that needs a read
  model of a past it did not publish. It would be decided by:
  - a program whose new read model must hold steps from before its topic was deployed, which no projection of
    those steps published;
  - whether such a record is a topic that every step writes, so that it keeps the log's order, cursors and prune, or
    a table of its own;
  - what the record costs a step: a row more in each transaction, and the message stored for every step, next to
    what the outbox already stores once per publication.

## Running

- **A runtime that loses its session on PostgreSQL.** A runtime holds a database of PostgreSQL with a session
  advisory lock, on a connection it reserves for its scope
  ([decision 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). The lock goes with its
  session, as PostgreSQL documents. A server that ends the session, by `idle_session_timeout`, a restart or a broken
  connection, gives the lock back while the runtime still runs, and nothing tells the runtime. A second runtime may
  then launch on the database, and the two would load the same entities
  ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)). Whether the runtime checks its hold,
  and how often, is not decided. It waits for the step on Cluster across machines on PostgreSQL in the
  [roadmap](roadmap.md), whose fence would make every commit check it
  ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). It would be decided by:
  - a test on a server that ends the reserved connection with `pg_terminate_backend`, and sees a second launch
    succeed while the first runs;
  - what a check costs a step: a statement of the reserved connection, or a reading of `pg_locks`, against a fence
    that a commit checks anyway.
- **A fiber that outlives its transaction.** A fiber forked inside a transaction keeps the transaction's connection
  in its context. At 4.1.2 its statements and savepoints then run on that connection after the commit, outside the
  client's semaphore, and nothing says so: on SQLite another fiber's transaction later fails to begin. The runtime
  forks every fiber a step sets going without the transaction
  ([decision 0161](decisions/archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)),
  and a test holds the rule for the operations and for the loop. A fork that the tests do not reach would still fail
  in silence. Reported as [Effect-TS/effect#10431](https://github.com/Effect-TS/effect/issues/10431), with
  [Effect-TS/effect#10433](https://github.com/Effect-TS/effect/pull/10433) open on 2026-11-07, which makes such a
  statement fail with a `SqlError`. It waits for the release of Effect that holds the fix. It would be decided by:
  - a release of Effect with the fix, after which a fork that keeps the transaction fails where it runs;
  - the spikes and the tests of the runtime run at that release, which a fork the rule missed would then fail.
## Programs

- **A request without a sender.** A program that leaves out `sender` has the sender `null`, and every `create` and
  `send` of it, and every `send` of its rehearsal, still passes `sender: null`, as the quick start does
  ([decision 0196](decisions/0196-the-quick-start-is-an-example-the-readme-shows-whole.md)). The same holds of
  `flags` left as `Schema.Null` ([decision 0180](decisions/0180-a-program-leaves-out-what-it-does-not-have.md)).
  Whether a request may leave out a sender that is `null`, and `create` flags that are `null`, is not decided. The
  step of the runtime's housekeeping in the [roadmap](roadmap.md) decides it. It would be decided by:
  - how many programs of the guide have no sender or no flags, once the guide is written;
  - whether an optional field typed by a conditional type keeps the errors of the compiler readable where a
    program does have a sender;
  - what the runtime's housekeeping changes of what a program passes to `send`, since both change the same
    signature.
