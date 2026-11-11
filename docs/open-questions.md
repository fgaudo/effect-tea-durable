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
- **The consumers of several runners on Cluster.** A consumer is declared at deploy, and a forget refuses a
  consumer the deploy declares
  ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). That rests on one
  process that holds the database ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)). On
  Cluster each runner declares its own. A forget on a runner that does not declare a consumer drops another runner's
  consumer and its rows, which is bug 24 of the [roadmap](roadmap.md). An ack of a runner after another forgot the
  consumer writes a cursor no consumer owns, and the partition is never pruned again, which is bug 23. Where the
  stored consumer has no cursor in the partition, that cursor stands for it, and the prune drops a row the stored
  consumer has not read, which is bug 55. A runner that does not declare another's consumer also warns of it as of
  one to forget. It would be decided by:
  - whether the runners record the consumers they declare, as they record their versions, and `forget` refuses a
    consumer any running deployment declares;
  - whether `ack` writes a cursor only for a stored consumer, or `pruneBatch` counts only theirs.
- **A reindex on Cluster.** On Cluster each runner's `reindex` runs beside the other runners' steps on one file
  ([decision 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md)). A statement that reads its
  snapshot while another runner holds the write lock may end with `SQLITE_BUSY`, which no busy handler retries, and
  `reindex` dies. It loses no row. It is bug 36 of the [roadmap](roadmap.md), not checked. In a rolling deploy, a
  `reindex` of the older runner writes the older projection over the row the newer runner wrote, since the entity's
  state and version did not change
  ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). It is bug 77,
  reproduced. It would be decided by:
  - a test of `src/cluster.test.ts` with `withholding`, whose step holds the write lock while the other runner
    reindexes;
  - for bug 77, whether `reindex` refuses to run while its version is outranked, or writes only where the stored
    row's version is not newer than its own, and a test of the index a newer version adds.
- **A reader with no time that misses a commit.** A reader of `consume` with `wait: true` waits until a commit tells
  its topic ([decision 0184](decisions/0184-consume-runs-a-reader-of-a-consumer.md)). Before it, a timed wait cost
  only its time ([decision 0142](decisions/archive/0142-a-consumer-waits-for-a-row-of-its-topic.md)). A step
  interrupted between its commit and `tell` leaves such a reader waiting, which is bug 37 of the
  [roadmap](roadmap.md). On Cluster another runner's commit is learned from `PRAGMA data_version`
  ([decision 0163](decisions/archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md)),
  which reads nothing on PostgreSQL and may fail to be read, which is bug 39. Neither is checked. It would be decided
  by:
  - a reading of whether the loop can be interrupted between its commit and `tell`, other than when the runtime
    stops;
  - whether `wait: true` keeps a bound of its own, as the timed wait of 0142 did.
- **A sum at the edge of the largest double.** A sum is refused past the largest double, alike on both dialects
  ([decision 0209](decisions/0209-a-sum-is-refused-past-the-largest-double-alike-on-both-dialects.md)). SQLite adds
  the magnitudes as doubles, and PostgreSQL adds them exactly and rounds once. So a set of rows whose exact total of
  magnitudes is just under `Number.MAX_VALUE` might be refused on SQLite and accepted on PostgreSQL. It is bug 40 of
  the [roadmap](roadmap.md), not checked. It would be decided by:
  - a case of `src/dialects.test.ts` with such rows.
- **A set of tables the `search_path` no longer names.** A launch dies where a schema further on the `search_path`
  holds the tables ([decision 0263](decisions/0263-a-launch-dies-where-a-schema-further-on-the-search-path-holds-the-tables.md)). A launch whose
  `search_path` no longer names the schema that holds them, as `runtime` alone where the tables are in `public`, finds
  no history and makes an empty set of tables, with no error. So does a launch on a database that bug 41 already
  moved. It would be decided by:
  - whether a launch dies where any schema of the database holds `effecttea_migrations` but the first, and what that
    costs an operator who keeps a copy of the tables in another schema;
  - a test of `src/storage.test.ts` on PGlite of each case.
- **A connection of a pool whose `search_path` is another.** The check of decision 0263 reads one connection, and
  `Migrator` runs its transaction on the connection the pool gives it next. A connection whose `search_path` a `SET`
  of a session or a pooler changed is not seen by the check. It would be decided by:
  - whether the check runs inside the transaction of `Migrator`, which `Migrator` gives no hook for at Effect 4.1.2;
  - a test of `src/postgres.test.ts` on the CI's server, with one connection of the pool given another `search_path`.
- **Cluster's tables where a schema is put in front of them.** `Migrator` of Effect looks for its history with
  `to_regclass` without a schema, so Cluster's migrations would find their history further on the `search_path`, and
  Cluster would stay on its tables there. A launch of the runtime now dies in that case
  ([decision 0263](decisions/0263-a-launch-dies-where-a-schema-further-on-the-search-path-holds-the-tables.md)), so the two no longer part, but
  Cluster's side was only read in `node_modules/effect/src/sql/Migrator.ts`. It would be decided by:
  - a test of `src/storage.test.ts` with `SqlMessageStorage.layer` on PGlite, under a `search_path` of two schemas.
- **The migrations inside an operator's transaction.** The migrations lock their table before they read
  ([decision 0225](decisions/0225-the-migrations-run-at-the-roles-level-and-lock-before-they-read.md)). An operator who
  calls `createTables` inside a transaction of their own, at `REPEATABLE READ` with a query before it, makes the
  migrations' transaction a savepoint, whose lock comes after the snapshot. Nothing of the runtime calls it so, and
  the JSDoc of `createTables` does not say a caller must not. It is bug 51 of the [roadmap](roadmap.md), not
  checked. It would be decided by:
  - a test of `src/postgres.test.ts` on the CI's server;
  - whether `createTables` refuses a transaction it is given, or its JSDoc names the rule.
- **A full volume beside the steps.** An operator frees room on a full volume, then forgets a consumer and prunes
  ([decision 0223](decisions/0223-a-disk-that-is-really-full.md)). The spike of 0223 ran no step beside the
  procedure, so the room freed may be taken first by the steps that callers retry. It is bug 50 of the
  [roadmap](roadmap.md), not checked. It would be decided by:
  - a run of `spikes/full-volume.test.ts` on the CI's volume, with steps beside the procedure.

