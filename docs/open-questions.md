# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it. Each
question says what it waits for: a step of the [roadmap](roadmap.md), a release of a dependency, or a program
with a requirement that no example has yet.

## Storage and reading

- **A launch within a transaction of its client, on a file of SQLite.** SQLite refuses an `ATTACH` within a
  transaction, so a launch within `sql.withTransaction` on a file may die at the hold's `ATTACH` with an `SqlError`,
  where [decision 0279](decisions/0279-createtables-dies-within-a-transaction-of-its-client.md) gives `createTables`
  a defect that says why. The hold's `onError` detaches, so nothing would stay held. The second reading of the
  premise review noticed it on 2026-11-12.
  - A test that launches within `sql.withTransaction` on a file, and reads which defect it dies with, would decide it.
- **On a pool of PostgreSQL, a `position` that rises with `seq` within a partition.** The log is ordered within a
  partition ([decision 0137](decisions/archive/0137-the-log-is-ordered-within-a-partition.md), only reasoned there).
  `write` of `src/storage/entities.ts` moves the head before it inserts the rows of the outbox, so the identity of a
  row is drawn under the head's lock, and the next step of the partition draws its own after the commit. Decision
  0222 tests that two writers of one partition commit in the order of their `seq`, on the CI's server, and was not
  read for `position`. Bug 78 is the reading's side of the same order. The second reading of the premise review
  noticed it on 2026-11-12.
  - A test of `src/postgres.test.ts` with two writers of one partition, held at their statements, that reads
    `position` and `seq` of their rows, would decide it.
- **On Cluster, a deploy that stores a consumer while another runner's sweep prunes.** The comment of `pruneBatch` in
  `src/storage/log.ts` and [decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)
  say that a cursor only rises and that a consumer is stored only by a deploy. `forget` deletes a consumer's cursors,
  and on Cluster another runner's deploy stores a consumer during a prune. A batch reads the consumers and the cursors
  in its one statement, so it drops only rows committed before the consumer was stored, which the consumer does not
  hold. It was not run with two runners. The second reading of the premise review noticed it on 2026-11-12.
  - A test of `src/cluster.test.ts` whose second runner deploys a consumer while the first runner's sweep prunes the
    topic would decide it, and the comment of `pruneBatch` would follow it.
- **A selector that dies on one stored row stops every reader of its topic there.** A selector of the program deployed
  that dies on a row gives the defect to whoever reads the row
  ([decision 0140](decisions/archive/0140-a-row-of-a-topic-gives-its-value.md)). So every reader of `consume` of its
  topic stops at that row, and its consumer holds the topic from that row under every prune
  ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). Only a deploy that
  fixes the selector, or a `forget`, frees the topic, and no note says so. The second reading of the premise review
  noticed it on 2026-11-12.
  - Whether the guide says how an operator frees a topic held by such a row would decide it.
- **An array with an own property besides its indices.** `isJson` of `src/program.ts` reads only the indices of an
  array, and `JSON.stringify` drops any other own property
  ([decisions 0040](decisions/archive/0040-what-is-stored-encodes-to-json-as-it-is.md),
  [0210](decisions/0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md)). So what is stored would
  differ from what the schema encoded. Only a schema whose encoding gives such an array reaches it, and none was
  tried. The second reading of the premise review noticed it on 2026-11-12.
  - A test of `src/program.test.ts` that gives `isJson` such an array would decide it.
- **The comment of `warn`, which counts a projection in each topic.** The comment of `warn` in `src/runtime.ts` says
  that a step's characters are counted in the read model and in each topic of the outbox, and cites decision 0138.
  Since [decision 0154](decisions/archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md) the projection is
  counted once in the outbox, as `write` of `src/storage/entities.ts` counts it. The second reading of the premise
  review found it by a reading on 2026-11-12.
  - A reading of `write` against the comment, and a comment that cites decision 0154, would settle it.
- **A state written back to the text `reindex` read, at the version it read.** `reindex` writes a row only where the
  stored state and version are those it computed from
  ([decision 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md)). A step that changes a state
  and a step that changes it back, or an end and a creation under the same id with the same first state, both land
  between the reading and the writing. `reindex` then writes its row, which is the projection of that same text by the
  program deployed. This holds while a projection is a function of the state alone, as
  [decision 0032](decisions/archive/0032-a-projection-is-a-row.md) says, and no test runs the sequence. The second
  reading of the premise review noticed it on 2026-11-12.
  - An explored test that runs two such steps between `reindex`'s reading and its write, and reads the row after,
    would decide it.
- **The order of the fields of a work, a projection and a topic's value.** Decision 0058 compares two works with their
  fields in any order, and `canonical` of `src/machine.ts` sorts the fields of every object before a comparison. The
  columns are `TEXT` on both dialects, never `jsonb`, so PostgreSQL does not reorder what it holds. Only `what a
  request carries encodes to one text (decision 0269)`, of `src/machine.test.ts`, tests `canonical`, through a
  request's key. The second reading of the premise review noticed it on 2026-11-12.
  - A test of `src/machine.test.ts` that compares two works, projections and topic values whose fields differ only in
    order would decide it.
- **A query that pages across `reindex`.** A row no step changes is given exactly once, on one page
  ([decision 0143](decisions/archive/0143-a-query-pages-after-the-last-row-it-gave.md)). `reindex` writes the rows of a
  program again with no step, after a deploy that changed an index, so a caller that pages across it may be given a
  row twice or not at all. Decision 0072 sends a consumer that needs every entity to `query` once `reindex` has run,
  so the case is a caller that pages across a deploy. The second reading of the premise review noticed it on
  2026-11-12.
  - Whether the guide says that a query paged across a deploy that changes an index may repeat or skip a row, or a
    test that pages across `reindex` and counts the rows given, would decide it.
- **Rows of the read model read without their schema.** Decision 0062 reads every row through its table's schema,
  the aggregates included. `storedIndexes`, at `src/storage/projections.ts:459`, reads a row's `indexes` with
  `JSON.parse` and a cast, and `countBy`, at line 452, casts the value it parses. The count of `effecttea_entity_keys`
  at `src/storage/cluster.ts:201` is read with `Number` and no schema. A row whose `indexes` is JSON but no object
  fails a query with a `TypeError`, a defect that names no table. The second reading of the premise review found it
  by a reading on 2026-11-12.
  - A test of `src/storage.test.ts` with a row of `indexes` written by hand as a JSON array would decide it, and a
    reading through the schema of `Rows` would fix it.
