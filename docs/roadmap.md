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

   A caller's request and an operation's are not code on Cluster yet: `create` and `send` of a handle die there, and so
   does an operation that sends. They go through the door's client, as decisions 0085 and 0091 decide. Four things
   found in Cluster's source at 4.1.2 bear on them:
   - a door's handler is given Cluster's `requestId` with the request, the id
     [decision 0090](decisions/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) keeps;
   - a request answered `Suspended` or `NotFound` is reset as `ClusterWorkflowEngine` resets an activity: its id read
     by `MessageStorage.requestIdForPrimaryKey`, its latest reply by `repliesForUnfiltered`, then `Sharding.reset` with
     that reply as `expectedReplyId` ([decision 0085](decisions/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md));
   - a caller's `keep` is not in the door's payload, which holds the version, the request and the message;
   - Cluster answers a retry within a version from the reply it saved, before any step runs, so a caller's reply past
     its time ([decision 0125](decisions/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)) is still
     given until Cluster's rows of its request are deleted with it, as an entity's are (decision 0090).

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