- **A consumer of a topic a newer version dropped.** A consumer that is gone leaves by `forget`
  ([decision 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)), and a deploy keeps a stored consumer it no
  longer declares ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). `forget` refuses a
  topic the program does not publish ([decision 0138](decisions/archive/0138-the-log-publishes-topics.md)), and a newer version may
  drop or rename a topic. So the consumer can never be forgotten, and its rows stay under every prune. It is bug 76 of
  the [roadmap](roadmap.md), reproduced. It would be decided by:
  - whether `forget` takes any topic a stored consumer names, or a deploy drops, with a warning, the consumers of a
    topic it does not publish;
  - what a reader of `consume` of the dropped topic does on an older runner, which acks on.

## Running

- **A timer due, which no test of the capacity reaches.** An entity whose timer is due is not spare, and is not told
  to leave a process over its capacity before the timer fires
  ([decision 0078](decisions/archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)). The test `entities woken past the
  capacity each fire their timer and leave once`, in [`src/runtime/loop.test.ts`](../src/runtime/loop.test.ts), was
  written for it, and passes with the timers taken out of `spare` of `src/runtime/loop.ts`: under every seed of
  2,000, at depth 10, and under every deviation of `bound` 1, on 2026-11-11. The firing seems to be queued before
  the entity is told to leave, so its loop applies the firing first, and no timer is due when it decides. So no test
  holds the rule, as [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md) says
  of an interleaving no seed finds. It would be decided by:
  - a reading of the order of the firing and of the telling to leave, in `enter` and in the waker, which says whether
    the rule can be reached at all;
  - a test where the entity is told to leave between the activation and the arming of its timer, if it can be, with
    a pin against the timers taken out of `spare`;
  - or, if it cannot be reached, a note that says the clause of `spare` keeps nothing, and drops it.
- **A runtime that loses its session on PostgreSQL.** A runtime holds a database of PostgreSQL with a session
  advisory lock, on a connection it reserves for its scope
  ([decision 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). The lock goes with its
  session, as PostgreSQL documents. A server that ends the session, by `idle_session_timeout`, a restart or a broken
  connection, gives the lock back while the runtime still runs, and nothing tells the runtime. A second runtime may
  then launch on the database, and the two load the same entities
  ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)).
  [`spikes/postgres-session-ended.test.ts`](../spikes/postgres-session-ended.test.ts) sees it on a server: once
  `pg_terminate_backend` ends the reserved session, the first runtime still answers `Accepted`, a second launches,
  and three sends accepted by the two leave a count of two, since the first steps from the state it holds in memory
  and writes over the second's step. Whether the runtime checks its hold, and how often, is not decided. It waits
  for the step on Cluster across machines on PostgreSQL in the [roadmap](roadmap.md), whose fence would make every
  commit check it ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). It would be decided by:
  - what a check costs a step: a statement of the reserved connection, or a reading of `pg_locks`, against a fence
    that a commit checks anyway.
- **The margin of a caller's rows on Cluster, once runners have clocks of their own.** Cluster's rows of a caller's
  request are kept for two polls of replies and a second after its client has the answer, so that every other client
  of the request reads its reply first
  ([decision 0248](decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)). The second covers
  the clocks of the runners, which share one clock while Cluster runs on one machine. Whether the margin holds once
  runners run on machines of their own is not decided. It waits for the step on Cluster across machines on
  PostgreSQL in the [roadmap](roadmap.md). It would be decided by:
  - how far the clocks of two runners may differ, and whether the time a row is kept until is read from the
    database's clock instead of a runner's;
  - whether a client that missed its polls still waits for ever, or Cluster gives it a way to learn that its rows
    are gone;
  - whether the least time takes the longest poll of replies of the runners on the file, since a second client on a
    runner that polls more slowly than the runner that keeps the id waits for ever, which is bug 89 of the
    [roadmap](roadmap.md), reproduced.
  - the same of a reply's `until`, which the clock of the runner that steps writes, and the clock of the runner
    that holds the shard at a retry reads, as the premise review of Messages, requests and replies found
    ([`reviews.md`](decisions/reviews.md)).
- **A test of Cluster that times out under the whole run.** `` an operation is woken by a `Resumed` delivered before
  its client gives it the answer Suspended ``, in [`src/cluster.test.ts`](../src/cluster.test.ts), failed once on
  2026-11-11 in a whole run of `bun test` on the maintainer's machine. Its wait for the first answer `Suspended` to be
  withheld timed out after 15 seconds. It passed six runs alone, in 3.5 seconds each, and two runs of its file. Its
  runners poll on a clock that is real, so the cause may be the load of the run, or an interleaving the test does
  not hold.
  [Decision 0250](decisions/0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md) moved the test out of
  `bun test`, to `bun run test:slow`. What makes it time out is not known. It would be decided by:
  - runs of `bun run test:slow` and of `bun run test:release` again and again, which find it failing again, or not;
  - a log of the runner's Cluster rows when it fails, which says whether the answer `Suspended` was ever saved, or
    whether the storage saw it and did not withhold it.
- **A drain across a deploy of a newer version on Cluster.** A planned stop waits for the at-most-once operations
  under way, so that a deploy does not deliver `unknown`
  ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)), and the drain
  holds on Cluster, tested with two runners of one version
  ([decision 0219](decisions/0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)). A runner of a newer
  version takes the shards of the older runners as it launches
  ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
  The older runner then loses the shard before its scope closes: its entities crash, their operations are
  interrupted, and the newer runner delivers `unknown`. A completion stepped during a drain after a newer launch
  would die in the guard of the version too, which is read in the code and not tested. The test `a rolling deploy to
  a newer version drains the at-most-once operation under way on the older runner`, a todo of
  [`src/cluster.test.ts`](../src/cluster.test.ts) that `bun test --todo` runs, expects `done` and gets `unknown`. Any move of a shard
  interrupts an at-most-once operation, which
  [decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)
  accepts. Whether a rolling deploy drains is not decided. It would be decided by:
  - whether an older runner can keep a shard, and commit the completions of its at-most-once operations, while a
    newer version is recorded, without two versions writing one entity;
  - whether the procedure of a deploy stops the older runner, with its drain, before the newer one launches, and
    what the entities of its shards wait meanwhile;
  - whether the design says instead that a drain serves a stop, and not a deploy of a newer version on Cluster.
