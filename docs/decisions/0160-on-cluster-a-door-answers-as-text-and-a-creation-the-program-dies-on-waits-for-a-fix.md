# 0160. On Cluster, a door answers as text, and a creation the program dies on waits for a fix

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Changes how
[decision 0124](0124-the-boundary-authenticates-and-update-authorizes.md) holds on Cluster: a creator is not given
the defect of a creation the program dies on.

## Context

On Cluster, a program's entity is a door with two RPCs, for a creation and for a message
([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)), whose handler steps the
request in Cluster's transaction ([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)). Everything a
step answers is a success of the RPC, and Cluster saves it as the request's reply. A retry under the same key is
given that reply, for ever.

On one process, a creation whose `init`, `durable` or `project` dies stores nothing, and its creator is given the
defect. A retry after a fix creates the entity (decision 0124). Decision 0124 refused to store the defect as a
reply, since a retry after a fix would be given the defect for ever. On Cluster, a defect given to the creator is a
reply Cluster saves, under a key a fix of the same version keeps.

## Decision

- **A door answers with text**, the JSON of what the step answers: a reply, `NotFound` or `Suspended` for a
  message, and `Created` or `AlreadyExists` for a creation. A rejection's reason is written by the program's schema
  of rejections. The runtime's client decodes it, and Cluster never reads it.
- **A creation the program dies on stores nothing, and dies.** Cluster restarts the door and delivers the creation
  again after its backoff, without end, and saves no reply
  ([decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) relies on the
  same restart). The creator waits until a deploy fixes the program, and the creation is then made, under the
  request it was sent with. The creator is not given the defect: Cluster would save it, and a retry after the fix
  would be given it.
- **A message is handled up to its own answer**, in the step's transaction. Its arrival is received, and the head of
  the mailbox is handled, one step after the other, until a step answers it, or the entity suspends on the way,
  which answers it `Suspended` ([decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)).

## What it rests on

- That Cluster restarts a door after a defect of its handler, without end, and saves no reply: **documented** by
  the JSDoc of `defectRetryPolicy` at 4.1.2, and **tested** by the test of
  [`src/cluster.test.ts`](../../src/cluster.test.ts) in which a creation the program dies on leaves no entity, no
  reply, and its request unprocessed.
- That a success of the RPC is saved in the handler's transaction, and that a retry under the same key is given it:
  **documented** by the JSDoc of `WithTransaction`, and **tested** by the test in which a door answers each message
  as the machine does.

## Alternatives

- **The defect given to the creator, as on one process.** Cluster saves it as the reply, and a retry after a fix
  gets it until the reply is deleted. Deleting it would need the creator to say when, which decision 0124 refused.
- **The defect as a failure of the RPC.** Cluster saves a failure as the reply too, after the rollback.
- **A defect answered and the request reset**, as a client resets `Suspended`
  ([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)). It would deliver the
  creation again at once, and the program dies on it again, in a loop with no backoff.

## Consequences

- [`src/cluster.ts`](../../src/cluster.ts) gives the codecs of a door's answers, and
  [`src/runtime.ts`](../../src/runtime.ts) the step a door runs, which settles the entity's machine first
  ([decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)).
- [`src/storage.ts`](../../src/storage.ts) reads a delivered request, message and flags at the version that wrote
  them.
- `docs/design.md` says, once the step is done, that a creator on Cluster waits for a fix of a creation the program
  dies on.