- **A query on Cluster that takes SQLite's write lock.** Every page runs in `snapshot`, and an explicit transaction of
  `SqliteClient` takes the write lock for its length, though it only reads, as its JSDoc says. So a page of one runner
  that waits past the busy timeout of 5 s for another runner's lock dies with `SQLITE_BUSY`. It is the form of bug 36,
  under A reindex on Cluster above, for a reading. The second reading of the premise review noticed it on 2026-11-12.
  - A test of `src/cluster.test.ts` with `withholding`, whose step holds the write lock while the other runner reads a
    page, would decide it.
- **A caller of `published` that passes the last row of a page.** `docs/design.md` and
  [decision 0141](decisions/archive/0141-a-query-and-a-reading-of-the-log-take-a-limit.md) say that a caller of
  `published` reads again past the last row it was given, from the cursors of that row. A row carries the cursor of
  its own partition alone, and `cursorsOf`, at `src/storage/log.ts:83`, reads a partition with no cursor in `after`
  from 0, as the comment of `Handle.published` says. So a caller that passes only the last row of a page reads again
  the rows of the other partitions that the page gave. The second reading of the premise review found it by a reading
  on 2026-11-12.
  - Whether the guide says the caller passes the highest cursor of each partition among the rows given, or
    `published` gives the cursors to pass with the page, would decide it.
- **A launch given `tables: 'existing'` does not run the refusal of decision 0263.** A launch dies where a schema
  further on the `search_path` holds the tables
  ([decision 0263](decisions/0263-a-launch-dies-where-a-schema-further-on-the-search-path-holds-the-tables.md)). A
  launch given `tables: 'existing'` runs no `firstSchema`, at `started` of `src/runtime.ts:1054`, so the refusal does
  not run there. Every statement then resolves through the `search_path` to that schema, so the runtime reads one set
  of tables, and only an operator's later `createTables` dies. The second reading of the premise review noticed it on
  2026-11-12.
  - A test of `src/storage.test.ts` on PGlite, a launch given `'existing'` under the `search_path` `runtime, public`
    with the tables in `public`, and a reading of where a step writes, would decide it.
- **A release older than the database's latest migration.** It launches on the database and runs nothing, as
  [decision 0216](decisions/0216-the-tables-are-made-by-effects-migrator.md) says. Yet `tablesMade` makes `check`
  die on that database (decision 0247). On Cluster, in a rolling deploy whose newer release adds a migration `0002`,
  the older runners would step on the changed tables. No release has a second migration, so no test reaches the case
  yet. The second reading of the premise review noticed it on 2026-11-12.
  - The first release with a second migration, and a test of `src/cluster.test.ts` of an older runner beside it,
    would decide it.
- **A first launch on a full volume, where the hold file is missing.** A first launch on a database whose hold file is
  missing writes the hold file's first page and its journal
  ([decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md)). A
  database copied without its hold file is such a case. The write may fail with `database or disk is full` before the
  operator's forget, and `spikes/full-volume.test.ts` launches where the hold file exists. The second reading of the
  premise review noticed it on 2026-11-12.
  - A case of `spikes/full-volume.test.ts` that removes the hold file before the launch would decide it.
- **Two runners of one process on one file of SQLite, each running `createTables`.** The helper `onFile` of
  `src/cluster.test.ts` makes two runners on one file, and each runs `createTables` in `sharding`. Under bun:sqlite,
  the second runner's `BEGIN IMMEDIATE` blocks the event loop for the busy timeout while the first runner holds the
  write lock. The spike of decision 0216 ran the first run in another process. The second reading of the premise
  review noticed it on 2026-11-12.
  - A test of `src/cluster.test.ts` that launches two runners at once on a file with no tables, and times the second,
    would decide it.
- **A `PgClient` given `transformQueryNames`.** The function would change the name `effecttea_migrations` in the
  statements of `Migrator` that are not `withoutTransform`, and in `tablesMade`. It would not change the name in the
  `to_regclass` of `firstSchema`, so the check of decision 0263 would look for a name other than the one made. The
  second reading of the premise review noticed it on 2026-11-12.
  - Whether a launch refuses a client given `transformQueryNames`, or a test of `src/storage.test.ts` on PGlite with
    such a client, would decide it.
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
  only its time ([decision 0142](decisions/archive/0142-a-consumer-waits-for-a-row-of-its-topic.md)). Bug 37 of the
  [roadmap](roadmap.md), a step interrupted between its commit and `tell`, is verified false by a reading:
  - On one process, a step and its `tell` run in a fiber of the deployment's scope: the loop's, or the fiber that
    `detached` forks for a creation or an activation. Nothing interrupts that fiber but the closing of that scope.
  - The scope of a deployment closes when the runtime stops, or when a deploy fails. A failed deploy gives no
    handle, so no reading of it waits. At a stop, `closing` is completed before `running` closes, since the scope
    runs its finalizers in the reverse order of their adding, and every reading ends at `closing` with no page.
  - On Cluster a door's step tells nobody itself. It offers the loop's `Settle` by `afterCommit`, whose callbacks run
    uninterruptibly after the `COMMIT`, as the JSDoc of `SqlClient` says at the version pinned. An activation on
    Cluster is uninterruptible.

  The reading found bug 92, a crash between a door's commit and the loop's `Settle` that told no reading, which
  [decision 0275](decisions/0275-on-cluster-a-doors-commit-tells-the-readings-itself.md) fixes: the commit's callback
  tells the readings. Two cases are left:
  - A `COMMIT` whose outcome is unknown loses its callbacks, as the JSDoc of `afterCommit` says. An entity that crashes
    then before any `settle` leaves the row, which may be committed, with no reading of this runner told. No test
    reaches an unknown outcome yet.
  - On Cluster another runner's commit is learned from `PRAGMA data_version`
    ([decision 0163](decisions/archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md)),
    which reads nothing on PostgreSQL and may fail to be read, which is bug 39, not checked.

  They would be decided by:
  - a test of a `COMMIT` whose outcome is unknown, as a connection lost during the `COMMIT`, followed by a crash;
  - whether `wait: true` keeps a bound of its own, as the timed wait of 0142 did.
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
- **The room a full volume needs freed.** On a disk that is really full the operator stops the callers, then frees
  room for the prune and for the steps the runtime takes of its own
  ([decision 0278](decisions/0278-on-a-full-volume-the-callers-stop-before-room-is-freed.md)). The spike freed 1 MB once for about 1200 rows and thirty timers due.
  How the room grows with the rows a prune deletes and with the work stored is not seen. It would be decided by:
  - a run of `spikes/full-volume.test.ts` on the CI's volume that frees less room under more rows and more work
    due, to try the bound of the WAL's size plus one batch.
  - a prune that halves its batch on a full volume, tried there, which may need no room freed once a checkpoint has
    run.

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