- **A door that changes between two releases of the library.** The door of a program on Cluster is a set of RPCs
  whose payloads are the same at every version of the program
  ([decision 0085](decisions/archive/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)), so a
  newer version of a program reaches an older runner's step, whose guard dies
  ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
  A release of the library that adds an RPC to the door, as `Resumed` was added
  ([decision 0167](decisions/archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)),
  or changes a payload, is not caught by that guard. A runner of the older release that still holds a shard, before
  the next health check or after it starts again, is given the newer request by Cluster before any step runs. Cluster
  answers a payload it cannot decode with a defect and stores it, as
  [`spikes/cluster-older-runner-answers-a-newer-request.test.ts`](../spikes/cluster-older-runner-answers-a-newer-request.test.ts)
  sees, so the request is lost in silence. An RPC the older runner does not know fails in Cluster's code, as the
  description of [Effect-TS/effect#10270](https://github.com/Effect-TS/effect/pull/10270) says; no spike runs it.
  That pull request would have left such a request in storage for a runner that decodes it. It was closed without a
  merge on 2026-11-05, and Effect's maintainers are weighing a way to version deploys, with no release holding one
  yet. Whether a rolling deploy across two releases of the library is safe is not decided. It waits for a release of
  Effect, or for the first release of the library, after which a change of the door's form is itself the change
  that breaks a rolling deploy. It would be decided by:
  - a release of Effect whose Cluster leaves for another runner a request it cannot decode, or versions its deploys,
    found by `scripts/compare-docs.ts` at a move of Effect's version;
  - a door of one RPC whose payload names the kind of request as text, so that Cluster decodes every request, and an
    older runner's step dies on a kind it does not know, which saves no reply;
  - a sentence of the design that excludes a rolling deploy across two releases of the library that change the door.
- **The deletions of a reply on a pool of PostgreSQL.** A reply to another entity's operation is kept while the
  work that asked holds ([decision 0021](decisions/archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
  Two statements keep it: the receiver's step deletes the reply it stores where the asker's key is gone, and the
  asker's step deletes the replies to the work that ends. They rely on transactions that come one after the other
  ([decision 0090](decisions/archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)). On a server of
  PostgreSQL with a pool the steps of two entities run at once, at `READ COMMITTED`
  ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). The receiver's step still sees the asker's
  key, whose deletion is not committed, and the asker's step does not see the reply, whose insertion is not
  committed. Both commit, and the reply stays for ever, since it has no time for `expire`. It is a row left, and no
  wrong answer. It happens where work ends while its request is still handled, as an operation that times out its
  own `send` does. An answer no entity stores, kept for an operation in `effecttea_answers`, is kept and deleted by
  the same two statements
  ([decision 0253](decisions/0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md)), and may
  stay for ever in the same way. It is only reasoned: no test runs it. It would be decided by:
  - a test in [`src/postgres.test.ts`](../src/postgres.test.ts), on the CI's server, that holds the two steps at
    their statements and finds the row, of a reply and of an answer;
  - whether the receiver's step locks the asker's key as it reads it, or a sweep deletes the replies whose asker's
    work is gone.
- **A step of a drain that changes a droppable operation.** A planned stop drains the at-most-once operations, and
  starts no other work
  ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)). A step during the
  drain may change a droppable operation, which gives it a new incarnation
  ([decision 0128](decisions/archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md)). The runtime does not
  start the new incarnation, since it drains, but the machine counts it as running. The next activation should start
  it again, as an operation found stored with no completion. The premise review of 2026-11-11 noticed the case and
  did not check it. It would be decided by:
  - a test of `src/runtime/loop.ts` that stops a process while an at-most-once operation drains, sends a message
    that changes a droppable operation, and checks that the next activation starts the new incarnation;
  - whether anything reads a droppable incarnation as running before the process ends.
- **A resume whose program drops a droppable operation kept while suspended.** An entity suspended with a droppable
  operation under way keeps it, and a resume may run under a program that drops or changes that operation. In one
  process a name is deployed once
  ([decision 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md)), so the program cannot change
  between the suspension and the resume. On Cluster, a runner of an older version holds its entities until it
  crashes or stops, and a runner of a newer version may resume them. The premise review of 2026-11-11 reasoned that
  the older runner's entities end first, and did not check it. It would be decided by:
  - a test of `src/cluster.test.ts` with two runners of two versions, where the newer resumes an entity the older
    suspended with a droppable operation under way;
  - whether the resume reconciles the stored operations with the program, as an activation does.
- **An operation's kept answer on Cluster across a crash, and under two runs at once.** An answer no entity stores is
  kept for the operation that was given it, and the door's step answers the request again with it
  ([decision 0253](decisions/0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md)). A
  test with a Cluster the test plays holds the door's step. No test runs an operation on Cluster that is given the
  answer, crashes, and runs again. The rule also reads the kept answer outside the receiver's lock, since the runs of
  one incarnation are one after the other. A crash forks the stop of its entity's operations and does not wait for
  it, as bug 31 of the [roadmap](roadmap.md) says. So the next run may start before the old run ends: on one process
  `retry` after the crash, and on Cluster on the runner that gains the shard. The new run may then read no answer
  before the old run keeps one. It would be decided by:
  - a test of `src/cluster.test.ts` that gives an operation `Rejected`, crashes the sender's entity, creates the
    receiver, and checks the next run, which family C of the roadmap makes possible;
  - whether two runs of one incarnation at once may act on different answers, as they may act twice on any answer,
    or the answer is read and kept under the receiver's lock.
- **A creation that `init` dies on, on Cluster.** On one process, an operation's creation that `init` dies on
  suspends the sender ([decision 0046](decisions/archive/0046-a-receiver-that-crashes-is-sent-again.md)). On
  Cluster the door dies, and Cluster delivers the creation again without end
  ([decision 0160](decisions/archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)),
  so the operation's `create` waits until a fix is deployed. The sender is not suspended and the receiver does not
  exist, so `suspended` lists nothing, and only Cluster's log of restarts shows it. The sender's entity stays busy,
  and is never unloaded. An operator cannot see what waits. Neither 0160 nor
  [decision 0167](decisions/archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)
  says what holds of 0046's rule on Cluster. The premise review of 2026-11-11 reasoned it, as bug 10 of the
  [roadmap](roadmap.md). Cluster replays the creation first at each restart of the door, so another creator of the
  id, whose flags `init` accepts, waits for ever behind it, where one process answers it `Created`, which is bug 58,
  reproduced. A message to the id waits the same way. It would be decided by:
  - a test of `src/cluster.test.ts` where an operation creates an entity whose `init` dies, which would hang today;
  - whether an operator is meant to see such a creation, and through which call;
  - whether the door answers such a creation with an answer the creator's client resets, as for `Rejected`, or the
    runtime stores the defect in its own tables and frees the id.
