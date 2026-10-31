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

A bug of correctness comes before the last of them: [a sender migrated onto another's
text](open-questions.md#storage-and-reading) lets one caller's request take the reply row of another, whose retry
is then applied again ([decision 0065](decisions/0065-the-machine-holds-no-replies.md)). It is decided next, and
before Effect Cluster brings rolling deploys, since how a reply is keyed bears on renaming a program and on two
versions at once.

A review of decisions 0027 to 0039 found five more corrections, which come after it, in this order:

- **`reindex` writes a row back over a step.** It reads a page of states and then writes each row, outside any
  transaction ([`src/storage.ts`](../src/storage.ts)): a step that commits in between has its row replaced by the
  projection of the state before it, until the entity's next step, which may never come. A query then reads a
  projection the entity has moved past, which [decision 0032](decisions/0032-a-projection-is-a-row.md) says it
  never does, and a deploy that changed the projection runs `reindex` while entities step. A new note replaces the
  consequence of 0032 that accepts it — a row written only if the state it was computed from is still the stored
  one, in one transaction — with a test in [`src/runtime.test.ts`](../src/runtime.test.ts) that interleaves a step
  with `reindex` and fails before the change.
- **A message a crash left in a mailbox is handled by chance.** An inbound message is a `Receive` and a step, two
  transactions; a crash between them leaves it in the mailbox of an entity a process starts only if it holds an
  operation ([decision 0029](decisions/0029-an-idle-entity-is-unloaded.md)). It waits for a caller to load the
  entity, and is then handled at whatever time that is. A note decides the
  [open question](open-questions.md#running) — `interrupted` giving the entities whose mailbox holds a message
  too, a suspended one aside — with a crash test between the two transactions and no retry.
- **A new `project` does not always reach the log.** A step publishes when the projection of the state before it
  differs from the one after, both computed by the program deployed
  ([decision 0038](decisions/0038-what-happened-is-published-through-an-outbox.md)). After a deploy that changes
  what `project` gives, without a schema to migrate, a step whose projection is the same under the new program
  publishes nothing, and the log's last row keeps what the version before showed: the design's "a new `project`
  reaches the log at each entity's next step" holds only for a step that changes it. A note decides whether a
  step compares with what was last published, or the design says what holds.
- **The runtime's options hold the tests' seams.** `at`, `observe` and `unloaded` are in `Options` beside `retry`
  and `passivate` ([decision 0028](decisions/0028-rules-the-runtime-settled.md)), so what an operator sets and what
  a test dies at are one record, and three hooks do one thing: say what the runtime did. `at` and `observe` take a
  `Machine.Event`, so the public surface names a type of the machine, which
  [decision 0055](decisions/0055-the-public-surface-is-what-its-users-use.md) keeps out of it and lets change
  without a note, and every call casts the event to `Event<never>`. A note decides one seam for all three, out of
  `Options` and out of `index.ts` — a probe the tests provide with a default that does nothing, as Effect's own
  tracer is — and the options keep what an operator sets.
- **A note changed after it was taken.** Decisions 0029, 0032, 0037 and 0038 were edited by later commits, and
  0032's edit is what accepts the first bug above. [`AGENTS.md`](../AGENTS.md) says a note is never rewritten:
  it says too when a note counts as taken, so that a correction found later is a note of its own.

The cost question left after it is [a mailbox under a burst](open-questions.md#storage-and-reading): a machine holds only its state, its
keys and its mailbox ([decision 0065](decisions/0065-the-machine-holds-no-replies.md)), and an event writes only
what it changed ([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)).

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