- **The reader of Cluster's version sleeps on a time no launch checks.** Every time the runtime sleeps on is read
  from the options the launch checks ([decision 0208](decisions/0208-a-launch-checks-every-option.md)), and no wait
  spins on a value the launch refuses at 0
  ([decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)). The reader of Cluster's
  version, in `started` of `src/runtime.ts`, sleeps `${millis} millis`, where `millis` is
  `entityReplyPollInterval` of Cluster's configuration, read in `src/cluster.ts`, which no check reads. Under
  `Duration.infinity` the text is `Infinity millis`, which Effect does not read, as decision 0208 saw, so the reader
  dies at its first sleep and no reading is woken by another runner's commit. Under 0 the reader spins while a reading
  waits, as Cluster's own poll of replies may. The second reading of the premise review found it by a reading on
  2026-11-12.
  - A test of `src/cluster.test.ts` whose `start` is given `entityReplyPollInterval: Duration.infinity`, with a reader
    of `consume` under `wait: true` that a commit of the other runner should wake, would decide the first case.

- **What a timer's `Fire` that a planned stop lets through costs.** A timer armed as the drain begins fires in the
  drain, which is bug 101. Its step may start an at-most-once operation, which delivers `unknown` once the drain's
  `millis` run out, where without the race the timer would fire in the next process and the operation would run
  whole. That cost is reasoned, and was not run. The second reading of the premise review noticed it on 2026-11-12.
  - A test of the form of bug 101's timer, with a program whose `Rang` brings `b` and a drain whose `millis` the clock
    passes, would show it.

- **A planned stop that waits for a deploy's activation to commit.**
  [Decision 0261](decisions/0261-the-drain-reaches-a-deployment-still-activating.md) says that a drain that looks
  while a deploy loads an entity closes the scope before the entity's activation commits, so that the drain needs no
  count of the activations. The planned stop calls `drained` of `src/runtime.ts` with `detached` true, which waits
  while `p.detachments` is above 0, and an activation of a deploy is counted there, since `loads` of
  `src/runtime/loop.ts` runs the load in `detached`
  ([decision 0079](decisions/archive/0079-what-a-caller-sets-going-is-finished-without-it.md)). So the drain waits for
  the activation to commit and its at-most-once operations to start. What is stored stays right. The second reading
  of the premise review found it by a reading on 2026-11-12.
  - A test of a planned stop that begins while a deploy loads an entity, reading whether the activation commits
    before the scope closes, would show which holds, and the note or the code would follow it.

- **A fiber of `forkHeld` interrupted before its first step.**
  [Decision 0271](decisions/0271-every-fork-of-the-runtime-says-it-is-interruptible.md) rests on the bookkeeping of
  `forkHeld` of `src/runtime/loop.ts` being in an `ensuring`, which runs on interruption. By
  [decision 0110](decisions/archive/0110-detached-work-is-counted-until-it-ends-however-it-ends.md), an `ensuring`
  runs only once its effect has started. So a fiber that its scope interrupts before its first step leaves its entry
  in `operations` or `timers`, and tells no end. Every other interruption of such a fiber goes through `stop` or
  `drop`, which take the entry out first, and nothing reads the entries once the scope has closed, so no rule is
  broken today. The second reading of the premise review found it by a reading on 2026-11-12.
  - An explored test that closes a deployment's scope between a fork of `forkHeld` and the fiber's first step, then
    reads `operations`, would decide it.

- **On Cluster, a door reached by an empty id.** [Decision 0179](decisions/0179-an-id-is-not-empty.md) rests on every
  id entering by a handle, `Entities` or a world. On Cluster a door is reached by Cluster's address of the entity, which
  a client of Cluster built apart from the library could give as `''`. It was not read in the code of the door. The
  second reading of the premise review noticed it on 2026-11-12.
  - A reading of the doors of `src/runtime/doors.ts`, or a test of `src/cluster.test.ts` that sends to a door under
    the address `''`, would decide it.

- **One set of the waker for two warnings.** The set `refused` of `waking`, at `src/runtime/waker.ts:26`, keeps the
  ids whose refused time is logged once
  ([decision 0259](decisions/0259-a-reading-of-the-waker-that-fails-is-read-again-after-the-retry.md)).
  [Decision 0273](decisions/0273-the-partition-of-an-entity-is-the-librarys-own-hash.md) logs a misplaced entity once
  by the same set, at lines 71 and 91. So on Cluster an entity first refused for its time, then read under a partition
  that is not its shard, is never logged as misplaced, and the other order hides the refusal of its time. Both cases
  are rows written by hand. The second reading of the premise review noticed it on 2026-11-12.
  - A test of `src/cluster.test.ts` that writes a time no integer is for an entity, moves the entity's partition by
    `storedUnder`, and expects both lines, would decide it.

- **A stored `due` before the time the entity's work holds.** The reading of the entities due, at
  `src/storage/entities.ts:628`, compares `due` in SQL and decodes the id alone, so a time of `1000.5` at or before
  now is not refused, though decision 0062 says the reading goes through `Rows.due`. The entity is activated, and the
  activation reads its timer from the key's `work`, not from `due`. Where `work` holds a later time, the timer does not
  fire, and the entity is activated again after each passivation until that time, with nothing logged. The same holds
  of any `due` written by hand before the time in `work`, an integer included. So the case is a row written by hand
  that no note decides. The second reading of the premise review noticed it on 2026-11-12.
  - A test of `src/runtime/waker.test.ts` that writes such a `due` and counts the activations over a few passivations
    would decide it.