- **The rows of operators' events on Cluster.** An operator resumes and discards through the door's client on
  Cluster ([decision 0166](decisions/archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)).
  The premise review of 2026-11-11 noticed that Cluster's rows of those requests may never be deleted, and did not
  check it, which is bug 11 of the [roadmap](roadmap.md). A caller's rows are deleted only under an id its client
  keeps, once it is given the answer
  ([decision 0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)).
  So a caller that stops waiting, as an HTTP boundary's timeout does, keeps its rows for ever, and a retry under its
  request id is answered from Cluster's saved reply past its `keep`, which is bug 59, reproduced. It would be
  decided by:
  - a test that resumes an entity on Cluster and reads Cluster's tables after `expire`;
  - whether a client keeps the id when its caller is interrupted, with a deletion that spares a request Cluster has
    not marked processed, or the guide says such rows stay;
  - for bug 91, reasoned by a reading, whether a second client's `reset` drops only a keep whose answer it read
    ([decision 0249](decisions/0249-on-cluster-a-reset-drops-the-id-a-callers-client-kept.md)), since it may drop the
    keep of the first client's reply and, interrupted then, leave the rows for ever.
- **A cause holding U+0000 in Cluster's tables.** A defect's cause is written as text every database holds, with U+0000
  escaped ([decision 0205](decisions/0205-a-defects-cause-is-written-as-text-every-database-holds.md)), in the
  runtime's tables. A door that dies on such a cause may hand it to Cluster, which stores it in its own tables
  unescaped, and so may a failure Cluster saves
  ([decision 0168](decisions/archive/0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md)). It matters once Cluster runs on PostgreSQL, the step Later of the roadmap. The premise review of
  2026-11-11 noticed it and did not check it. It would be decided by reading what Cluster stores of a defect in
  `node_modules/effect/src`, and a test on the CI's PostgreSQL once that step starts.
- **A failure of the storage that passes.** Every call of a handle but `consume` turns a `SqlError` into a defect,
  with `Effect.orDie`, so a connection that drops for a second reaches a caller as a defect, the same as a bug. A
  boundary that would retry such a failure must catch every defect to find it, and the type of `send`,
  `Effect<Answer>`, says nothing of it. `consume` alone gives the `SqlError` in its error channel. Whether the calls
  of a handle give a failure of the storage as a typed error, or the runtime retries it before it dies, is not
  decided. It waits for the release, since it changes the signature of each call. It would be decided by:
  - which failures of `SqlError` are transient on each dialect, a lost connection or a serialization failure, and
    which are not, a full disk or a missing table;
  - whether a retry inside the runtime keeps the rule that a step is one transaction, applied once, when the commit's
    answer is lost and the commit is not;
  - whether `consume` and the other calls should agree, one way or the other.
- **A model of the runtime's protocol on Cluster.** The protocol between runners is checked by tests, which run the
  interleavings their seeds draw. A model in TLA+, or in a model checker like it, would check every state the
  protocol reaches within its bounds: the shards a runner holds and lets go, a step's commit that checks the shard,
  and two versions at once
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md),
  [decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md),
  [decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)). A model proves the protocol and not the code, so the tests would stay. Whether to write one is not
  decided. It would be decided by:
  - whether the tests on Cluster keep finding interleavings between runners;
  - what the step on Cluster across machines on PostgreSQL in the [roadmap](roadmap.md) adds to the protocol, a
    fence above all.
- **A statement whose condition PostgreSQL reads from its snapshot.** At `READ COMMITTED`, PostgreSQL reads a row a
  concurrent transaction updated again against the outer `WHERE` of an `UPDATE` or a `DELETE`, and against nothing
  for an `INSERT … ON CONFLICT DO UPDATE`. A subquery's rows stay those of the statement's snapshot. Two statements
  of the storage keep their guard where it is not read again, on a pool of PostgreSQL
  ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). The batched `expire` deletes a reply a step
  wrote again with a new time
  ([decision 0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)), and `reindex`
  writes the projection of a state over the row a step committed
  ([decision 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md)). They are bugs 13 and 25 of
  the [roadmap](roadmap.md), each with a test of `src/postgres.test.ts` that no run has reached. It would be decided
  by:
  - the tests run against the CI's server, from the reviewers' branches;
  - a reading of every statement of `src/storage/` whose guard stands in a subquery or in an `INSERT … SELECT`, for
    the same form;
  - whether a fix keeps the guard in the outer `WHERE`, or locks the rows first with `FOR UPDATE`;
  - for bug 49, not checked, a test that holds the sweep's batch and a step's deletion of its entity's replies at
    their rows, and sees whether PostgreSQL ends one of them as a deadlock;
  - for bug 78, a reading of the log that runs several statements, each with a snapshot of its own, and skips a row
    of a partition that commits between them. Whether `published` reads each partition only up to the head it read
    first, or runs in `snapshot`, and whether a `fetch` inside a caller's transaction at `READ COMMITTED` keeps the
    finding under the second fix. Its test of a server is written and has not run;
  - for bug 79, whether the design's advice to begin at `REPEATABLE READ` names `inspect` beside a page of a query
    ([decision 0185](decisions/0185-inspect-gives-what-is-stored-of-one-entity.md));
  - for bug 80, two prunes that drop different rows of one publication at once and each keep it
    ([decision 0154](decisions/archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md)). Whether the trigger locks the
    publication's row first, or a prune takes an advisory lock of the program, and its test of a server, written and
    not run.
