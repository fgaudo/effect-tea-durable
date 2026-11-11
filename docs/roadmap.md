# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **A review of every note that changes another, for a premise the later note takes away.** A rule of an earlier
  note is safe under conditions, some never written, and a later note that changes or reuses the rule may take one
  away. Three such cases are found: decision 0248,
  [decision 0249](decisions/0249-on-cluster-a-reset-drops-the-id-a-callers-client-kept.md), and a drain across a
  deploy of a newer version, an [open question](open-questions.md#running). Each was a caller that waits for ever or work run
  otherwise than the design says, which no test of its note met. So the review reads every pair of notes of
  [the index](decisions/README.md) before the release, by the procedure of
  [`.claude/skills/premise-review/SKILL.md`](../.claude/skills/premise-review/SKILL.md), one area at a time. What it
  finds is a step of this file or an open question.
  - Done, in a session of 2026-11-11, both notes read whole with the code: 0171, 0125, 0090, 0169, 0170, 0173 and
    0182 against 0245; 0156 against 0176; 0119 against 0219; 0064 against 0247; 0167 against 0092; 0157 against
    0222. Its findings are decision 0249 and two open questions, the drain above and the deletions of a reply on a
    pool of PostgreSQL.
  - Read by the code and the later note only, so to read whole: 0039, 0137, 0152, 0029, 0068, 0076, 0078, 0151,
    0159, 0174, 0175, 0161 to 0163, 0172, 0021 and 0065.
  - Done, in a second session of 2026-11-11, both notes read whole with the code: the section The machine and the
    program, 0002 to 0202 against the notes that change them, 0065 against 0013 among them. It reproduced nothing.
    Its findings, only reasoned, are two open questions: request ids under a sender of `null`, and an own message
    named like a child with a tag typed `string`. A third case it noticed and did not reach, a retry in a rehearsal
    after a deploy that changes how the sender is written, is an open question too.
  - Next, the sections of the index not read at all: operations and timers; creation
    and defects; the queries and their pages, 0141 to 0150, 0207 and 0209; the tables and migrations, 0191 to 0218
    and 0225; the rehearsal and testing, 0131, 0183 to 0189, 0200 and 0211; the scheduler of the tests, 0104, 0115,
    0117 and 0244; and what enters the library. The step begins with the skill's brief, given the first of these
    areas.

## Later

- **The release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
  The release decides whether `exports` names the sources or JavaScript with declarations, as effect-tea ships, and
  writes the metadata of `package.json`: a `description` in the words of the README, `repository`, `homepage` to the
  site, `sideEffects`, and `keywords` with the words people search this problem by, `saga` and `durable-execution`
  among them, since the README says where the library differs. What it publishes leaves out the files of the tests,
  `*.test.ts` and `*.test_*.ts` ([decision 0241](decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md)).

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own is tested on the server of PostgreSQL with a pool that the CI runs
  ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). The step also decides whether the runtime
  checks its advisory lock, which a server that ends its session gives back
  ([open question](open-questions.md#running)).
