# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

First, the notes 0001 to 0079 that no review read are reviewed, in lots of about fifteen, each in a session that
did not write them, and their premises about a dependency are checked by a spike kept in `spikes/`
([decision 0097](decisions/0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md)). Each lot is listed
in the [reviews](decisions/README.md#reviews); the backlog is done when 0079 is read. The next lot is 0076 to 0079;
[`scripts/mutate.ts`](../scripts/mutate.ts) takes out each rule of the code its notes decide, and runs the tests
against it.

The bugs of the third audit are fixed: a creation and a message under one request id are answered apart
([decision 0050](decisions/0050-a-creation-is-answered-apart-from-a-message.md)), and a deploy that fails
leaves nothing running ([decision 0051](decisions/0051-a-deploy-that-fails-leaves-nothing-running.md)). What it
found to make the project purer and more rigid was planned in steps, and all of them are done. The first two:
the machine gives what an event writes, and the storage decides nothing
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)), and work is compared by what is stored
([decision 0058](decisions/0058-work-is-compared-by-what-is-stored.md)); so are the next three: a request is a
value ([decision 0059](decisions/0059-a-request-is-a-value.md)), `send` and `create` take no key
([decision 0060](decisions/0060-send-and-create-take-no-key.md)), and only what the program does is its defect
([decision 0061](decisions/0061-only-what-the-program-does-is-its-defect.md)); and so are two more: a row is read
through a schema ([decision 0062](decisions/0062-a-row-is-read-through-a-schema.md)), and the runtime polls nothing
([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)); and so is the next: the program is
not the machine's state, and a fix is a deploy
([decision 0064](decisions/0064-the-program-is-not-the-machines-state.md)); and so is the one after it: the
machine holds no replies, and only a step changes it
([decision 0065](decisions/0065-the-machine-holds-no-replies.md)); and so is the last: the runtime's tests move
time instead of waiting for it ([decision 0066](decisions/0066-the-runtimes-tests-move-time.md)). Each step is
decided in a note before it is made.

The open questions that bear on cost are decided next. The first is: each entity is held by a lock of its own,
not by one permit for the process ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)).

A bug of correctness came before the last of them, and is fixed: a reply is keyed by the version that wrote it,
so a sender migrated onto another's text takes nothing of its row
([decision 0069](decisions/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md)).

A review of decisions 0027 to 0039 found five more corrections, and all of them are made:

- `reindex` writes a row only over the state it was computed from
  ([decision 0070](decisions/0070-reindex-writes-a-row-only-over-its-state.md));
- a process starts the entities whose mailbox holds a message
  ([decision 0071](decisions/0071-a-process-starts-the-entities-with-a-message.md));
- the log shows what a step changed, as the program deployed computes it
  ([decision 0072](decisions/0072-the-log-shows-what-a-step-changed.md));
- what the runtime did is told to a probe, out of its options
  ([decision 0073](decisions/0073-what-the-runtime-did-is-told-to-a-probe.md));
- [`AGENTS.md`](../AGENTS.md) says that a note is taken by the commit that adds it, so that a correction found
  later is a note of its own.

The last cost question is decided too: a message that finds the mailbox empty is handled as it arrives, in one
transaction, and a burst waits in memory, where the runtime bounds nothing
([decision 0074](decisions/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)).