- **The cases of a crash's retry not run yet.** The waker activates an entity a crash took out after `retry`, a
  door's step that loaded an entity and rolled back leaves it unsettled, and an entity is not unloaded while a
  door's step is uncommitted ([decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)). Tests hold a failed write on one process, an expired lease
  on Cluster, a load whose commit fails through a door, and a passivation in a door's window. The waker's map of
  marks on a shard that moves is bug 33 of the [roadmap](roadmap.md). It would be decided by:
  - a test of a message left in the mailbox by a crash, on one process and on Cluster;
  - a test of a crash of a loop's step on Cluster by a `COMMIT` that fails, and by a row another runner wrote;
  - a test of a load whose commit fails through `activateOnCluster`, from the waker and from a shard's round;
  - a test of an `Evict`, a resumption and a `tell` in a door's window before its commit;
  - a test of bug 33, whose shard moves while the waker waits to retry an entity.
- **A name a rename left.** A launch renames a program and keeps the keys of its old name
  ([decision 0156](decisions/archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). On one process
  nothing keeps a later launch from taking the old name again, and its entities then draw the keys the renamed
  entities hold, which is bug 15. On Cluster the old name is marked for good
  ([decision 0176](decisions/archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md)), and a
  rename back can never run, which is bug 16. Bugs 27 to 30 of the [roadmap](roadmap.md) are the rest of what an old
  name leaves: ids kept under it on Cluster, an operation that still sends to it, a count of `check` during a rename,
  and two programs renamed to one. It would be decided by:
  - whether an old name may be taken again, on one process as on Cluster, and what then draws the keys of each
    entity;
  - a test of each of bugs 27 to 30;
  - the step What a deploy may change of a program, against what is stored, of the [roadmap](roadmap.md), whose
    table holds a rename.
- **A sender and Cluster's round at the least retry.** A launch refuses a `retry` of 0, and a millisecond is the
  least ([decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)). A test shows that
  the waker rests at a millisecond, and only a reading says that a sender whose receiver crashes at every attempt,
  and a shard's round on Cluster that fails, rest at it too. It would be decided by:
  - a test of a sender at a retry of 1 ms, with a receiver that crashes at every attempt or answers `Full`;
  - a test of a round at a retry of 1 ms, with two runners and a row no version reads.
- **A launch that dies after the hold.** A launch refused for an option dies, as
  [decision 0208](decisions/0208-a-launch-checks-every-option.md) says, before anything is held or stored. Its hold
  ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)), its tables and its renames run
  before the checks of most options, in a scope that closes only with the launcher's. So a launcher that tries
  again in the same scope finds the database held, and the renames already moved. It is bug 44 of the
  [roadmap](roadmap.md), reproduced for `retry`. It would be decided by:
  - whether `launchWith` checks every option before the hold, or closes its own scope when it dies after it;
  - a test of each option checked after the hold, in a scope the launcher gives.
- **A resume to a sender no runner deploys.** On Cluster a step that resumes an entity sends `Resumed` to each
  waiting sender from its transaction
  ([decision 0167](decisions/archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)).
  Where the sender's shard is the runner's own, Cluster first waits for the sender's type to be registered, inside
  the transaction. A sender of a program the runner no longer deploys makes the step die, and Cluster delivers the
  resume again without end. Inside the registration window, the wait holds the file's one writer for up to a
  minute. It is bug 20 of the [roadmap](roadmap.md). It would be decided by:
  - whether `Resumed` is sent after the commit, from a row the step keeps until the send;
  - a test of the case inside the registration window, with the refresh of the leases.
- **A caller's request through the door during a drain.** On one process a drain takes no caller's request
  ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)). On Cluster a
  door's step has no such guard
  ([decision 0219](decisions/0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)), so a request starts
  an at-most-once operation that the drain then stops, and the next runner delivers `unknown`. It is bug 21 of the
  [roadmap](roadmap.md), reproduced. A door's step that commits after the drain looked is part of bug 21, and an
  application that builds the runtime and `Sharding` in one parallel scope, and a door's step between the
  interruption of the loops and the close of the door, are bugs 34 and 35. Those three are only reasoned. It would be
  decided by:
  - whether a door's step dies during a drain, so that Cluster delivers the request to the runner that takes the
    shard, or whether `drained` counts a door's step from its start;
  - a reading of Cluster's teardown in `entityManager.ts`, for the order of the loops and the door;
  - a test of a runtime and `Sharding` built in one parallel scope.
- **The forks of an uninterruptible activation.** Every fork from a region that cannot be interrupted says it is
  interruptible
  ([decision 0112](decisions/archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md)),
  since Effect's default may change. The forks of `finishIn`, `forkHeld` and `drop` run inside the activation on
  Cluster, which
  [decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)
  made uninterruptible, and pass no option. Nothing fails at the pinned version. It is bug 22 of the
  [roadmap](roadmap.md). It would be decided by:
  - a check of `src/form.test.ts` that every fork of `src/` passes the option, or a reading of each fork's region.
- **An operation still stopping beside its `unknown`.** A crash forks the stop of its operations and gives the lock
  back ([decision 0056](decisions/archive/0056-nothing-waits-for-an-operation-under-the-permit.md)). The next
  activation records an at-most-once operation's `unknown` while the old fiber may still run a region that cannot be
  interrupted, or a finalizer that acts. The program's answer to the `unknown` may then act beside it. It is bug 31
  of the [roadmap](roadmap.md), not checked. It would be decided by:
  - a test, under the scheduler of `src/testing.ts`, of an operation whose finalizer acts after the crash;
  - whether the activation waits for the stop of the operations a crash forked.
- **Cluster's bound of resident entities.** On Cluster the runtime's capacity is meant to be the only bound of the
  entities a runner holds ([decision 0151](decisions/archive/0151-a-process-holds-ten-thousand-entities-by-default.md)).
  The runtime builds `Sharding.layer` on the launcher's `ShardingConfig`, whose `maxResidentEntities` is 10 000 by
  default, and `ShardingConfig.layerFromEnv` cannot give `'unbounded'`. A door outlives its entity until Cluster's
  reaper finds it, so a burst of callers past the bound waits up to a minute. It is bug 54 of the
  [roadmap](roadmap.md), reproduced. It would be decided by:
  - whether `sharding` gives `Sharding.layer` an unbounded `maxResidentEntities`, or a launch dies on a config that
    holds a bound;
  - a test under a passivation of 0, where the reaper still checks every 5 s.
