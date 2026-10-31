# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

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

The next step is a study of Effect Cluster, before anything of it is designed: every question left before it
waits on which process holds which entities. It reads Cluster's code and documentation, at the version of `effect`
the project pins, and ends in a page of `docs/` that says what Cluster gives, what it leaves to the runtime, and
which decisions it changes. Nothing of `src/` changes in it; what it finds is decided afterwards, each in a note.
It answers:

- **Who holds an entity.** How shards are assigned and locked, how a shard moves, what becomes of an entity loaded
  in memory when its shard leaves, and what keeps a node that lost its lock from writing on. A database is held by
  one runtime through SQLite's lock on one file
  ([decision 0080](decisions/0080-a-database-is-held-by-one-runtime.md)); on a shared store, the shard's lock
  takes its place.
- **One transaction or two.** Cluster's message storage commits apart from the runtime's tables
  ([decision 0007](decisions/0007-one-process-first.md)). Can a step and the acknowledgement of its message be one
  transaction, on one `SqlClient`, or does the state record the last message it handled?
- **What Cluster gives that the runtime already does**: the mailbox; a message delivered at a time (`DeliverAt`),
  beside the stored timers; passivation and the capacity of a node
  ([decision 0029](decisions/0029-an-idle-entity-is-unloaded.md),
  [decision 0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)); requests
  deduplicated, beside the replies stored under a request
  ([decision 0015](decisions/0015-a-request-belongs-to-its-sender.md),
  [decision 0017](decisions/0017-creation-in-the-machine.md)). Each is kept, replaced or adapted.
- **Two versions at once** ([open question](open-questions.md#running)): how a rolling deploy moves shards, and
  whether a shard may go back to a node of an older version, where every row the newer one wrote fails what reads
  it ([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)).

The decisions that left a part of themselves to Cluster are read with it:

- the replies to an entity are deleted by the statement that ends the work that asked; on Cluster the two sit on
  different shards, and the deletion is a message that may arrive before the request it ends
  ([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md));
- a consumer's cursor over the outbox skips nothing only while one transaction writes at a time
  ([decision 0038](decisions/0038-what-happened-is-published-through-an-outbox.md), and
  [the order of what is published](open-questions.md#storage-and-reading));
- an operation waits, in its own process, for a program not deployed yet; in a cluster the receiver's program may
  be deployed by another process, or later in a rolling deploy
  ([decision 0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md));
- each entity's lock, and what other fibers read, are the memory of one process
  ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md),
  [decision 0068](decisions/0068-what-another-fiber-reads-changes-in-one-step.md)), and
  [bookkeeping in transactions](open-questions.md#running) waits for what a node keeps;
- Cluster's modules are unstable, and Effect is pinned to an exact version
  ([decision 0019](decisions/0019-unstable-effect-modules.md)): the study names the version it read.

[Suspended entities](open-questions.md#running) — how an operator sees, resumes and discards them, and who is told
that a sender waits — does not wait on Cluster, and is taken before it if an operator needs it first.

## Later

- Effect Cluster: the runtime on it, as the study above says, with sharding and rolling deploys.
- The library's name, once there is code to publish.