- **On Cluster, an entity crashed by a shard lost, crashed again by its own loop.** An entity is not loaded while the
  stop of its former run is running, and a crash runs only on an entity loaded, so the map `stopping` holds one stop of
  an entity at most ([decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md)). The
  sentence is not a premise of the note. `losing` of `src/runtime/doors.ts` crashes an entity only where it is still
  the one loaded, and the catch of `loop` in `src/runtime/loop.ts` crashes its entity with no such check
  ([decision 0042](decisions/archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). A step of the loop whose
  `BEGIN`, `forgetPending` or `COMMIT` fails after `losing` crashed the entity crashes it again. The second stop
  replaces the first's latch in `stopping` and ends at once, so `losing` may let the shard go while the first stop's
  finalizer still runs, and another runner starts the operation beside it, as bugs 31 and 65 did. The second reading of
  the premise review found it by a reading on 2026-11-12, and wrote no test.
  - A test of `src/cluster.test.ts`, on `onFile` with two runners, from `a shard that moves while an operation of the
    first runner still stops starts it on the second only after`, with a probe that holds the loop's step at
    `Applied` until the first stop began and then dies, would decide it. `start` gives no probe that can wait yet.
  - A guard in the catch of `loop` that crashes only the entity still loaded, as `losing` does, or a `crash` that keeps
    the latch of a stop already registered, would fix it.

- **A caller's span left linked after its `Receive` is skipped.** `ask` of `src/runtime/callers.ts` records a
  caller's `Receive` with its caller, then reads the span and sets the link
  ([decision 0282](decisions/0282-a-callers-message-offered-before-its-answer-is-answered-by-it.md)). A step that replies to the key
  between the two deletes no link, since none is set yet. The `Receive` is then skipped, so nothing deletes the link,
  and a later request of the same key, past its `keep`, would be linked to the old span until the entity unloads. It
  costs tracing, and changes nothing applied. The second reading of the premise review noticed it on 2026-11-12.
  - An explored test that replies to a key while a second caller of the key is between its offer and its link, then
    reads `loaded.links`, would decide it. Setting the link before the record would avoid it.

- **A second crash on one process after a probe that dies at `Unloaded`.** `unload` leaves, stops the timers and tells
  the probe under the entity's lock, and a probe that dies there is a crash
  ([decision 0073](decisions/archive/0073-what-the-runtime-did-is-told-to-a-probe.md)). The loop's catch then crashes an entity that
  has left. A reading of the lock's order finds no harm, but rests on the order `Semaphore` gives its takers, which was
  not checked. Only the tests' probe dies there. The second reading of the premise review noticed it on 2026-11-12.
  - A test whose probe dies at `Unloaded` while a caller waits for the entity would decide it.

- **The waker's marks against a stop that ends during a reading.** A stop that ends while the waker reads its marks
  leaves a poke, and the round reads the entity again before it rests, by `src/runtime/waker.ts`. A reading found no
  round that rests with a mark due, and no explored test runs the case under `SCHEDULES=all`. The second reading of the
  premise review noticed it on 2026-11-12.
  - An explored test that ends a stop between the waker's reading of its marks and its rest would decide it.

- **A `Settle` offered to an entity that has left lowers its count of events below 0.** `src/runtime/doors.ts` offers a
  `Settle` to the queue of an entity that has left by `Queue.offerUnsafe`, not by `offer`, so `pending` is not
  raised, and the loop lowers it once it takes the `Settle`. An event is counted from its offer to its step
  ([decision 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md)). The old run is read by no look of `settled`
  or of the drain, so nothing hangs. The second reading of the premise review found it by a reading on 2026-11-12.
  - A rule that every event is offered through `offer`, or a test that reads `pending` of a run that has left, would
    decide it.

- **A door's step that finds its entity unsettled, since decision 0274.** The comment of `src/runtime/doors.ts` and
  [decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md) say that the step crashes the
  entity and loads it again in the same step. Since decision 0274, the load reads `stopped`, and the crash has just put
  the entity in `stopping`. So the step loads it again only where the stop ended first, and otherwise dies with
  `Stopping`, for Cluster to deliver again. The second reading of the premise review found it by a reading on
  2026-11-12.
  - A test of a door's step on an unsettled entity with an operation that stops slowly would show which holds, and the
    comment or the note would follow it.

- **A passivation due before a timer, under a `passivate` of a millisecond.** A timer due sleeps 0 milliseconds and a
  passivation 1. A host that runs both as timers of a millisecond fires them in the order they were armed, and the
  timer is armed first. Were it not, the entity would be unloaded with its time stored and woken again, which costs an
  activation and loses nothing ([decision 0078](decisions/archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)).
  The second reading of the premise review noticed it on 2026-11-12.
  - A spike of Bun's timers of one millisecond armed in order would decide it.

- **A `check` that runs while a launch renames, on one process.** A launch of the new version renames the old name's
  rows in one transaction, and a file of SQLite refuses no reader
  ([decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md)). `check`
  reads the entities by pages, with no transaction across them, so a page read after the rename's commit finds no
  entity under the old name. Only the counts of `check` would be wrong, as bug 29 of [`docs/bugs.md`](bugs.md) says
  of Cluster. The second reading of the premise review noticed it on 2026-11-12, and did not run it.
  - A test that holds a rename at its commit while `check` reads its pages, and compares the counts, would decide it.

- **The consumers of a deploy that fails after it declares them.** A deploy that fails after `declare`, in
  `deploy` of `src/runtime.ts`, leaves its consumers stored, and the undo of
  [decision 0051](decisions/archive/0051-a-deploy-that-fails-leaves-nothing-running.md) does not take them out. A
  consumer of a failed deploy then holds its topic's rows from the prune. The next deploy that does not declare it
  warns of it, as [decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md) says, so an operator
  is told. The second reading of the premise review noticed it on 2026-11-12, and did not run it.
  - A test of a deploy that dies after `declare`, then reads `effecttea_consumers` and the prune of the topic, would
    decide whether the undo should take its consumers out.

- **The indexes of the read model after a rename.** A rename leaves the SQL indexes that `indexed` of
  `src/storage/projections.ts` made under the old name, and every deploy of the new name makes its own. Each step then
  writes both, and an index a deploy drops is left the same way. It costs writes and room, and changes no answer. The
  second reading of the premise review noticed it on 2026-11-12, and did not run it.
  - A test that renames a program with an indexed projection, then lists the indexes of `effecttea_projections`,
    would decide it.

- **A retry that waits in the runtime past its reply's `keep`.** Bug 94 of [`docs/bugs.md`](bugs.md) applies a
  message twice on one process under a `keep` of 0: a retry sent before the answer reads the reply at its own step,
  past the reply's time. The same race may hold under a `keep` above 0, where a retry's `Receive` waits behind a
  slow step or a long mailbox past the first reply's time. The second reading of the premise review found it by a
  reading, on 2026-11-12, and wrote no test.
  - A test that holds the first step at its commit, by the points of the crash table, moves `TestClock` past the
    `keep`, and counts `applied`, would decide it.
  - The fix of bug 94, [decision 0282](decisions/0282-a-callers-message-offered-before-its-answer-is-answered-by-it.md),
    holds a retry sent before the answer, under any `keep`, and leaves out a retry sent after the answer and
    stepped past its `keep`, which is what this question is left with.

- **A retry in flight when an operator resumes the entity.** A suspended entity's head message is handled by the step
  of the resume. A caller answered `Suspended` that sends again at that moment reads the reply after that step, and
  under a short `keep` may find none and have the message applied again, as bug 94 does. The second reading of the
  premise review found it by a reading, on 2026-11-12, and wrote no test.
  - A test that resumes an entity whose head message has a `keep` of 0, while its caller sends again, and counts
    `applied`, would decide it.

- **On Cluster, a duplicate of a request on the runner that holds its shard, under a `keep` of 0.** The test of
  [decision 0248](decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md) runs the second client
  on another runner. A second client on the runner that holds the shard is expected to join the first request, as
  `saveRequest` of Cluster does, so that the message is applied once. The second reading of the premise review
  noticed it on 2026-11-12, and did not run it.
  - The test of decision 0248, with both clients on the runner that holds the shard and a `keep` of 0, would decide
    it.

- **A boundary's clock against the runtime's, for a reply's `keep`.** A caller's reply is kept for the window its
  boundary gives, counted on the runtime's clock alone
  ([decision 0125](decisions/archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)). A boundary
  counts its protocol's retries on its own clock, so a skew between the two clocks shortens or lengthens the window
  by that skew. A window shortened past a retry applies its message twice. Decision 0125 leaves the skew out, and the
  inventory of 2026-11-11 of [`reviews.md`](decisions/reviews.md) found it in no open question.
  - A rule of the guide that a boundary adds the skew it allows to its `keep` would decide it.
  - So would a measure of the skew between the hosts of a boundary and of a runner that the library supports.

- **Two loaders of one entity on a pool of PostgreSQL.** On Cluster on SQLite, a runner's client runs one transaction
  at a time, and every loader of an entity takes its lock inside a transaction, so two machines are never built for
  one entity ([decision 0172](decisions/archive/0172-on-cluster-the-two-interleavings-of-decision-0104-are-read-again.md)).
  With a pool of PostgreSQL, two loaders could wait for one lock at once. Decision 0172 leaves the case out, since
  the runtime runs on Cluster only on SQLite
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), and the
  inventory of 2026-11-11 found it in no open question.
  - The step The runtime on Cluster across machines, on PostgreSQL, of the [roadmap](roadmap.md), decides it.
  - A test of two loaders of one entity on the CI's PostgreSQL, held at their statements, would check it.