- **What a newer version answers an older one on Cluster.** A value is read through the migrations from the version
  that wrote it ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)), so a reader is
  never older than the writer. On Cluster a rolling deploy breaks that both ways. A door of the newer version
  answers a caller of the older one with a text that carries no version, and the caller reads a rejection's reason
  through its own schema
  ([decision 0085](decisions/archive/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)), which is
  bug 62, reproduced. A door of the newer version reads the flags of a creation an older caller wrote, which no
  migration reads ([decision 0049](decisions/archive/0049-flags-are-checked-by-their-schema.md)), which is bug 56,
  reasoned. They are of the [roadmap](roadmap.md). It would be decided by:
  - whether an answer carries the version that wrote it, and a client refuses a version its program does not have;
  - whether a program declares a migration of its flags, or a deploy on Cluster may not change their schema while
    a creation waits;
  - the step What a deploy may change of a program, against what is stored, of the [roadmap](roadmap.md).
- **A send after the work it belongs to ended.** A reply to another entity is deleted once the work that asked ends,
  since no one asks again ([decision 0021](decisions/archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
  Two actors may still send under that work. On Cluster, a runner that lost its lease without giving it up may run an
  operation the next holder ran and ended
  ([decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)), which is
  bug 57, reasoned. On one process, a crashed entity's operation that sends from a region it holds uninterruptible
  may send after the new run ended the work
  ([decision 0056](decisions/archive/0056-nothing-waits-for-an-operation-under-the-permit.md)), which is bug 65, not
  checked. Either way the receiver applies the request twice. They are of the [roadmap](roadmap.md). It would be
  decided by:
  - whether a receiver refuses a request whose asker's work no longer holds, by the asker's key row it already reads;
  - a test of bug 65 with an operation that sends from an uninterruptible finalizer;
  - a helper of `src/cluster.test.ts` that keeps a runner's operation running after another runner took its shard;
  - for bug 90, reasoned, whether a door loads an entity of a shard whose singleton has not started, since no
    finalizer then crashes it, and its operations run beside the next holder's.
- **Who an operator sees waiting.** `suspended` lists, for each suspended entity, the operations that
  wait for its resumption, and on Cluster it is meant to read the rows of `effecttea_waiting`
  ([decision 0114](decisions/archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md)). An
  operator may act from any runner
  ([decision 0166](decisions/archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)),
  and the code reads the registrations of the runner called alone. It is bug 63 of the [roadmap](roadmap.md),
  reproduced. It would be decided by:
  - whether `suspended` and `inspect` read the rows of `effecttea_waiting` on Cluster, which hold less than a
    `Waiting`, or a note narrows 0114 to the runner called;
  - on one process, whether the list holds the operation of a suspended sender after a restart. The operations of a
    suspended entity run on ([decision 0113](decisions/archive/0113-a-suspended-entitys-operations-run-to-their-end.md)),
    and a process starts no suspended entity
    ([decision 0071](decisions/archive/0071-a-process-starts-the-entities-with-a-message.md)). So such an operation is
    listed before a restart and not after it, which is bug 72, reproduced. A reading of the stored operations of the
    suspended senders would hold it, or a note that narrows 0114 to the operations that run.
- **A hash of Effect that moves the shards.** An entity's partition is stored, so that a change of `Hash.string`
  moves nothing ([decision 0137](decisions/archive/0137-the-log-is-ordered-within-a-partition.md)). On Cluster the
  partition is the shard
  ([decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)),
  which Cluster computes from the id at each delivery. A release of Effect that changes the hash leaves an entity
  under a partition no round of its shard reads, and it is dropped with no log. A test of `src/storage.test.ts`
  fails at such a move. It is bug 64 of the [roadmap](roadmap.md), reasoned. It would be decided by:
  - what the rule of `AGENTS.md` for a move of Effect's version does when that test fails;
  - whether a launch on Cluster checks that the stored partitions of a sample of entities are the shards Cluster
    gives their ids.
- **A deploy that the planned stop interrupts or that fails in the drain.** The drain reaches a deploy still
  activating, and the deploy activates nothing once the drain began
  ([decision 0261](decisions/0261-the-drain-reaches-a-deployment-still-activating.md)), which fixes bug 66 of the
  [roadmap](roadmap.md). A deploy that fails before it registers still closes its scope at once
  ([decision 0051](decisions/archive/0051-a-deploy-that-fails-leaves-nothing-running.md)), and its at-most-once
  operations are interrupted and deliver `unknown`. A planned stop while the main fiber deploys is such a failure: the
  interruption undoes the deploy
  ([decision 0102](decisions/archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md)) before the drain
  begins, which is bug 67, not checked. It would be decided by:
  - whether an undo leaves the deployment's scope to the drain when the launch has `drain`, so that the drain waits
    for its at-most-once operations;
  - a test that interrupts the main fiber while its deploy waits at an activation, with an at-most-once operation of
    an earlier entity under way.
- **A drain on Cluster with a deploy under way.** On Cluster, the singleton of a shard activates the entities of the
  shard before the deployment registers. The drain reaches them through the deployments it holds from the claim of
  the name, as on one process ([decision 0261](decisions/0261-the-drain-reaches-a-deployment-still-activating.md)),
  but no test runs a drain on Cluster with a deploy under way. The round of a shard's activation goes on in the
  drain, and may start an at-most-once operation there, which the drain then waits for. It would be decided by:
  - a test of `src/cluster.test.ts` that stops a runner while a shard's round activates its entities;
  - whether the round stops at the next entity once the drain began, as the activations of one process do.
- **Two programs of one version on Cluster.** A version is the count of a program's migrations plus one
  ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)), and an older runner is kept from
  every shard by the version recorded
  ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). A
  deploy that changes `update`, an index, a topic or `work` and adds no migration has the version of the runners it
  replaces. So in a rolling deploy both codes hold shards, and a shard that moves back is stepped by the older code. A
  query by a new index then misses the entity, or an operation of a new key suspends it. It is bug 68 of the
  [roadmap](roadmap.md), reasoned. It would be decided by:
  - whether a launch records a digest of what a program writes beside its version, and refuses a program of the
    newest version whose digest differs from a runner's still registered;
  - a test of `src/cluster.test.ts` with `onFile` and two runners of one version whose programs differ by an index;
  - the step What a deploy may change of a program, against what is stored, of the [roadmap](roadmap.md), whose table
    asks of a newer and an older version and not of one of the same number.
