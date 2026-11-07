# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **Effect Cluster.** The runtime runs on it as [`docs/cluster.md`](cluster.md) and decisions 0081 to 0092 decide,
   with sharding and rolling deploys. Its runners share one database. It runs on SQLite, whose commit checks the
   shard, and across machines on PostgreSQL once Cluster has a fence, or the runtime one of its own
   ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md),
   [decision 0157](decisions/0157-the-storage-speaks-sqlite-and-postgresql.md)).

   Cluster's runners carry no version, and a shard may go from a new runner back to an old one
   ([open question](open-questions.md#running)). The step decides what keeps an older version from the rows a newer
   one wrote, with what the runtime holds alone, whatever Cluster comes to give.

   Before the step is done, the two interleavings
   [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are read again,
   since the runtime on Cluster may change them:
   - a sender that registers for its receiver's resumption only after it is answered `Suspended`
     ([decision 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md)), which a resumption told by a
     message changes ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md));
   - an entity's lock dropped while others wait for it ([decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md)).

   On Cluster an entity's type is its program's name, and Cluster stores its messages under it, so a rename moves
   Cluster's rows too ([decision 0156](decisions/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)).

   A consumer's wait on Cluster ends at a commit of its own runner in its topic, and at another runner's commit, which
   a runner learns from SQLite's `data_version` while a reading waits
   ([decision 0163](decisions/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md),
   proposed). The signal of PostgreSQL is decided with that database.

   A caller's `create` and `send` go through Cluster's client of the door, with `keep` in the payload, and a message
   answered `Suspended` or `NotFound` is reset and sent again
   ([decision 0165](decisions/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md),
   proposed). An operator's `Resume` and `Discard` go through it too, each a request of its own
   ([decision 0166](decisions/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), proposed).
   So do an operation's, and a step that resumes or discards an entity tells `Resumed` to the entities whose
   operations it answered `Suspended` ([decision 0167](decisions/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md), proposed). A failure
   Cluster saved of its own is reset before it is given
   ([decision 0168](decisions/0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md), proposed). An
   operation's request ids are kept under its work, and Cluster's rows deleted with it, and `Resumed` leaves its id
   pending ([decision 0169](decisions/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md),
   proposed). An operation's client keeps the request's id before it resets a failure Cluster saved
   ([decision 0170](decisions/0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md),
   proposed). What is left of requests on Cluster is the deletion of a caller's rows in Cluster's tables with its
   reply once past its time (decision 0165). Until then Cluster answers a retry past `keep` within a version from the
   reply it saved.

   Effect-TS/effect#10239, which asks Cluster to forget a processed request, was closed by a merged pull request
   that no release holds at 4.1.2. Until one does, the deletions are the runtime's own statements (decision 0090).

2. **The runtime's bookkeeping in Effect's `Tx` modules**, if the open question of bookkeeping in transactions, under
   [Running](open-questions.md#running), decides for them. What another fiber reads would change in one transaction,
   and not in one synchronous step kept by hand
   ([decision 0068](decisions/archive/0068-what-another-fiber-reads-changes-in-one-step.md)). The waker's reading of the
   entities held and its wait for a poke would be one transaction. The step comes after Effect Cluster, which says
   what bookkeeping a runner keeps. The tests under prioritized schedules check the rewrite, and the seeds they pin
   are found again after it.

## Later

- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.

- **A model of the runtime's protocol on Cluster**, in TLA+ or a model checker like it, if the step Effect Cluster
  keeps finding interleavings between runners. The model checks every state the protocol reaches within its bounds:
  the shards a runner holds and lets go, a step's commit that checks the shard, and two versions at once
  (decisions 0084, 0159 and 0162). A model proves the protocol and not the code, so the tests stay.