- **A runtime under a clock moved by less than a millisecond.** The runtime reads its time from `DateTime.now`, and
  the live clock gives `Date.now()`, which is whole. `TestClock.adjust` adds `Duration.toMillis` of its duration
  unrounded, and the JSDoc of `Clock` promises no integer. So a runtime under a `TestClock` moved by
  `Duration.micros(1500n)` may hand the machine a time between two milliseconds, and a program that arms a timer
  from it would be a defect, as bug 93 was in a rehearsal
  ([decision 0281](decisions/0281-a-rehearsals-time-is-a-whole-millisecond.md)). It was found by the Fable 5.2
  agent's opinion on bug 93, by a reading, and was not run.
  - A test of the runtime under `TestClock.adjust(Duration.micros(1500n))` that arms a timer from the time of a
    message would decide it.
  - A guard would floor the time where the runtime reads it, or refuse a clock that is not whole.

- **A message and a sender given to `update` as sent, or decoded from their JSON.** On one process `send` of
  `src/runtime/callers.ts` gives the machine a caller's message and sender as the caller sent them. On Cluster the
  door decodes both from the JSON the client sent, and a message reloaded after a crash is decoded from its row. So
  `update` may be given `-0` on one process and `0` on Cluster or after a crash, for the same message
  ([decision 0210](decisions/0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md)). A schema whose
  decoding is not the inverse of its encoding gives two values that differ more. It was found while bug 38 was read,
  by a reading of `send` and of `delivered` in `src/storage/entities.ts`, and no test reaches it yet
  ([decision 0276](decisions/0276-a-projections-allows-is-given-the-projection-as-a-caller-reads-it.md)). It would be decided by:
  - a test that sends a message holding `-0` on one process and on Cluster, and compares what `update` is given;
  - whether the runtime gives `update` on one process the message decoded from what it stores, at the cost of a
    decoding for each message.
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
  [Decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md) keeps two runs of one incarnation apart on one runner and across an orderly move of a
  shard, so the second bullet is left to a runner that lost its lease.
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
  the [roadmap](roadmap.md), each with a test of `src/postgres.test.ts` that no run has reached. Bug 25 is fixed by
  [decision 0284](decisions/0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md), whose rule is that a statement that writes or deletes a row on a condition
  reads the condition from a row it has locked. The other bugs are later cases of that rule, each with a note of its
  own. What is left would be decided by:
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
- **What a launch that dies for a rename has stored.** A launch creates the tables and stores the partitions of
  the log before it moves its renames, and the three are not one transaction
  ([decision 0264](decisions/0264-a-launch-that-dies-gives-back-what-it-held.md)). So a first launch on a new
  database that dies for a rename leaves the tables and the number of partitions stored. A launch again with another
  number of partitions is then refused. It would be decided by:
  - whether a launcher expects the first launch refused to leave the database as it was, or the partitions stored;
  - a test of a first launch that dies for a rename, followed by a launch with another number of partitions.
