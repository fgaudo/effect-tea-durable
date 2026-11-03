# Decisions

Each note decides one thing that rests on a premise that can fall, or that an API, a test or a semantics of the
code keeps. A note made for a step of the
roadmap is `proposed`, and rewritten while the step is under way; once taken it is `accepted`, and never
rewritten: a decision that changes is a later note, which the changed one's status line names. The rules of work
have no note: [`AGENTS.md`](../../AGENTS.md) states them, and git keeps what they were. A number with no note was
one of theirs, a record of a move of Effect's version, a note deleted once no document needed it, which git keeps
and its citations sum up, or never used; a number is never given again. Here the
notes are listed by what they decide, with the notes that changed each one; [`design.md`](../design.md) says what
holds now, and the notes a document says what holds of are in [the archive](archive/README.md). The reviews of
the notes, with what each read and found, are in [`reviews.md`](reviews.md).

## Effect Cluster

| Note | Decides | Changed by |
| --- | --- | --- |
| [0081](0081-on-cluster-a-step-commits-with-its-reply.md) | On Cluster, a step commits with its reply | [0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md), [0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md), [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md) | A step commits only where the commit checks the shard |  |
| [0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md) | On Cluster, a request is keyed and answered as on one process |  |
| [0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) | On Cluster, a reply is deleted as on one process, and Cluster's rows with it | [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md) | On Cluster, an interrupted caller leaves its request alone |  |
| [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) | On Cluster, the runtime keeps its entities, and learns its shards from a singleton of each |  |
