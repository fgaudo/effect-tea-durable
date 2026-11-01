# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **Two versions at once** ([open question](open-questions.md#running)). It waits for Effect Cluster: Cluster's
   runners carry no version, and a shard may go back to an older one.
2. **Suspended entities** ([open question](open-questions.md#running)): how an operator sees, resumes and discards
   them, and who is told that a sender waits. It does not wait on Cluster, and is taken before it if an operator
   needs it first.

## Later

- **Effect Cluster.** The runtime runs on it as [`docs/cluster.md`](cluster.md) and decisions 0081 to 0092 decide,
  with sharding and rolling deploys. It runs across machines once Cluster has a fence, or the runtime one of its own
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Before it is done, the
  two interleavings [decision 0104](decisions/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are read
  again, since the runtime on Cluster may change them:
  - a sender that registers for its receiver's resumption only after it is answered `Suspended`
    ([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)), which a resumption told by a
    message changes ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md));
  - an entity's lock dropped while others wait for it ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)).
- **When Effect moves past 4.1.1**, a script in `scripts/` compares the JSDoc of the functions
  [decision 0107](decisions/0107-what-effect-documents-of-the-premises.md) reads, in the old release and the new. A
  spike tells when a behaviour changes; the comparison tells when a promise is added or taken away
  ([decision 0108](decisions/0108-a-premise-about-a-dependency-is-looked-up-in-its-documentation-first.md)).
- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design covers
  ([decision 0106](decisions/0106-notes-the-design-covers-are-archived-at-each-release.md)).