- **A launch interrupted on Cluster after it forked the reader of the version.** A launch that is interrupted closes
  its own scope, which stops the reader it forked
  ([decision 0264](decisions/0264-a-launch-that-dies-gives-back-what-it-held.md)). That rests on the JSDoc of
  `Effect.onExit`, and no test interrupts a launch on Cluster at that point. It would be decided by:
  - a test under the scheduler of `src/testing.ts` that interrupts a launch on Cluster after the fork, and checks
    that no fiber reads the version afterwards.
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
- **A droppable operation dropped before a crash, still stopping beside the next run.** A step that drops a
  droppable operation forks its interruption and waits for none of its finalizers
  ([decision 0128](decisions/archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md)). The stop of a later
  crash interrupts only the operations the entity still holds, so
  [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md) leaves the
  dropped one out: its finalizer may run while the entity runs again, and on Cluster while the runner that gains the
  shard runs it. A droppable operation acts on nothing and sends nothing, so nothing the library keeps is touched, and
  its late completion is offered under an incarnation no step draws again. A runner declared droppable that acts in
  its finalizer would act beside the next run, as it already acts beside the next step without a crash. It would be
  decided by:
  - whether a runner may be declared droppable and act in its finalizer, which no type and no check refuses;
  - whether the stop of a crash, `losing` and an unload wait for the finalizers of the operations dropped before, at
    the cost of a wait decision 0128 refused.
- **An entity a stop that never ends keeps from loading.** Since
  [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md), an entity is not loaded on a process while the stop of its former run is running.
  An operation that holds a region uninterruptible for ever keeps its entity from loading there for ever, keeps
  `settled` from returning, and on Cluster keeps its shard from moving, since Cluster waits for the finalizer of the
  shard's singleton. The runtime logs it once, and only a restart of the process ends the fiber. It would be decided
  by:
  - whether an operator needs a reading of the entities whose stop is running, beside `suspended`;
  - whether a process should end itself past a bound, which stops every entity it holds for one operation.
- **A stop that ends between the waker's refusal and its catch.** Since
  [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md), the
  waker reads an activation refused for a stop from the defect's class, and not from `stopping`. A stop that ended
  after the refusal and before the catch would otherwise read as a failure, and hide the entity until `retry`, with
  `settled` free to return. No seed of 2,000 of `settled never returns between a crash and the activation its due timer
  brings`, in `src/runtime/loop.test.ts`, reaches a stop that ends there: the mutation that reads `stopping` passes
  every one. It would be decided by:
  - an explored test whose activation by the waker meets a crash a caller makes after the waker's reading, with a stop
    that ends within a few steps;
  - a deviation under `bound` 1 that holds the waker between the refusal and the catch.
- **An operation's send to an entity whose stop runs.** Since
  [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md), an entity
  whose stop runs is refused with the defect `Stopping`. An operation of another entity that sends to it reads that
  defect as a crash of the receiver, in `unlessCrashed` of `src/runtime/callers.ts`, and sends again after `retry`
  ([decision 0046](decisions/archive/0046-a-receiver-that-crashes-is-sent-again.md)). The premise review of area 13
  read it so, and no test runs it. It would be decided by:
  - a test of `src/runtime.test.ts` that crashes a receiver with its operation's finalizer held, while an operation of
    another entity sends to it, and that sees the message applied once the finalizer ends.
- **A `Reused` reset by two clients on Cluster.** A caller's client resets a `Reused` that Cluster saved, and sends
  the request once more ([decision 0269](decisions/0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md)).
  Two clients of one request id and one other message may meet as bug 91 of [`docs/bugs.md`](bugs.md) says, where
  one client's reset drops the keep of the answer the other's send kept. The premise review of area 13 noticed it
  and did not check it. It would be decided by:
  - a test of `src/cluster.test.ts` with two clients of one request id, each sending a message other than the first
    request's, that reads Cluster's rows once both are answered.
- **An act on the outside world beside the next holder's run.** On Cluster, a runner that lost its lease without
  giving the shard up may still run an operation that calls a service, while the next holder runs the entity. The
  library cannot refuse such an act, and an at-most-once operation's `unknown` may be delivered beside it. Fencing the
  library's own writes and sends, as bug 57 of the [roadmap](roadmap.md) says, does not reach it. It would be decided
  by:
  - whether an operation is given an epoch of its run, which a service downstream may use to refuse the older run, as
    it may use the idempotency key;
  - whether `docs/design.md` says, of the delivery of an at-most-once operation, that its `unknown` may be delivered
    while a runner that lost its lease still acts.
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
  ([decision 0056](decisions/archive/0056-nothing-waits-for-an-operation-under-the-permit.md)), which is bug 65,
  fixed by [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md), whose run of a crashed entity sends nothing, on one runner and across an orderly move of a shard.
  Bug 57 is left to a receiver that refuses the request, and there the receiver still applies the request twice. They are of the [roadmap](roadmap.md). It would be
  decided by:
  - whether a receiver refuses a request whose asker's work no longer holds, by the asker's key row it already reads;
  - a helper of `src/cluster.test.ts` that keeps a runner's operation running after another runner took its shard,
    which exists for a shard moved in order, by a finalizer the test holds, and not for a runner frozen past its lease;
  - for bug 90, reasoned, whether a door loads an entity of a shard whose singleton has not started, since no
    finalizer then crashes it, and its operations run beside the next holder's.
- **A wait whose operation, run again, sends elsewhere.** A step that answers an operation `Suspended` stores its
  wait, and `suspended` lists it while the run that sent holds
  ([decision 0265](decisions/0265-the-operations-that-wait-for-a-resumption-are-stored-by-the-step-that-answers.md)).
  An operation run again after a crash keeps its incarnation, and may send to another entity than the first time,
  since what it sends is its own effect's. Its wait stays listed under the first receiver until that receiver's
  suspension ends, and on Cluster that resumption tells its entity `Resumed`, which wakes nothing. No test reaches
  the case yet. It would be decided by:
  - a test of the runtime whose operation sends to one entity, crashes, and sends to another once run again;
  - whether an operator is misled by such a wait, or reads it as the history of the run;
  - whether a run's wait could be dropped by the run's next send, at the cost of a write per send.
