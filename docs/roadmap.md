# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **The seeds a step runs before it is taken** ([open question](open-questions.md#running), `How many seeds a bug
   needs`). The count of 2026-11-04 found that 3 of the 15 rules of concurrency the explored tests hold fail only at a
   release, never within the first 100 seeds. A review of that count recommended keeping a twentieth of the seeds
   for a run of the tests, and adding a rule of work to [`AGENTS.md`](../AGENTS.md): a step of the roadmap that changes
   [`src/runtime.ts`](../src/runtime.ts) or [`src/testing.ts`](../src/testing.ts) passes `bun run test:release` before
   it is taken. That run takes about 150 seconds. The step writes the rule in the section `Code and tests`, takes the
   open question out of `docs/open-questions.md`, and needs no note, since the rule's reason fits in a sentence. The
   maintainer confirms the rule before it is written.
2. **A test for the waker's reading and its rest in one step**
   ([decision 0068](decisions/archive/0068-what-another-fiber-reads-changes-in-one-step.md)). In `waking`, in
   [`src/runtime.ts`](../src/runtime.ts), the waker looks whether a poke is waiting, and clears `waker.busy` and calls
   `end()`, in one `Effect.sync`. No test fails when that is split in two steps, a first that reads
   `Queue.sizeUnsafe(waker.poke) === 0` and a second that clears the flag and signals, with no yield forced between
   them. In that window an entity can leave and poke the waker. The waker then clears the flag the departure set, and
   `settled` can return with a poke nobody has taken, and the departed entity's due timer known to nobody.
   - The step writes a test in [`src/runtime.test.ts`](../src/runtime.test.ts) that fails with the split and passes
     every seed without it. A review suggested a small test under `bound: 1` or a prioritized one, in which an entity
     leaves while the waker is between its reading and its rest.
   - The test `settled never returns between a crash and the activation its due timer brings` shows a shape that
     works for the departure's own split: a gate in the probe holds a step, the clock moves with the window closed,
     and a `settled` already waiting looks at every signal once the window opens. A clock moved with the window open
     leaves sleeps that have not started yet behind the move
     ([decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md)). A fiber that asks
     `settled` in a loop keeps `TestClock.adjust` from ever ending.
   - A count of the seeds the test fails, out of 2,000, takes the mutation in a copy of the repository, and runs the
     test under `SCHEDULES=all` with `explored` changed to record each failing seed instead of stopping at the first.
     A seed past the first 100 is pinned in the test, as `pinned` does for the seed 172 of the departure's test.
   - If no test reaches the window within a reasonable effort, the open question `How many seeds a bug needs` says
     so, and why.
3. **A planned stop** ([open question](open-questions.md#running), `A planned stop`). An at-most-once operation under
   way when its process stops delivers `unknown` at the next activation, and
   [decision 0011](decisions/archive/0011-an-operation-declares-what-a-crash-does.md) says the runtime should drain them
   before a planned stop. Today a process ends when the scope it was launched in closes, which interrupts everything
   as a crash does, so every deploy delivers `unknown` for each one under way
   ([decision 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md)). The step decides the drain in a
   note, `proposed` while the step is under way, and writes it with its tests. What was proposed, and recommended by a
   review, for the maintainer to confirm before the note is taken:
   - **A drain bound to the scope**, as an option of `launch`, `drain: { millis }`, that acts when the scope the
     runtime was launched in closes. There is no `stop` of its own: the runtime's life is already its scope, and a
     caller that wants it stopped earlier closes a scope of its own.
   - **No drain by default**, and no default for `millis`: a process launched without the option ends as today.
   - **During the drain**, the runtime takes no new message and no new creation. A caller that arrives waits, and is
     interrupted with the scope, as in a crash. A retry after the restart is answered from the stored reply. There is
     no answer of its own, such as `Stopping`, which every caller's type would carry.
   - **What stops at once**: the timers, and the idempotent and at-least-once operations, which run again at the next
     activation.
   - **What the drain waits for**, up to `millis`: the at-most-once operations under way, and the steps of their
     completions, committed as usual. An at-most-once operation such a step starts is started and waited for too,
     since one stored and never started would deliver `unknown` without having run.
   - **To decide in the note**: a completion's step that sends to another entity during the drain. The proposal is
     that the message is delivered, since the receiver is in the same process and the drain waits for it, within
     `millis`. A receiver in another process, once the runtime is on Cluster, is left to the Cluster step.
   - The tests cover at least: an at-most-once operation under way at a planned stop ends and is not delivered
     `unknown` after the restart; one that outlasts `millis` is delivered `unknown`, as after a crash; an idempotent
     operation is interrupted at once and runs again; a caller that arrives during the drain is answered after the
     restart. The test `an at-most-once operation delivers unknown after a crash, and an idempotent one runs
     again` stays, for a process launched without the option. A change to `src/runtime.ts` that adds a wait or a fork has a test under `explored` that
     fails without it, as [`AGENTS.md`](../AGENTS.md) says.
4. **Two versions at once** ([open question](open-questions.md#running)). It waits for Effect Cluster: Cluster's
   runners carry no version, and a shard may go back to an older one.

## Later

- **Effect Cluster.** The runtime runs on it as [`docs/cluster.md`](cluster.md) and decisions 0081 to 0092 decide,
  with sharding and rolling deploys. It runs across machines once Cluster has a fence, or the runtime one of its own
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Before it is done, the
  two interleavings [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are read
  again, since the runtime on Cluster may change them:
  - a sender that registers for its receiver's resumption only after it is answered `Suspended`
    ([decision 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md)), which a resumption told by a
    message changes ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md));
  - an entity's lock dropped while others wait for it ([decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md)).
- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
