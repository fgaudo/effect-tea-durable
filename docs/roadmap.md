# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **A Cluster id kept by a client is not deleted under a request Cluster still reads.** A client keeps the Cluster
  id of its request once it has an answer, whatever the answer is, and a step of the entity or `expire` deletes
  Cluster's rows under the id once its time is past
  ([decision 0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md),
  [decision 0248](decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)). An answer that is
  no reply is reset at the retry, and sent again under the same id: `Suspended` and `NotFound` of a message
  ([decision 0165](decisions/archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)),
  and `Rejected` of a creation ([decision 0182](decisions/0182-init-may-reject-the-flags.md)). The id is not kept
  again, so its first time stands. A deletion between the reset and the delivery takes the request, and the retry
  waits for ever. Without any race, the step that answers such a retry deletes its own request's row, and Cluster
  saves the reply under an id no request holds, a row of `cluster_replies` left for ever. A review of the notes
  that change another found it, in a session of 2026-11-11.
  - Done: three tests that fail, in the commit `4f8ded8` of the branch `claude/premise-review-1f63ba`, not merged.
    They are `FAILING: a retry of a rejected creation is answered though an expire runs before Cluster delivers it
    again`, the same for `a message answered Suspended`, and `FAILING: the step that answers a retry of a message
    answered Suspended leaves no reply without its request`, in `src/cluster.test.ts`. The branch was cut before
    decision 0248.
  - Next: run the three tests on the code of decision 0248, whose margin moves the first time and does not renew
    it. Then decide, in a note that changes 0171, whether a client keeps the id only for an answer that is a reply,
    or a reset drops the id kept. The step begins in `keptGiven` and `reset` of
    [`src/cluster.ts`](../src/cluster.ts), and in `keepGiven` of
    [`src/storage/cluster.ts`](../src/storage/cluster.ts).

- **A review of every note that changes another, for a premise the later note takes away.** A rule of an earlier
  note is safe under conditions, some never written, and a later note that changes or reuses the rule may take one
  away. Three such cases are found: decision 0248, this file's first step, and a drain across a deploy of a newer
  version, an [open question](open-questions.md#running). Each was a caller that waits for ever or work run
  otherwise than the design says, which no test of its note met. So the review reads every pair of notes of
  [the index](decisions/README.md) before the release, by the procedure of
  [`.claude/skills/premise-review/SKILL.md`](../.claude/skills/premise-review/SKILL.md), one area at a time. What it
  finds is a step of this file or an open question.
  - Done, in a session of 2026-11-11, both notes read whole with the code: 0171, 0125, 0090, 0169, 0170, 0173 and
    0182 against 0245; 0156 against 0176; 0119 against 0219; 0064 against 0247; 0167 against 0092; 0157 against
    0222. Its findings are the first step of this file and two open questions, the drain above and the deletions
    of a reply on a pool of PostgreSQL.
  - Read by the code and the later note only, so to read whole: 0039, 0137, 0152, 0029, 0068, 0076, 0078, 0151,
    0159, 0174, 0175, 0161 to 0163, 0172, 0021 and 0065.
  - Next, the sections of the index not read at all: the machine and the program; operations and timers; creation
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
