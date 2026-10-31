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

A review of decisions 0027 to 0039 found five more corrections. The first is made: `reindex` writes a row only
over the state it was computed from ([decision 0070](decisions/0070-reindex-writes-a-row-only-over-its-state.md)).
So is the second: a process starts the entities whose mailbox holds a message
([decision 0071](decisions/0071-a-process-starts-the-entities-with-a-message.md)), and the third: the log shows
what a step changed, as the program deployed computes it
([decision 0072](decisions/0072-the-log-shows-what-a-step-changed.md)). The others come next, in this order:

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