- **A deploy that fails after its door is registered.** A failed deploy gives its name back, so that the program can
  be deployed again ([decision 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md)). On Cluster the
  door is registered in the deployment's scope
  ([decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)), and
  Cluster never unregisters an entity type. So the next deploy of the name keeps the first door, closed. It is bug 70
  of the [roadmap](roadmap.md), reproduced. It would be decided by:
  - whether a runner keeps a name for its life once its door is registered, or `register` of `src/cluster.ts` reuses
    the type it registered;
  - a test of a deploy interrupted between `cluster.register` and its registration, and of the doors a rename's old
    names keep.
- **The warnings on Cluster.** The runtime warns of a step that writes a large state
  ([decision 0135](decisions/archive/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)), and of
  a full entity ([decision 0147](decisions/archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md)), so
  that an operator finds the entity that holds the others. On Cluster a door's step drops the length it wrote, so a
  caller's creation or message never warns, which is bug 73 of the [roadmap](roadmap.md), reproduced. No caller is
  answered `Full` on Cluster
  ([decision 0165](decisions/archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)),
  and nothing names the entity a burst waits for, which is bug 74, not checked. It would be decided by:
  - whether a door's step warns once its commit is known, and whether a step rolled back warns;
  - whether a burst that waits in Cluster's table on one entity is told to an operator, and by what.
- **A row the waker's reading refuses, on Cluster.** In one process the waker leaves out an entity whose stored time
  it refuses, and reads again after `retry` a reading that fails
  ([decision 0259](decisions/0259-a-reading-of-the-waker-that-fails-is-read-again-after-the-retry.md)). On Cluster the
  waker reads the same `due` by the shards it holds, and no test runs that reading against a row refused or a reading
  that fails. It would be decided by:
  - a test of `src/cluster.test.ts` whose runner's waker meets a time refused in a shard it holds, and a timer of
    another entity of the shard that fires;
  - the same test with the reading failing, as the step The tests of a contract on every backend would run it.
- **A second runtime on one database.** A database is held by one runtime
  ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)). On Cluster a shard's lock takes the place of the
  hold ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), and keeps off only another
  runner. So a runtime of one process launches on a runner's database, and a step is lost, which is bug 84 of the
  [roadmap](roadmap.md), reproduced. A data directory of PGlite is held in the process while the client a runtime
  launched on is open ([decision 0255](decisions/0255-a-data-directory-of-pglite-is-held-while-its-client-is-open.md)),
  which fixes bug 86. Another process over the directory, or a client of this one that launches no runtime, still
  steps a copy of its own, and the close of the last writes its copy over the others', as a spike sees. Nor does the
  register know the directory under a symbolic link, or under another case on a file system that ignores case, nor
  in a second copy of the library loaded in the process. A launcher that
  builds Cluster's `SqlMessageStorage` on a client of its own commits a step and its reply apart
  ([decision 0081](decisions/archive/0081-on-cluster-a-step-commits-with-its-reply.md)), which is bug 85, not checked. It would be
  decided by:
  - whether a runner's launch adds its client to `held`, and takes the advisory lock in shared mode where a runtime of
    one process takes it exclusive;
  - whether PGlite gives a lock of its data directory across processes, which `hold` would take;
  - whether `hold` names a directory by its real path, which `realpath` gives through links and cases, and a test with
    a link to the directory;
  - whether a launch on Cluster checks that the runtime's client is the client of Cluster's `MessageStorage`, and a
    test that kills a runner between the two commits.
- **A check beside the old version on SQLite.** `check` takes no lock, so that it runs on a database the old version
  holds ([decision 0247](decisions/0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md)). A file
  of SQLite is held in the exclusive locking mode, so a check from a process of its own dies with `database is
  locked`. It is bug 87 of the [roadmap](roadmap.md), reproduced. It would be decided by:
  - whether a note narrows 0247 and the design to a stopped version or a copy of the file, or the old runtime gives
    the check through its handle;
  - a run on a server of PostgreSQL under a role of rows alone, which reads `effecttea_migrations` by name.

## Programs

