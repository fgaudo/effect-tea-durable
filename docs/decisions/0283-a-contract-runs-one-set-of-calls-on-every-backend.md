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

On Cluster some answers differ by a decision. A creation the program dies on gives its creator the defect on one
process, and nothing is stored. On Cluster the creation waits until a deploy fixes the program, and Cluster
delivers it again without end ([decision 0160](archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
Every later request to the same entity waits behind it. The first run of the test on Cluster met this case and
waited: a creation whose projection holds U+0000 in an index.

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
- **One process answers first, and the answers Cluster gives otherwise by a decision are written once, here.** A
  creation that one process refuses with a defect, whose id and request id are no defect of the caller's, and whose
  flags the machine's `start` dies on, is a creation the program dies on. It is not sent on Cluster, and each backend answers it with the same mark of
  decision 0160. The requests to its entity after it leave the run on every backend, since on Cluster they wait
  behind it. An operator's `resume` and `discard` of that entity leave too, since on Cluster they go through the door
  ([decision 0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)). A later
  decision that makes Cluster answer otherwise adds its case beside this one.
- **The calls of an operator are among the calls generated.** They are `inspect`, `resume`, `discard` and
  `suspended`, and `expire`, `prune` and `reindex`. A message `Boom`, which the program dies on, is followed by an
  operator's call on its entity in one call of five, so that an operator meets a suspension often. What `inspect`,
  `resume` and `discard` give is compared without `since`, a time of the runtime's clock, and with a cause kept only
  as whether it is the defect of a `Boom`. `expire`, `prune` and `reindex` count over every run that shares a backend,
  so only their success is compared.
- **After a `resume` or a `discard`, the test waits until the entity is suspended or its mailbox is empty.** The
  operator is answered before the entity handles the message it died on. A message sent then on Cluster was queued
  behind that step and answered `Suspended` when the entity suspended again, while on SQLite the entity had suspended
  before the message came. Both are answers the design allows, so the test waits rather than compare a race.
- **A call with no answer within 5 s is answered so**, which fails the test rather than holding it.
- **`bun test` runs four runs of the property, and `SCHEDULES=all` runs 300**, so that the test stays within two
  seconds. Six runs took 1.9 to 2.0 s once the operator's calls were among them, and four take 1.3 to 1.5 s ([decision 0250](0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md)).
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
- **The answers on the pool must be those of one of the two orders the calls run in one at a time**, as SQLite runs
  them on a new database. An operator's call is compared by whether it succeeds, since what it counts depends on the
  rows of the other runs. A message of the pair adds to an index, so that a message applied twice shows in the
  readings.
- **The runs on the pool share one database and one runtime**, as the runs on Cluster share their runners, with the
  same prefix of a run.
- **The test of the pool runs a hundred runs, and 500 under `SCHEDULES=all`.** Only `bun run test:postgres`
  reaches it, since `bun test` on one machine has no server. So it holds the budget of the job `postgres`, a minute or
  two, rather than the two seconds of a test of `bun test`.
- **A failure is pinned as examples of the test.** The first run of 200 on the CI's server failed at the 139th, which
  is bug 25 of [`docs/bugs.md`](../bugs.md): a `reindex` beside a message wrote the projection of the state before the
  message over the row its step committed. Its case, as fast-check shrank it, is pinned on the table of projections,
  where it fails at its first run against the code before
  [decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md), which fixes it. A pinned case names its table, since the place of a table among the
  library's may change.

## What it rests on

- That one process and Cluster answer alike every call of the generated runs, the creations the program dies on
  aside: **tested**, by `every backend answers every call alike`, in four runs under `bun test` and in 300 under
  `SCHEDULES=all`, which passed on 2026-11-12 on SQLite, PGlite and Cluster, with the operator's calls among them
  twice. The job `postgres` of the CI runs it on
  the server.
- That on Cluster a creation the program dies on waits: **tested** by the test of decision 0160 in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), and **seen** in the first run of this test.
- That the history of the pool runs on SQLite in both orders: **tested**, by a run of 30 histories on SQLite made
  while the test was written, and by each run of the test on a server.
- That a later request to its entity is not answered on Cluster as one process answers it: **seen**, in the first
  run of this test. A message after such a creation was given no `NotFound` within 5 s, while the runner logged the
  creation's restarts. Were it answered, the decision would only compare fewer calls than it could.
- That a creation the program dies on is one whose flags `start` of [`src/machine.ts`](../../src/machine.ts) dies
  on: **read in the source**, of `src/runtime/doors.ts`, whose door runs `start` and dies on its defect. The test
  marks a creation only where one process refused it with a defect, its id and request id pass `idFault` and
  `requestIdFault` of [`src/program.ts`](../../src/program.ts), and `start` dies. A creation of the caller's defect
  is so compared on Cluster too.
- That runs that share two runners read only their own entities: **tested**, since each run's readings on Cluster
  equal those of a new database.
- That an operator's `resume` and `discard` answer before the entity handles the message it died on, on Cluster:
  **seen**, on 2026-11-12, in three of five runs of the history that sends a `Boom` again after a `resume`. The wait
  after them made ten runs of ten alike.
- That the generated runs meet suspensions: **seen**, in one run of 300 counted on 2026-11-12, where `inspect` read a
  suspended entity 131 times, `discard` answered `Discarded` 47 times and `resume` answered `Resumed` 39 times. No
  `resume` answered `StillSuspended`, since the program deployed is the one that died.
- That the runners start within a minute: **seen**, in the runs of the test on the maintainer's machine.
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
