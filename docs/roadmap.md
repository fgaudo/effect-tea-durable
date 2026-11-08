# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **A CI on Linux.** The repository has no workflow. One runs `bun run typecheck`, `bun test` and `bun run links`
  on every push, and `bun run test:release` before a release. It is also where the test of a runner stopped with
  `SIGTERM` runs, which Windows cannot run ([open question](open-questions.md#running)). The tooling is a rule of
  work, so [`AGENTS.md`](../AGENTS.md) states it, and no note is taken.

## Later

- **PostgreSQL on a server with a pool.** The storage's tests and the runtime's tests of the log run against a
  server in a container, in the CI of the step above, so that what is only reasoned of many connections is tested:
  the order of a partition's commits, the advisory lock, a deadlock or a failure of serialization in a step
  ([open question](open-questions.md#running)). A library for most backends needs it before its release.

- **The runtime's housekeeping.** `expire`, `prune` and `forget` are an operator's calls, and a reply sent without
  `keep` is kept for ever, so the replies of a deployment grow without bound by default
  ([decision 0125](decisions/archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)). The step
  decides whether the runtime runs `expire` and `prune` at an interval, as an option, or whether `send` has a default
  `keep`, and says it in the design. On Cluster the runtime deletes Cluster's rows by its own statements, since
  Cluster forgets no processed request ([decision 0090](decisions/archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md),
  [0169](decisions/archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md),
  [0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)).
  The pull request for [Effect-TS/effect#10239](https://github.com/Effect-TS/effect/issues/10239) adds a retention of
  completed requests to Cluster, merged and in no release at 4.1.2: once a release holds it, a move of Effect's
  version weighs it against those statements, and a note says which rows the runtime still deletes itself.

- **A timer months away.** A sleep past 2^31 − 1 milliseconds, about 24.8 days, is beyond `setTimeout`, and Effect
  splits it into sleeps of that length, read in `node_modules/effect/src/internal/effect.ts` at 4.1.2 and documented
  nowhere. A subscription's renewal rests on it ([`examples/subscription`](../examples/subscription)). A spike sees
  it, and a note lists it among what the timers rest on.

- **A quick start, and a runtime in modules.** The README's first code is [`examples/order/order.ts`](../examples/order/order.ts),
  312 lines; a quick start shows a program of a screen, its rehearsal and its `launch` in forty. `src/runtime.ts` is
  one closure of 2 850 lines, with one process and Cluster interleaved: it is divided by responsibility, the loop of
  an entity, the callers, the waker, the steps on Cluster, with no change of semantics and no note.

- **A guide from requirements to a program.** An agent that built a backend from the documentation alone, a rental
  of bikes, learned five rules of modelling only from the examples' code. The design states each rule it rests on,
  but no document says what the rule asks of a program. A guide for whoever writes a program says each one, with
  its example:
  - A reply carries no data, so a value one entity needs of another travels with the request. The receiver refuses
    a value that changed since, as a rate read by the boundary and sent with the request.
  - The id of an entity a caller creates is derived from the caller's request id. An id drawn anew at each try
    creates a second entity on a retry.
  - An operation under way leaves the state only by its completion, so a state that follows it carries it as a
    field, with its key. An email sent at most once that is under way when a ride ends is carried into the end.
  - A projection reads no clock. An action that becomes allowed at a time is a field of the state, which a timer
    changes at that time.
  - A row with no life of its own, such as a customer, is a table of the application. The table may live in the
    runtime's database, written on the client the runtime was launched with, as a consumer's store already may.

- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.

- **What the runtime tells a tracer**, after the release: the spans and metrics of the machine's events, which the
  [open question](open-questions.md#running) lists what would decide.

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own waits for tests on a server of PostgreSQL with a pool, which the step above runs.

- **A model of the runtime's protocol on Cluster**, in TLA+ or a model checker like it, if the tests on Cluster
  keep finding interleavings between runners. The model checks every state the protocol reaches within its bounds:
  the shards a runner holds and lets go, a step's commit that checks the shard, and two versions at once
  (decisions 0084, 0159 and 0162). A model proves the protocol and not the code, so the tests stay.
