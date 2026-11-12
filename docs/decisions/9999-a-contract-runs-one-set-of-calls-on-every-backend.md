# 9999. A test of a contract runs one set of calls on every backend, Cluster's decided answers in one place

**Status:** proposed, 2026-11-12, for the step The tests of a contract on every backend of the
[roadmap](../roadmap.md). Its number is given when it is merged into `main`, since the second reading of the premise
review takes notes on `main` at the same time. It runs on Cluster too
the calls of [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) that both dialects answer alike.

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
  behind it. A later decision that makes Cluster answer otherwise adds its case beside this one.
- **A call with no answer within 5 s is answered so**, which fails the test rather than holding it.
- **`bun test` runs six runs of the property, and `SCHEDULES=all` runs 300**, so that the test stays within two
  seconds ([decision 0250](0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md)).
- **On a pool of PostgreSQL, two calls run at once, held at a statement.** It is the second part of the step, for
  family D of [`docs/bugs.md`](../bugs.md). The test `two calls held at a statement on a pool answer as one order of
  them` makes two entities, runs a few messages one at a time, then runs two calls at once. Each call is a message,
  a creation, `expire`, `reindex` or `prune`. A connection of its own holds a lock of one of the library's tables,
  which fast-check draws, so that each call that reaches a statement of that table waits there. The lock is let go
  once both calls wait, or after a second. Then each request of the pair is sent again, and every entity is read.
- **The answers on the pool must be those of one of the two orders the calls run in one at a time**, as SQLite runs
  them on a new database. An operator's call is compared by whether it succeeds, since what it counts depends on the
  rows of the other runs. A message of the pair adds to an index, so that a message applied twice shows in the
  readings.
- **The runs on the pool share one database and one runtime**, as the runs on Cluster share their runners, with the
  same prefix of a run.
- **The test of the pool runs a hundred runs, and 500 under `SCHEDULES=all`.** Only `bun run test:postgres`
  reaches it, since `bun test` on one machine has no server. So it holds the budget of the job `postgres`, a minute or
  two, rather than the two seconds of a test of `bun test`.
- **`reindex` is left out of the pairs until bug 25 of [`docs/bugs.md`](../bugs.md) is fixed.** The first run of 200
  on the CI's server failed at the 139th: a `reindex` beside a message wrote the projection of the state before the
  message over the row its step committed. The todo `a reindex held beside a step on a pool leaves the row the step
  wrote` holds the case fast-check shrank it to, and the fix puts `reindex` back.

## What it rests on

- That one process and Cluster answer alike every call of the generated runs, the creations the program dies on
  aside: **tested**, by `every backend answers every call alike`, in six runs under `bun test` and in 300 under
  `SCHEDULES=all`, which passed on 2026-11-12 on SQLite, PGlite and Cluster. The job `postgres` of the CI runs it on
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
- That the runners start within a minute: **seen**, in the runs of the test on the maintainer's machine.
- That two calls held at a statement on a pool answer as one order of them, `reindex` aside: **tested**, by a hundred
  runs in the job `postgres` of the CI, on the push of `claude/contract-tests-c7e2a1` at `0e7155d`. With `reindex`,
  it **failed**, which is bug 25.
- That some pairs are held at once: **seen**, in 6 of the hundred runs of the CI, where both calls waited at the
  lock. The other runs still run their two calls at once on two connections, unaligned. The test fails a run of 50
  or more in which no pair waited at once.
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