- **A retry that outlives the process.** A failure the provider may recover from is retried inside the runner, with
  `Effect.retry` and a schedule that ends, under the same key (the guide's operations). A crash or a passivation
  starts that schedule again from its first attempt, and an operation that waits between tries keeps its entity
  loaded. A retry over hours or days is written in the state, as `examples/subscription` counts its attempts behind a
  timer. Whether the guide gives that form as a recipe, or the library a helper that writes it, is not decided. A
  helper would hold the attempts in the state, where the program's schema holds them. It waits for a second program
  that retries behind a timer. It would be decided by:
  - how much of `examples/subscription` a second program would write again, state and messages included;
  - whether a helper can add its attempts and its timer to a program's state and keys without hiding them from
    `update`, `work` and the rehearsal.

- **Request ids under a sender of `null`.** A caller's request id is stored under its sender
  ([decision 0048](decisions/archive/0048-a-callers-request-belongs-to-its-sender.md)), and decision 0124 keeps
  callers apart because a sender as fine as an identity keeps their ids apart.
  [Decision 0180](decisions/0180-a-program-leaves-out-what-it-does-not-have.md) makes a sender left out a
  `Schema.Null`, so every caller of such a program shares one space of request ids. A caller that sends an id another
  caller used gets that caller's stored reply, and its own message is never applied, with nothing reported. Neither
  `docs/design.md` nor the guide says so. Whether the guide requires such a program's ids to be unique across its
  callers, or the boundary always gives a sender, is not decided. The premise review of 2026-11-11 found it by
  reading, and no test holds it. It waits for a program whose callers do not identify themselves. It would be
  decided by:
  - whether a boundary that takes callers it cannot tell apart is a case the library serves at all;
  - whether a sender left out should still be required where the program takes inbound messages.

- **A retry in a rehearsal after a deploy that changes how the sender is written.** A rehearsal keeps the reply of a
  request the test named for the whole rehearsal, a deploy included
  ([decision 0200](decisions/0200-a-rehearsal-sends-under-a-request-id-the-test-names.md)). It stores the reply under
  `Machine.requestKey`, the request's text with the sender as the deployed program's schema writes it
  (`src/rehearse.ts`). A deploy whose `sender` schema writes the same sender otherwise changes that text, so a retry
  under the same request id may not find its reply, and the rehearsal applies the message again. The set of named
  requests is keyed by the same text. The runtime finds a caller's request by its id and migrates it
  ([decision 0065](decisions/archive/0065-the-machine-holds-no-replies.md)), so it answers the retry from the stored
  reply. The premise review of 2026-11-11 noticed the case and did not reach it, so it is neither reproduced nor ruled
  out. It would be decided by:
  - a test of `src/rehearse.ts` that sends under a request id, deploys a version whose `sender` schema writes the
    sender otherwise, and retries under the same id;
  - whether the runtime, read in `src/storage/` and `src/runtime/callers.ts`, does find the request by its id across
    such a deploy, as the review read.
- **A rehearsal of a downtime.** A repeating timer catches up after a downtime by firing at a time already past,
  again and again, and the runtime runs that
  ([decision 0130](decisions/archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md)). A rehearsal fails a
  key whose timer fires twice at one time ([decision 0187](decisions/0187-a-rehearsal-moves-time-by-a-duration.md)),
  and time stands still while its timers fire, so every catch-up fails it. It is bug 42 of the
  [roadmap](roadmap.md), reproduced. It would be decided by:
  - whether the check fails only on a key armed again at the time it was due, or earlier, so that a timer whose due
    time moves forward at each firing passes;
  - what a rehearsal of a downtime is: a start after the timers, a `fire` of a later timer, or a deploy that arms one
    in the past.
- **What a test of a projection gives `allows`.** `projectionViolations` checks a projection's `allows` with the
  sender ([decision 0213](decisions/0213-a-projections-allows-is-given-the-sender.md)). It gives `allows` the
  projection as `project` returns it, not as a caller reads it from its JSON, and gives `update` the sender
  unmigrated. A projection that holds `-0` is then checked as no caller reads it. It is bug 38 of the
  [roadmap](roadmap.md), not checked. It would be decided by:
  - a case of `src/testing.test.ts` whose projection holds `-0`, and one whose sender a migration changes.
- **What a boundary acknowledges.** A boundary that reads a stream acknowledges an item to its source once `send`
  is answered ([decision 0127](decisions/archive/0127-a-live-stream-feeds-its-entities-from-the-boundary.md)). Three
  answers store nothing: `Suspended` ([decision 0023](decisions/archive/0023-suspended-means-no-reply-yet.md)),
  `Full` ([decision 0147](decisions/archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md)) and
  `NotFound`. An item answered so is lost, with nothing reported. It is bug 60 of the [roadmap](roadmap.md),
  reasoned. It would be decided by:
  - a note that changes 0127: a boundary acknowledges an item once it is answered with a reply, and sends it again
    under the same request id after `Suspended` or `Full`.

## The surface

- **A reason an operator gives to a discard.** A discard of a message an operation sent stores a rejection with a
  reason of `null` ([decision 0260](decisions/0260-a-discard-of-a-message-an-operation-sent-stores-a-rejection.md)).
  The sender cannot tell it from a bare `reject` of the receiver, though a discard says the receiver had a bug and
  an operator dropped the message. An operator could give the reason, as `discard(id, { reason })`, typed by the
  receiver's schema of rejections, with `null` when none is given. The rule of decision 0260 would not change. It
  would cost an encoding of the reason on the operator's path, and a payload in Cluster's request `Discard`. A
  program whose schema of rejections is `Never` could take no reason. It would be decided by:
  - a program that acts otherwise on a discard than on a rejection, as one that alerts or sends again later;
  - whether a reason the receiver's schema declares for a discard reads as the receiver's own rule.
- **An own message named like a child, with a tag typed `string`.** A parent's own message that takes the name of a
  child is refused by the compiler alone (`Checks` in `src/program.ts`), since `update` routes a message whose `_tag`
  is a child's name to that child
  ([decision 0133](decisions/archive/0133-an-entity-composes-children-as-effect-tea-does.md)). An own message whose
  schema types `_tag` as `string` passes the check, as a list of keys typed `string[]` did before
  [decision 0199](decisions/0199-a-list-of-keys-names-each-key-by-a-literal-type.md) refused it. Such a message,
  tagged with a child's name at run time, goes to the child. Whether the compiler refuses an own `_tag` typed
  `string` beside children, as 0199 does for keys, is not decided. The premise review of 2026-11-11 found it by
  reading, and no test holds it. It waits for the release, since it changes what compiles. It would be decided by:
  - whether an own message with a `_tag` that is not a literal has a use in a program with children;
  - whether a test of types can show the declaration compiles today.

- **A handle divided by who uses it.** A handle gives more than twenty calls in one interface: a caller's `create`,
  `send` and `read`, the queries, the log's `published`, `fetch`, `ack` and `consume`, and an operator's `suspended`,
  `inspect`, `resume`, `discard`, `prune`, `forget`, `expire` and `reindex`. A boundary that serves callers holds the
  operator's calls too. Whether a handle is divided into views, one for callers, one for readers of the log and one
  for an operator, is not decided. It waits for the release, since the surface changes. It would be decided by:
  - the boundaries of the examples, and which calls each uses;
  - whether a view is a type over one handle, or a value a deployment gives, so that a boundary cannot reach what
    it was not given.
- **The prefix of the spans and the metrics.** The runtime names its spans, their attributes and its metrics with
  `tea.`, as `tea.step` and `tea.mailbox.length`, which a scrape of Prometheus reads as `tea_mailbox_length`
  ([decision 0220](decisions/0220-the-runtime-records-a-span-for-each-step-and-each-operation.md)). Decision 0220
  gives as its reason that every object the runtime makes is named with `tea_`. That reason fell the same day:
  [decision 0218](decisions/0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md) names the tables with
  `effecttea_`, since `tea` is a word an application plausibly uses. A backend of metrics holds the series of every
  service it scrapes, so a metric of an application about tea may share a name with the runtime's. Whether the spans
  and the metrics are named with `effecttea.`, as the tables are, is not decided. A rename after the release changes
  every dashboard and alert a deployment wrote. It would be decided by:
  - whether the names of OpenTelemetry's attributes for a library are expected to carry the library's whole name, as
    in its conventions for instrumentation libraries;
  - whether a backend a deployment uses already holds a series named `tea_…`.