- **The partitions after a release of Effect whose hash of Cluster differs.** The storage's partition of an entity
  is the library's own formula, and Cluster's shard is Cluster's
  ([decision 0273](decisions/0273-the-partition-of-an-entity-is-the-librarys-own-hash.md)). A release of Effect whose
  hash differs makes every deploy on Cluster die, and the move of Effect waits for a note that decides a migration.
  No such release exists, so the migration is not designed. It would be decided by:
  - a release of Effect whose hash of an entity's id differs from the one of 4.1.3;
  - whether a migration rewrites each entity's partition, and what it does to the order of the log within a
    partition and to the cursors of its consumers;
  - whether a runner of the release before and one of the release after may serve shards at once during it.
- **An entity reached by a message under a partition not its shard.** The round of a shard and the waker log an
  entity stored under a partition that is not its shard on Cluster
  ([decision 0273](decisions/0273-the-partition-of-an-entity-is-the-librarys-own-hash.md)). A door loads an entity by
  its id, and reads no partition, so an entity that only messages reach is never logged. Its steps run, and its
  publications go to the stored partition, which no consumer misses. Its timers and its operations after a crash
  wait for the runner that holds both shards. No test reaches it yet. It would be decided by:
  - whether the loading of an entity reads its partition, at the cost of a column in the reading of every load;
  - a test whose entity, stored under another partition, holds a timer and is reached by a message first.