What comes next is chosen among the [open questions](open-questions.md): those Effect Cluster's step depends on
before it. Three are decided: a process deploys a name once, and a new version is a new process
([decision 0075](decisions/0075-a-name-is-deployed-once-in-a-process.md)); a process launched with a capacity
unloads the least recently used of its idle entities once it holds more
([decision 0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)); and the waker
tries an entity it cannot load again after the retry, instead of dying with the program's timers
([decision 0077](decisions/0077-the-waker-tries-an-entity-it-cannot-load-again.md)). A review corrected the first two:
a timer due is no spare entity, and a registered deploy keeps its name
([decision 0078](decisions/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)), and it
found a bug older than them, fixed too: what a caller sets going — an activation, a creation — is finished
without it ([decision 0079](decisions/0079-what-a-caller-sets-going-is-finished-without-it.md)). Checking the next,
[two versions at once](open-questions.md#running), found that nothing kept two runtimes off one database, and lost
a step to it; it is fixed: a database is held by one runtime
([decision 0080](decisions/0080-a-database-is-held-by-one-runtime.md)). Two versions at once needs two processes on
one store, so it waits for what Effect Cluster says of which process holds which entities.

Effect Cluster is studied, at `effect` 4.1.0: [`docs/cluster.md`](cluster.md) says what it gives, what it leaves to
the runtime, and which decisions it bears on. Its findings are decided next, each in a
note, in this order, since each may change the ones after it. The first is decided, against a spike run on
`SingleRunner`: on Cluster, a step commits with its reply, in Cluster's transaction, and everything it answers is a
success of the RPC ([decision 0081](decisions/0081-on-cluster-a-step-commits-with-its-reply.md)); what its spike saw of a
defect is an option of Cluster's and a bug, not its contract
([decision 0082](decisions/0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md)), confirmed on 4.1.1, which the
project pins since ([decision 0083](decisions/0083-effect-moves-to-4-1-1.md)). The fence is decided too: a step commits
only where the commit checks the shard, so the runtime on Cluster runs on SQLite, and waits on PostgreSQL and MySQL for
the fence [Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058) asks of Cluster, or for one of its
own ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). So are requests and
replies: a request is keyed in Cluster's primary key by its `requestKey`
([decision 0085](decisions/0085-on-cluster-a-request-is-keyed-as-the-machine-keys-it.md)) and the version that keyed
it ([decision 0086](decisions/0086-on-cluster-a-request-is-keyed-by-its-version-too.md)); a request answered
`Suspended` or `NotFound` is handled again when sent again
([decision 0087](decisions/0087-on-cluster-what-is-not-a-reply-is-handled-again.md)); the message an entity dies on
stays in the runtime's mailbox ([decision 0088](decisions/0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md));
a reply is deleted as on one process, and Cluster's rows with it, by statements of the runtime's until Cluster has an
operation that forgets a processed request, which [Effect-TS/effect#10239](https://github.com/Effect-TS/effect/issues/10239)
asks ([decision 0090](decisions/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)); an interrupted caller
leaves its request alone ([decision 0091](decisions/0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md));
and the runtime keeps its entities, their passivation, capacity and timers, and learns which shards its runner holds
from a singleton of each: a request is stepped in its handler's fiber, in Cluster's transaction, a step of the entity's
own work checks the shard's lease in its own, a defect from Cluster is no reply, and a resumption tells the senders
that wait for it by a message ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)). One remains:

- **Two versions at once** ([open question](open-questions.md#running)): Cluster's runners carry no version, and a
  shard may go back to an older one.

[Suspended entities](open-questions.md#running) — how an operator sees, resumes and discards them, and who is told
that a sender waits — does not wait on Cluster, and is taken before it if an operator needs it first.

## Later

- Effect Cluster: the runtime on it, as [`docs/cluster.md`](cluster.md) and the notes above decide, with sharding and
  rolling deploys; across machines once Cluster has a fence, or the runtime one of its own
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Before it is done,
  the two interleavings no test reaches are read again: a sender that registers for its receiver's resumption only
  after it is answered `Suspended` ([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)),
  which a resumption told by a message changes
  ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)), and an
  entity's lock dropped while others wait for it
  ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)), which the
  [review of 0061 to 0075](decisions/README.md#reviews) left reasoned. Where the runtime on Cluster makes either
  reachable, it gets a test.
- The library's name, once there is code to publish, and its release, as experimental while it depends on
  Effect's unstable modules ([decision 0099](decisions/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
