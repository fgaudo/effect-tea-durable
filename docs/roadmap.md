# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **A planned stop** ([open question](open-questions.md#running), `A planned stop`). An at-most-once operation under
   way when its process stops delivers `unknown` at the next activation, and
   [decision 0011](decisions/archive/0011-an-operation-declares-what-a-crash-does.md) says the runtime should drain them
   before a planned stop. Today a process ends when the scope it was launched in closes, which interrupts everything
   as a crash does, so every deploy delivers `unknown` for each one under way
   ([decision 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md)). The step decides the drain in a
   note, `proposed` while the step is under way, and writes it with its tests.
   [Decision 0119](decisions/0119-a-planned-stop-drains-the-at-most-once-operations.md) is that note, with the code
   and the tests of `a planned stop` in [`src/runtime.test.ts`](../src/runtime.test.ts). The maintainer confirms it
   before it is taken, and the commit that takes it says in `docs/design.md` what a planned stop does. What was
   proposed, and recommended by a review:
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
2. **Two versions at once** ([open question](open-questions.md#running)). It waits for Effect Cluster: Cluster's
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
