# 0168. On Cluster, a failure Cluster saved of its own is reset before it is given

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Says how
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) is code for a defect Cluster
saves as a request's reply, and extends it from an operation's request to a caller's. An operation's client keeps
the request's Cluster id before the reset, by [decision 0170](0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md).

## Context

A door's handler fails with nothing, and Cluster does not save a defect of it
([decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). So a failure
saved as a request's reply is Cluster's own. Decision 0092 has the client of an operation given one reset the
request, with the saved defect as the reply expected, and send again after `retry`.

Cluster's source at 4.1.2 saves such a failure in the storage read of `Sharding.ts`. A request whose entity type
the runner does not register within `entityRegistrationTimeout` is given a defect reply. The JSDoc of that option in
`ShardingConfig.ts` says the message is then marked as failed, and gives a default of one minute. A rolling deploy
reaches the case: a runner that holds a shard and does not deploy a program yet fails every request to that
program's entities there.

Until this note, the client gave the failure, and Cluster answered every retry under the same request id from the
reply it saved. A caller's retry failed for ever, and so did an operation's, which takes a defect as a receiver's
crash and sends again after `retry` ([decision 0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)).

## Decision

- **A request whose call fails, and whose latest reply in Cluster's storage is a failure, has that reply reset
  before the failure is given.** The client reads the request's id by its primary key and its latest reply by that
  id, as for a `Suspended` (decision 0165), and calls `Sharding.reset` with that reply as the one expected. This holds
  for a creation and a message, of a caller and of an operation.
- **The failure is still given.** A caller is given it as a defect, as before. An operation takes it as a receiver's
  crash, and sends again after `retry` (decision 0167). The retry is delivered again, and is handled once the
  failure's cause has passed: a program deployed on the runner that holds the shard, above all.
- **A failure with no failure saved died at the sender**, and nothing is reset. A retry sends the request again.
- **An interruption resets nothing.** A caller that stops waiting leaves its request alone
  ([decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)).
- **A reset that fails is not given.** The request's own failure is, and the next retry resets again.
- **An operator's event and `Resumed` are not reset.** Each one sent is a request of its own, with no primary key,
  which no saved reply answers again
  ([decision 0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)).

## What it rests on

- Cluster saves a defect reply for a request whose entity type no runner registered in time: **read in the source**,
  the storage read of `cluster/Sharding.ts` at 4.1.2, and **documented**, in the JSDoc of
  `entityRegistrationTimeout`, `@stability unstable`. It is **tested** by `a request Cluster failed, its type
  registered by no runner in time, is reset, and handled once it is` in [`src/cluster.test.ts`](../../../src/cluster.test.ts),
  which fails without the reset: the retry is given `Entity type 'Ghost' not registered`.
- A door's handler saves no failure of its own, so a failure saved is Cluster's: **read in the source**, as decision
  0159 says, and **tested** for it.
- A reset with the saved failure as the reply expected has the request delivered again: **tested** by the same test,
  whose retry is answered `Created`.
- That every failure Cluster saves of its own passes with time, or is one the operator fixes, so that a request
  reset again at each retry costs only its retries: **only reasoned**. A payload Cluster's schema does not decode
  fails at every delivery; the runtime's payload is JSON text, which that schema decodes as it is (decision 0085).

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **The reset followed by a second call, whose answer is given**, as for a `Suspended`. In a rolling deploy the
  second call mostly waits for Cluster's next reading only to fail again, and no test tells it apart from the reset
  alone.
- **`Effect.retry` with a `Schedule` in the client.** An operation sends again after `retry` already, and a caller
  chooses its own retries.
- **A longer `entityRegistrationTimeout`.** It is the launcher's to set, and the runtime cannot know how long a
  rolling deploy lasts. A failure saved after any timeout still answers every retry.
- **The defect's kind, `EntityNotManagedByRunner` or another, read off the failure.** The reply Cluster saved says
  whether there is anything to reset, and the kind does not.
- **`disableFatalDefects` on the door.** It would save a defect of the handler as the reply too, and lose its message
  (decision 0159).

Other ways:
- **A caller given the failure without a reset, as decision 0092 decides for an operation alone.** Its retry would be
  given the same failure for ever, within the version.

## Consequences

- A caller or an operation that sends to a program a runner does not deploy yet is failed until that runner
  deploys it, and is handled at its next retry after that.
- A failure Cluster saved and reset for an operation's request goes with the operation's work, under the request's
  id ([decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)), once
  a step has answered the request. One for a caller's request stays in Cluster's tables, as the caller's request does
  ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