- **The name of a long index after a release whose `Hash.string` differs.** On PostgreSQL a name of an index longer
  than 63 bytes ends with `Hash.string` of the whole name
  ([decision 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). A release whose
  `Hash.string` differs would name the same index otherwise. It is a lead read in `src/storage/projections.ts`, and
  no test reaches it yet. It would be decided by:
  - what a migration of an index does when the index it drops or keeps has a name of another hash;
  - whether the name takes the library's own hash of decision 0273, as the partition does.
- **A drain on Cluster with a deploy under way.** On Cluster, the singleton of a shard activates the entities of the
  shard before the deployment registers. The drain reaches them through the deployments it holds from the claim of
  the name, as on one process ([decision 0261](decisions/0261-the-drain-reaches-a-deployment-still-activating.md)),
  but no test runs a drain on Cluster with a deploy under way. The round of a shard's activation goes on in the
  drain, and may start an at-most-once operation there, which the drain then waits for. It would be decided by:
  - a test of `src/cluster.test.ts` that stops a runner while a shard's round activates its entities;
  - whether the round stops at the next entity once the drain began, as the activations of one process do;
  - a test that fails a deploy between its singletons and its registration while a round activates an entity, which
    checks that the round starts no activation once the undo began
    ([decision 0280](decisions/0280-the-undo-of-a-deploy-drains-its-deployment.md));
  - a test that fails a deploy after its door is registered, and sends a caller's message through the door in the
    undo's wait, which checks whether a door's step there starts an at-most-once operation, as bug 21 of
    [`docs/bugs.md`](bugs.md) says of a drain. The premise review of area 13 noticed it and did not check it.
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
- **A check beside the old version on PostgreSQL under a role of rows alone.** `check` reads a database the old
  version holds, on SQLite through the hold file
  ([decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md)) and on
  PostgreSQL beside the advisory lock. Under a role that may only read and write rows, the check reads
  `effecttea_migrations` by name, which no test has run against such a role. It would be decided by:
  - a run on a server of PostgreSQL under a role of rows alone.
- **A second name of a file of SQLite.** A file of SQLite is held by a hold file named by the database's path
  ([decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md)). Two
  runtimes that open one file by two names, through a symbolic or a hard link, name two hold files, and both launch.
  The decision leaves the case out. It would be decided by:
  - a test of two runtimes on one file by two names, and whether SQLite's own path of the file resolves a symbolic
    link on each system.

## Programs

- **A rehearsal that reads back a reason, and a projection after a deploy.** `docs/design.md`, under Rehearsing,
  says that `rehearse` reads back only the projection, and that a rehearsed deploy exercises no migration of the state
  and of the projection. The machine reads back a rejection's reason too, in `replied` of `src/machine.ts`
  ([decision 0214](decisions/0214-a-rejections-reason-is-given-as-a-caller-reads-it.md)). After a deploy, a
  rehearsal's `projection` is the new version's `project(state)`, where the runtime gives the row the version before
  wrote, read through the migrations of `projection`, until a step or `reindex` writes it again. The difference is
  documented, and no test runs it. Bugs 107 and 108 are a rehearsal that keeps a request's text and reason across a
  deploy. The second reading of the premise review noticed it on 2026-11-12.
  - Whether the fixes of bugs 107 and 108 read the projection through its migrations too, or the guide says which
    readings a rehearsed deploy skips, would decide it.
- **A deploy that changes a child's wrapper or the name of a key.** Bug 96 of [`docs/bugs.md`](bugs.md) suspends an
  entity whose key's parameter a deploy encodes otherwise. A deploy that changes the form of a child's wrapper, or the
  name of a key with work under way, may fail the same way. The second reading of the premise review noticed both on
  2026-11-12, and ran neither.
  - The step What a deploy may change of a program, against what is stored, of the [roadmap](roadmap.md), decides
    both, since its list of pieces names the children and the keys.

- **A rehearsal in a browser.** The machine computes the digest of an idempotency key with `node:crypto`, so the
  machine runs only where that module is
  ([decision 0192](decisions/0192-the-digest-of-a-key-is-computed-by-the-machine.md)). `rehearse` and the runtime
  both run on Bun, which implements it, and no rehearsal in a browser is planned. Decision 0192 leaves the browser
  out, and the inventory of 2026-11-11 of [`reviews.md`](decisions/reviews.md) found it in no open question.
  - A requirement to rehearse a program in a browser would decide it, with a digest that the Web Crypto API
    computes, which is asynchronous.

- **A service that caps an idempotency key below 43 characters.** An idempotent runner may be given the digest of its
  key, 43 characters of unpadded base64url
  ([decision 0123](decisions/archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md)). Stripe caps
  a key at 255, and a service a program calls may cap it lower. Decision 0123 leaves such a service out, and the
  inventory of 2026-11-11 found it in no open question.
  - A service a user's program calls whose cap is lower than 43 would decide it, with a digest of fewer bits.

- **Two idempotency keys with one digest.** The digest of a key is its SHA-256, so two keys that share a digest would
  reach a service as one request ([decision 0123](decisions/archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md)).
  Decision 0123 leaves the collision out, from the 256 bits of SHA-256, and the inventory of 2026-11-11 found it in
  no open question.
  - A collision of SHA-256 found in public would decide it, with a move to another function.

- **An `Entities` a runner keeps from another run.** A droppable runner whose services hold `Entities` does not
  compile, and the runtime gives `Entities` only to a run of an operation
  ([decision 0129](decisions/archive/0129-a-droppable-runner-that-sends-does-not-compile.md)). A runner can still
  keep an `Entities` of another run in a variable, which no type sees, and a droppable runner could then send.
  Decision 0129 leaves that runner out, and the inventory of 2026-11-11 found it in no open question.
  - A test of a droppable runner that sends through an `Entities` kept in a variable would show what the runtime
    does: whether the send dies as a droppable operation that sends does.

- **A deploy that adds a child named like an own tag still stored.** A child's name is never a parent's own tag
  ([decision 0270](decisions/0270-a-childs-name-is-never-an-own-tag.md)), but the compiler sees one version alone. A
  version that adds a child named like an own message, reason or operation of the version before reads the rows that
  version stored. Its composed schema then takes a stored own value as the child's wrapper, or refuses it, and the
  entity fails to load. No test runs it. It would be decided by:
  - a test that stores an own message under one version and reads it under a version with a child of its tag;
  - the step What a deploy may change of a program, against what is stored, of the [roadmap](roadmap.md), whose
    check of a deploy would refuse the new version.

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

- **A rehearsal's crash and an operation that sends another message after it.** A run of an operation after a crash
  that sends another message under a name it used is given the first message's reply, and the receiver holds the
  first message alone ([decision 0269](decisions/0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md)).
  An operation that reports what it sent in its completion then says what the receiver does not hold, with nothing
  reported. A rehearsal runs the operation again at a crash, so a test is where this is found at the least cost. A
  rehearsal that failed the test would refuse what the runtime allows. It would be decided by:
  - whether the maintainer wants a rehearsal to be stricter than the runtime on what it can see;
  - whether a program has a use for a message rebuilt otherwise after a crash, as one built from the clock.

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
- **A chain of keys that loops in a rehearsal.** A timer under a key with a parameter that arms the next parameter
  at the time reached never fires one key twice, so a rehearsal's `advance` never ends
  ([decisions 0187](decisions/0187-a-rehearsal-moves-time-by-a-duration.md),
  [0266](decisions/0266-a-timer-that-catches-up-fires-with-a-due-time-that-grows.md)). A rule on the key's name alone
  would refuse three reminders of three parameters due at one time, and a catch-up that moves to the next parameter.
  It would be decided by:
  - a rule that fails a key's name only when a firing at the time reached armed it, which needs the rehearsal to
    keep what each firing armed;
  - whether a program needs a chain of parameters at one time at all.
- **A source that gives each item once.** A boundary acknowledges an item once its answer is stored, and the source
  gives the item again until then
  ([decision 0272](decisions/0272-a-boundary-acknowledges-an-item-once-its-answer-is-stored.md)). A source that keeps
  nothing, as a socket, gives no item again, so an item in flight at a crash of the boundary is lost whatever the
  boundary does. The decision leaves this source out. It would be decided by:
  - a program fed by such a source, and what its domain loses with an item;
  - whether the boundary writes each item to a table of its own before it sends it, and reads that table as the
    source, at the cost of a write for each item.

## The surface

- **The checks of the guide's code and of the quick start read only the blocks fenced `ts`.**
  [Decision 0203](decisions/0203-the-guides-code-is-found-in-the-examples.md) compares each block of TypeScript of the
  guide with the examples, and [decision 0196](decisions/0196-the-quick-start-is-an-example-the-readme-shows-whole.md)
  the quick start. The tests at `src/form.test.ts:413` and `:424` take the blocks fenced exactly `ts`, so a block
  fenced `typescript` or `tsx`, or `ts` with an info string, is compared with no example and passes. Decision 0254
  asks that a check be a function of what it reads, given a sample of each case it refuses, and neither test is such
  a function. No page holds such a block today. The second reading of the premise review found it by a reading on
  2026-11-12.
  - A test that makes the check a function, and gives it a block fenced `typescript` that no example holds, would
    decide it.
- **A test of the server of PostgreSQL declared `slow`.** `slow` skips a test under `bun test` and under
  `SCHEDULES=pinned`, and `test:postgres` runs with no `SCHEDULES`. Three tests in the files of `test:postgres` are
  `slow`, and none needs a server today. A test of the server declared `slow` would run on no server, as bug 110 says
  of the samples. The second reading of the premise review noticed it on 2026-11-12.
  - The fix of bug 110, if it runs `test:postgres` under `SCHEDULES=all`, would decide it too.
- **Status lines that miss a later note.** The status line of
  [decision 0212](decisions/0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md) and the
  index name decision 0254 alone, though decision 0250 changed its count of 30 to 8, at
  `src/fixtures.property.test.ts:135`. The status line of
  [decision 0255](decisions/0255-a-data-directory-of-pglite-is-held-while-its-client-is-open.md) says a file of SQLite
  is refused while another connection has it open, and does not link decision 0267, by which a file refuses another
  runtime alone. The second reading of the premise review found both by a reading on 2026-11-12.
  - A commit that adds the two links, as `AGENTS.md` asks of a note that changes another, would settle it.
- **A reason an operator gives to a discard.** A discard of a message an operation sent stores a rejection with a
  reason of `null` ([decision 0260](decisions/0260-a-discard-of-a-message-an-operation-sent-stores-a-rejection.md)).
  The sender cannot tell it from a bare `reject` of the receiver, though a discard says the receiver had a bug and
  an operator dropped the message. An operator could give the reason, as `discard(id, { reason })`, typed by the
  receiver's schema of rejections, with `null` when none is given. The rule of decision 0260 would not change. It
  would cost an encoding of the reason on the operator's path, and a payload in Cluster's request `Discard`. A
  program whose schema of rejections is `Never` could take no reason. It would be decided by:
  - a program that acts otherwise on a discard than on a rejection, as one that alerts or sends again later;
  - whether a reason the receiver's schema declares for a discard reads as the receiver's own rule.
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
