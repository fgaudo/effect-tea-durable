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
    are gone.
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
  own `send` does. It is only reasoned: no test runs it. It would be decided by:
  - a test in [`src/postgres.test.ts`](../src/postgres.test.ts), on the CI's server, that holds the two steps at
    their statements and finds the row;
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
- **An answer a run after a crash is not given again.** An operation that talks only to entities acts once, since a
  run after a crash is given the stored replies
  ([decision 0060](decisions/archive/0060-send-and-create-take-no-key.md)). A rejection of `init` is not stored
  ([decision 0182](decisions/0182-init-may-reject-the-flags.md)), nor is `NotFound`
  ([decision 0010](decisions/archive/0010-a-rejection-may-carry-a-reason.md)). A run after a crash may be told
  otherwise, and act otherwise, as the test `FAILING: an at-least-once operation run again after a crash acts once,
  though init rejected its creation`, on the branch `claude/premise-review-creation-03f15d`, shows. A run after a
  crash may also be told `Created` where the first was told `Rejected`, when `init` reads the time or a deploy
  changed `init`. Decision 0182 says so of a caller's retry, and not of an operation that acts on the answer. Whether these
  answers are stored, or the promise of `docs/design.md` and of decision 0009 is narrowed, is not decided. It would
  be decided by:
  - whether storing a rejection of `init` or a `NotFound` while the operation's work holds keeps 0182's reason, that
    a rejected creation leaves nothing;
  - a test of the `NotFound` half, which no test holds: the test above written again with a `send` to an entity
    created between the two runs;
  - whether a sentence of the design can say which answers a run after a crash is given again, so that a program
    acts only on those.
- **A creation that `init` dies on, on Cluster.** On one process, an operation's creation that `init` dies on
  suspends the sender ([decision 0046](decisions/archive/0046-a-receiver-that-crashes-is-sent-again.md)). On
  Cluster the door dies, and Cluster delivers the creation again without end
  ([decision 0160](decisions/archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)),
  so the operation's `create` waits until a fix is deployed. The sender is not suspended and the receiver does not
  exist, so `suspended` lists nothing, and only Cluster's log of restarts shows it. The sender's entity stays busy,
  and is never unloaded. An operator cannot see what waits. Neither 0160 nor
  [decision 0167](decisions/archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)
  says what holds of 0046's rule on Cluster. The premise review of 2026-11-11 reasoned it. It would be decided by:
  - a test of `src/cluster.test.ts` where an operation creates an entity whose `init` dies, which would hang today;
  - whether an operator is meant to see such a creation, and through which call.
- **The rows of operators' events on Cluster.** An operator resumes and discards through the door's client on
  Cluster ([decision 0166](decisions/archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)).
  The premise review of 2026-11-11 noticed that Cluster's rows of those requests may never be deleted, and did not
  check it. It would be decided by a test that resumes an entity on Cluster and reads Cluster's tables after
  `expire`.
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

## The surface

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
