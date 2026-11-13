# 0283. A test of a contract runs one set of calls on every backend, Cluster's decided answers in one place

**Status:** proposed, 2026-11-12, for the step The tests of a contract on every backend of the
[roadmap](../roadmap.md). It was written on the branch `claude/contract-tests-c7e2a1`, whose job `postgres` of the CI
ran the tests of a server, and merged into `main` on 2026-11-12. It runs on Cluster too the calls of [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) that both dialects answer alike.

## Context

A test of a contract is the fourth kind of test of [`AGENTS.md`](../../AGENTS.md). One set of requests runs alike on
each way the library runs, and each answer must be the same on each. Families C and D of [`docs/bugs.md`](../bugs.md)
are rules of one process that hold otherwise on Cluster, and rules that hold only of one transaction at a time. No
test compared one process and Cluster on the same calls. The test `both dialects answer every call alike` of
`src/dialects.test.ts` ran the calls fast-check generates on SQLite and on PostgreSQL alone.

On Cluster an answer may differ by a decision. The first run of the test on Cluster met one and waited: a creation
whose projection holds U+0000 in an index, which the program dies on. One process gives its creator the defect, and
stores nothing. On Cluster the creation waited until a deploy fixed the program, delivered again without end, and
every later request to the same entity waited behind it
([decision 0160](archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
Since [decision 0291](0291-on-cluster-a-creation-the-program-dies-on-is-answered-died-and-reset.md) Cluster gives the creator the defect too.

## Decision

- **The test of a contract is [`src/contract.test.ts`](../../src/contract.test.ts).** `src/dialects.test.ts` is
  renamed to it, and its property is `every backend answers every call alike`.
- **The backends of the first part are SQLite and PostgreSQL on one process, and Cluster with two runners on one
  SQLite file.** PostgreSQL is PGlite, or the CI's server where `POSTGRES_URL` names one, as every test of a dialect.
  Each call of a caller on Cluster goes through the two runners in turn, so that a call meets entities whose shard
  the other runner holds.
- **The two runners start once for the file, in a hook with a timeout of its own.** A start waits for the shards,
  which takes longer than a run of the property. The runs share the runners, so each run prefixes every id but the
  empty one and every request id with its own name. Every reading names the run by an index `run`, and the readings
  of `suspended` keep the ids of the run. The empty id keeps its own refusal (decision 0179).
- **The answers Cluster gives otherwise by a decision are written once, here.** None is left: a creation the program
  dies on, which decision 0160 made Cluster answer otherwise, is answered alike on every backend since decision 0291.
  A later decision that makes Cluster answer otherwise adds its case here, beside the call it changes.
- **The calls of an operator are among the calls generated.** They are `inspect`, `resume`, `discard` and
  `suspended`, and `expire`, `prune` and `reindex`. A message `Boom`, which the program dies on, is followed by an
  operator's call on its entity in one call of five, so that an operator meets a suspension often. What `inspect`,
  `resume` and `discard` give is compared without `since`, a time of the runtime's clock, and with a cause kept only
  as whether it is the defect of a `Boom`. `expire`, `prune` and `reindex` count over every run that shares a backend,
  so only their success is compared.
- **The program `item` sends to another entity and arms a timer.** A message `Forward` starts an at-least-once
  operation that sends `Add` to another item and keeps the reply's tag in its note. A message `Tick` arms a timer due
  at once, which adds 1 when it fires. The generated calls send both, and a `Forward` to an entity a `Boom` suspends,
  followed by an operator's call on that entity, so that an operation waits for a resumption.
- **The program `item` creates another entity from an operation.** A message `Spawn` starts an at-least-once
  operation that creates another item with the flags the message carries, and keeps the creation's tag in the note.
  The generated calls send it with any flags. One draw of seven of them is a `Spawn` whose label is text no database
  holds, followed by an operator's call on the item that spawns. The program dies on that creation, which is the
  operation's defect, so the item that spawns is suspended on every backend (decision 0291).
- **After each call that writes, the test waits until every entity of the run is quiet**, for five seconds at most.
  A call answers before its entity handles what follows from it: the message a `resume` or a `discard` takes the
  entity past, an operation's completion, a timer's firing. So a call after it would meet the entities where each
  backend has come in its own time. An entity is quiet when it is missing, or suspended, or not suspended with an
  empty mailbox. Each forward of its work must also wait for its receiver, which lists the wait, or have its
  completion queued, or be the operation the entity died in. A timer is quiet only in a suspended entity, whose
  timers are disarmed. The operations of a suspended entity go on, so the test waits for them too.
- **An operator's `resume` or `discard` that races the senders waiting for its entity is not sent**, on any
  backend, and is answered with a mark. Such a call is a `resume` of an entity some operation waits for, or a
  `discard` of one that also holds a second message. The step wakes the senders, and the entity may die again on the
  message it is resumed past or on the next one. A sender's message then lands in the mailbox before the entity
  dies, or is answered `Suspended` after it, and the sender waits again. Both are answers the design allows, and
  the order is the backend's own. The test reads the suspension at a point every backend reached by the wait above,
  so each backend marks the same calls.
- **A call with no answer within 5 s is answered so**, which fails the test rather than holding it.
- **`bun test` runs three runs of the property, and `SCHEDULES=all` runs 300**, so that the test stays within two
  seconds. Six runs took 1.9 to 2.0 s once the operator's calls were among them. Four took 1.6 to 1.9 s once the
  test waited for operations and timers, and three take 1.0 to 1.7 s ([decision 0250](0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md)).
- **On a pool of PostgreSQL, two calls run at once, held at a statement.** It is the second part of the step, for
  family D of [`docs/bugs.md`](../bugs.md). The test `two calls held at a statement on a pool answer as one order of
  them` makes two entities, runs a few messages one at a time, then runs two calls at once. Each call is a message,
  a creation, `expire`, `reindex` or `prune`. A connection of its own holds a lock of one of the library's tables,
  so that each call that reaches a statement of that table waits there. The lock is let go once both calls wait, or
  after a second.
- **The table locked is drawn among the tables both calls of the pair write.** The history runs first on SQLite in
  both orders, and a transformer of the statements, `Statement.CurrentTransformer` of Effect, records which tables
  each call names and writes. fast-check draws the gate among the tables both calls write, else among those both
  name, else among every table of the library. A gate drawn among every table held both calls at once in 6 and in
  13 of a hundred runs. Then each request of the pair is sent again, and every entity is read.
- **A statement that drops rows of the outbox is recorded as writing the publications too**, since the trigger of
  the outbox drops them, and no statement the recording sees names them
  ([decision 0286](0286-the-trigger-of-the-outbox-locks-the-publications-in-order.md)).
- **On the pool, `item` publishes two topics, `label` and `amount`, and is deployed with a consumer of each.** The
  calls of a history are also an ack of a consumer, through the partitions of the run's entities, and a prune. A
  call of the pair may be an ack followed by a prune, so that two prunes at once see the log otherwise by an ack. An
  ack's cursor is the head of each partition, which `ack` caps a cursor at. A cursor read from the rows would read
  the publications, and the ack would wait at a lock of their table before the other prune had dropped its rows.
- **The readings after the pair count the publications of the run's entities**, read from their table. No call reads
  a publication that no row of the outbox names, which bug 80 of [`docs/bugs.md`](../bugs.md) left for ever.
- **The answers on the pool must be those of one of the two orders the calls run in one at a time**, as SQLite runs
  them on a new database. An operator's call is compared by whether it succeeds, since what it counts depends on the
  rows of the other runs. A message of the pair adds to an index, so that a message applied twice shows in the
  readings.
- **The runs on the pool share one database and one runtime**, as the runs on Cluster share their runners, with the
  same prefix of a run.
- **The test of the pool runs a hundred runs, and 500 under `SCHEDULES=all`.** Only `bun run test:postgres`
  reaches it, since `bun test` on one machine has no server. So it holds the budget of the job `postgres`, a minute or
  two, rather than the two seconds of a test of `bun test`.
- **A rule of one process that the design says holds on Cluster too is run on both**, by `everywhere` of
  [`src/runtime.test_backends.ts`](../../src/runtime.test_backends.ts), in the group `a rule of one process that holds
  on Cluster too` of [`src/runtime.test.ts`](../../src/runtime.test.ts). The rule is a group of its name, with a test
  on one process, on each dialect the test ran on, and a test on Cluster with two runners on one SQLite file. A test
  of a rule moves there whole, under its name, so that a note that names it names the group. Its calls go through
  the two runners in turn.
- **Cluster's runners start once for the group, in a hook**, as the runners of the property do, and the rules share
  them. So every id and request id a rule names is prefixed with the rule's own name, by `own`.
- **The clock is real on both backends**, since Cluster's runners poll it. So a rule moves there only where its test
  needs no test clock and no probe of the runtime: a test that holds a step at a point by a probe, or moves the
  clock, holds an interleaving that Cluster does not give. Such a rule stays a test of one process. Where a part of
  it needs neither, that part may run on both as a rule of its own, as the keep of 0 of decision 0282 does.
- **A failure is pinned as examples of the test.** The first run of 200 on the CI's server failed at the 139th, which
  is bug 25 of [`docs/bugs.md`](../bugs.md): a `reindex` beside a message wrote the projection of the state before the
  message over the row its step committed. Its case, as fast-check shrank it, is pinned on the table of projections,
  where it fails at its first run against the code before
  [decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md), which fixes it. A pinned case names its table, since the place of a table among the
  library's may change.

## What it rests on

- That one process and Cluster answer alike every call of the generated runs, the creations the program dies on
  aside: **tested**, by `every backend answers every call alike`, in three runs under `bun test` and in 300 under
  `SCHEDULES=all`, which passed on 2026-11-12 on SQLite, PGlite and Cluster, with the operator's calls among them
  twice. The job `postgres` of the CI runs it on
  the server.
- That the history of the pool runs on SQLite in both orders: **tested**, by a run of 30 histories on SQLite made
  while the test was written, and by each run of the test on a server.
- That runs that share two runners read only their own entities: **tested**, since each run's readings on Cluster
  equal those of a new database.
- That an operator's `resume` and `discard` answer before the entity handles the message it died on, on Cluster:
  **seen**, on 2026-11-12, in three of five runs of the history that sends a `Boom` again after a `resume`. The wait
  after them made ten runs of ten alike.
- That an operation of a suspended entity goes on and sends once its receiver is discarded, on one process and on
  Cluster alike: **seen**, on 2026-11-12, in three runs of each backend of a history that suspends the sender while
  its forward waits. Both applied the `Add` within two seconds of the discard.
- That a forward stores its wait after the step that started it, so that `inspect` may read the receiver before the
  wait is listed: **seen**, on 2026-11-12, in a run of 300 that Cluster answered with the wait and SQLite without it.
  The same history passed once the test waited for the wait to be listed.
- That a sender woken by a `resume` races its receiver's next death: **seen**, on 2026-11-12, in a run of 300 where
  Cluster queued the sender's `Add` in the mailbox and SQLite answered it `Suspended`. Once the calls that race are
  held back, three runs of 300 passed, which held back 13 calls in the first of them, and no wait of the test passed
  its five seconds.
- That the test meets an operation and a timer: **seen**, in a run of 300 counted on 2026-11-12, where 30 forwards
  and 27 ticks were answered `Accepted` and five readings held the forward's reply in the note.
- That an operation's creation answers alike on every backend, whether it creates, finds the entity, or dies:
  **tested**, by `every backend answers every call alike`, in a run of 300 under `SCHEDULES=all` that passed on
  2026-11-13 on SQLite, PGlite and Cluster.
- That the test meets an operation's creation of each kind: **seen**, in a run of 300 counted on 2026-11-13, of
  723 spawns. The readings held the note `Created` 37 times and `AlreadyExists` 192 times. A suspension whose cause
  is not a `Boom`'s was read 28 times, in 15 runs, which counts a forward to an id the library refuses too.
- That the generated runs meet suspensions: **seen**, in one run of 300 counted on 2026-11-12, where `inspect` read a
  suspended entity 131 times, `discard` answered `Discarded` 47 times and `resume` answered `Resumed` 39 times. No
  `resume` answered `StillSuspended`, since the program deployed is the one that died.
- That the rules moved hold on Cluster as on one process: **tested**, by `a rule of one process that holds on Cluster
  too`, which passed five runs in a row on 2026-11-13 on SQLite, PGlite and Cluster. Its tests took 0.3 s at most.
- That the runners start within a minute: **seen**, in the runs of the test on the maintainer's machine.
- That the pool reaches bug 80: **tested**, by `two calls held at a statement on a pool answer as one order of
  them`, whose examples `bug80` lock the publications. On 2026-11-13, in the job `postgres` of the CI, the test
  **failed** at its first example of bug 80 against the trigger once for each row before decision 0286, on the push of
  the branch `claude/pool-bug80-before`, where one publication stayed. It passed with the trigger of decision 0286, on
  the push of `claude/pool-bug80`, which held both calls at once in 38 of a hundred runs. An earlier form of the
  ack read the rows with `published`, and passed against the old trigger, since it waited at the lock.
- That the history of bug 80 leaves no publication on SQLite in either order, and two without its acks: **seen**, on
  2026-11-13, in a run of the history on SQLite in each order while the test was written.
- That two calls held at a statement on a pool answer as one order of them: **tested**, by a hundred runs in the job
  `postgres` of the CI, on the push of `claude/contract-tests-c7e2a1` with decision 0284. Before that decision, with
  `reindex` among the pairs, it **failed**, which is bug 25.
- That some pairs are held at once: **seen**, with a gate drawn among every table, in 6 and in 13 of the hundred
  runs of the CI, where both calls waited at the lock. The other runs still run their two calls at once on two
  connections, unaligned. The test fails a run of 50 or more in which no pair waited at once.
- That a gate drawn among the tables both calls write holds more pairs at once: **seen**, in 40 of the hundred runs
  of the job `postgres` of the CI, on the push of `claude/pool-gate`, where a gate drawn among every table held 6 and
  13.
- That the recording gives a call every statement it runs, those of the fibers the runtime forks for its entity
  among them: **seen**, on SQLite in five pairs run while the test was written. A message's call recorded its writes
  of `effecttea_entities` and `effecttea_outbox`, which its entity's loop runs. A statement the recording misses
  only narrows the tables the gate is drawn among.
- That a lock of a table held by another connection makes a call wait at its first statement of that table:
  **documented** by PostgreSQL, whose `ACCESS EXCLUSIVE` lock conflicts with every other lock of the table.
- That an operator's call answers alike in either order, but for what it counts: **chosen** by this note. `expire`,
  `reindex` and `prune` give counts over every run of the database, which the readings after the pair replace.
- That the prefix of a run leaves an id's refusal as it was: **chosen** by this note. A prefix makes no text a
  database does not hold into text it holds, and the empty id is left empty.

## Alternatives

- **Cluster started by each run.** A start waits for the shards, and a run of the property would pass its budget.
- **The creations the program dies on left out of the generated calls.** The generator would repeat the machine's
  rules of what a projection holds, and a change of them would break the test in silence.
- **A creation the program dies on sent on Cluster, and its wait checked by a timeout.** Cluster delivers it again
  without end, so it would load the runners of every later run, and each run would wait the whole timeout.

## Consequences

- [`src/contract.test.ts`](../../src/contract.test.ts) holds the backends, the shared runners and the decided
  answers of Cluster.
- The next parts of the step are in the [roadmap](../roadmap.md): more calls in the contract, and the tests of the
  runtime that hold a rule of one process, run on Cluster too.
