# Decisions

Each note decides one thing. A note made for a step of the roadmap is `proposed`, and rewritten while the step is
under way; once taken it is `accepted`, and never rewritten: a decision that changes is a later note, which the
changed one's status line names. Here the notes are listed by what they decide, with the notes that changed
each one; [`design.md`](../design.md) says what holds now. The rules are in [`AGENTS.md`](../../AGENTS.md), and
[decision 0089](0089-a-note-says-what-changed-it-and-is-taken-with-its-step.md) says why.

## The project

| Note | Decides | Changed by |
| --- | --- | --- |
| [0001](0001-separate-from-effect-tea.md) | A library of its own, separate from effect-tea |  |
| [0007](0007-one-process-first.md) | One process with SQL first, Effect Cluster later | [0080](0080-a-database-is-held-by-one-runtime.md), [0081](0081-on-cluster-a-step-commits-with-its-reply.md) |
| [0019](0019-unstable-effect-modules.md) | The library depends on Effect's unstable modules | [0083](0083-effect-moves-to-4-1-1.md), [0099](0099-a-library-on-unstable-modules-is-released-as-experimental.md) |
| [0055](0055-the-public-surface-is-what-its-users-use.md) | The public surface is what its users use |  |
| [0080](0080-a-database-is-held-by-one-runtime.md) | A database is held by one runtime | [0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md) |
| [0083](0083-effect-moves-to-4-1-1.md) | Effect moves to 4.1.1 |  |
| [0089](0089-a-note-says-what-changed-it-and-is-taken-with-its-step.md) | A note says what changed it, and is taken with its step |  |
| [0093](0093-a-note-says-what-each-premise-rests-on.md) | A note says what each premise rests on | [0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) |
| [0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md) | The notes are reviewed every fifteen, by a reader that did not write them | [0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) |
| [0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) | A dependency is checked by a spike the repository keeps, and the older notes are reviewed |  |
| [0099](0099-a-library-on-unstable-modules-is-released-as-experimental.md) | A library on unstable modules is released as experimental |  |
| [0024](0024-not-taken.md) | Not taken |  |

## The machine and the program

| Note | Decides | Changed by |
| --- | --- | --- |
| [0002](0002-store-the-state-not-the-messages.md) | Store the state after each message, never replay messages |  |
| [0003](0003-durable-work-derived-from-state.md) | All durable work is derived from the state |  |
| [0013](0013-the-runtime-is-a-pure-machine.md) | The runtime's semantics are a pure machine | [0065](0065-the-machine-holds-no-replies.md) |
| [0014](0014-rules-the-machine-settled.md) | The rules the pure machine settled | [0023](0023-suspended-means-no-reply-yet.md), [0041](0041-a-completion-is-not-discarded.md), [0044](0044-a-firing-is-not-discarded.md), [0064](0064-the-program-is-not-the-machines-state.md) |
| [0031](0031-a-state-is-an-object.md) | A state is an object |  |
| [0033](0033-a-program-declares-its-keys.md) | A program declares its keys |  |
| [0035](0035-one-place-where-a-program-is-declared.md) | One place where a program is declared |  |
| [0037](0037-the-machine-checks-the-declared-keys.md) | The machine checks the declared keys |  |
| [0057](0057-the-machine-gives-what-is-written.md) | The machine gives what is written |  |
| [0064](0064-the-program-is-not-the-machines-state.md) | The program is not the machine's state, and a fix is a deploy |  |

## Messages, requests and replies

| Note | Decides | Changed by |
| --- | --- | --- |
| [0004](0004-incarnations-guard-internal-messages.md) | Incarnations guard internal messages |  |
| [0009](0009-entities-talk-through-operations.md) | Entities talk through operations, as themselves | [0047](0047-a-request-of-an-operation-has-a-name.md), [0060](0060-send-and-create-take-no-key.md) |
| [0010](0010-a-rejection-may-carry-a-reason.md) | A rejection may carry a reason, an acceptance never carries data | [0023](0023-suspended-means-no-reply-yet.md) |
| [0015](0015-a-request-belongs-to-its-sender.md) | A request belongs to its sender, and work to its entity | [0022](0022-a-new-program-keeps-what-work-started-with.md), [0048](0048-a-callers-request-belongs-to-its-sender.md) |
| [0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md) | A reply to an entity is kept while the work that asked is stored | [0057](0057-the-machine-gives-what-is-written.md), [0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) |
| [0023](0023-suspended-means-no-reply-yet.md) | `Suspended` means no reply yet |  |
| [0047](0047-a-request-of-an-operation-has-a-name.md) | A request of an operation has a name |  |
| [0048](0048-a-callers-request-belongs-to-its-sender.md) | A caller's request belongs to its sender |  |
| [0059](0059-a-request-is-a-value.md) | A request is a value |  |
| [0060](0060-send-and-create-take-no-key.md) | `send` and `create` take no key |  |
| [0065](0065-the-machine-holds-no-replies.md) | The machine holds no replies, and a receive is given the one it asks for |  |
| [0069](0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) | A reply is keyed by the version that wrote it |  |

## Operations and timers

| Note | Decides | Changed by |
| --- | --- | --- |
| [0005](0005-an-operation-leaves-only-by-completing.md) | An operation leaves the state only through its completion |  |
| [0008](0008-delivered-work-is-done.md) | Work that has delivered its message is done | [0041](0041-a-completion-is-not-discarded.md) |
| [0011](0011-an-operation-declares-what-a-crash-does.md) | An operation declares what a crash does to it | [0018](0018-operations-are-data.md) |
| [0016](0016-work-is-what-it-was-started-with.md) | Work under a kept key is the work that started | superseded by [0018](0018-operations-are-data.md) |
| [0018](0018-operations-are-data.md) | Operations are data, and their runners never see the state | [0058](0058-work-is-compared-by-what-is-stored.md) |
| [0034](0034-an-operation-answers-the-messages-of-its-runner.md) | An operation answers the messages of its runner |  |
| [0041](0041-a-completion-is-not-discarded.md) | A completion is not discarded | [0044](0044-a-firing-is-not-discarded.md) |
| [0044](0044-a-firing-is-not-discarded.md) | A timer's firing is not discarded |  |
| [0045](0045-an-operation-waits-for-a-program-not-deployed-yet.md) | An operation waits for a program not deployed yet | [0063](0063-the-runtime-waits-for-what-it-waits-for.md) |
| [0046](0046-a-receiver-that-crashes-is-sent-again.md) | A receiver that crashes is sent to again |  |
| [0056](0056-nothing-waits-for-an-operation-under-the-permit.md) | Nothing waits for an operation under the permit |  |

## Creation

| Note | Decides | Changed by |
| --- | --- | --- |
| [0012](0012-creation-is-a-request-of-its-own.md) | Creating an entity is a request of its own | [0049](0049-flags-are-checked-by-their-schema.md), [0060](0060-send-and-create-take-no-key.md) |
| [0017](0017-creation-in-the-machine.md) | Creation is part of the machine | [0047](0047-a-request-of-an-operation-has-a-name.md), [0060](0060-send-and-create-take-no-key.md) |
| [0049](0049-flags-are-checked-by-their-schema.md) | Flags are checked by their schema |  |
| [0050](0050-a-creation-is-answered-apart-from-a-message.md) | A creation is answered apart from a message |  |

## Defects

| Note | Decides | Changed by |
| --- | --- | --- |
| [0006](0006-a-defect-suspends-the-entity.md) | A defect suspends the entity | [0046](0046-a-receiver-that-crashes-is-sent-again.md), [0061](0061-only-what-the-program-does-is-its-defect.md) |
| [0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) | An event the runtime cannot finish crashes its entity | [0067](0067-each-entity-is-held-by-its-own-lock.md) |
| [0061](0061-only-what-the-program-does-is-its-defect.md) | Only what the program does is its defect |  |

## Versions and deploys

| Note | Decides | Changed by |
| --- | --- | --- |
| [0020](0020-a-new-program-is-checked-against-the-stored-work.md) | A new program is checked against the work it finds stored | [0064](0064-the-program-is-not-the-machines-state.md) |
| [0022](0022-a-new-program-keeps-what-work-started-with.md) | A new program keeps how its work is delivered, and its name |  |
| [0036](0036-a-migration-is-a-function-on-the-json.md) | A program carries its migrations, and a migration is a function on the JSON | [0043](0043-a-row-no-version-reads-fails-what-reads-it.md) |
| [0043](0043-a-row-no-version-reads-fails-what-reads-it.md) | A row no version reads fails what reads it, not the process |  |
| [0051](0051-a-deploy-that-fails-leaves-nothing-running.md) | A deploy that fails leaves nothing running |  |
| [0058](0058-work-is-compared-by-what-is-stored.md) | Work is compared by what is stored |  |
| [0075](0075-a-name-is-deployed-once-in-a-process.md) | A name is deployed once in a process | [0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) |

## Schemas, storage and projections

| Note | Decides | Changed by |
| --- | --- | --- |
| [0025](0025-operations-and-projections-have-schemas.md) | A program gives the schemas of its operations and of its projection | [0058](0058-work-is-compared-by-what-is-stored.md) |
| [0026](0026-the-test-maps-a-projection-to-its-messages.md) | The test says which messages a projection's actions stand for |  |
| [0027](0027-a-program-gives-the-schema-of-its-senders.md) | A program gives the schema of its senders |  |
| [0030](0030-a-schema-encodes-to-json.md) | A schema encodes to what JSON holds | [0098](0098-json-is-effect-s.md) |
| [0032](0032-a-projection-is-a-row.md) | A projection is a row, and a program declares the indexes a query uses | [0070](0070-reindex-writes-a-row-only-over-its-state.md) |
| [0038](0038-what-happened-is-published-through-an-outbox.md) | What happened is published through an outbox | [0072](0072-the-log-shows-what-a-step-changed.md) |
| [0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md) | A consumer of the outbox keeps its cursor |  |
| [0040](0040-what-is-stored-encodes-to-json-as-it-is.md) | What is stored encodes to JSON as it is |  |
| [0062](0062-a-row-is-read-through-a-schema.md) | A row is read through a schema, or not at all |  |
| [0070](0070-reindex-writes-a-row-only-over-its-state.md) | `reindex` writes a row only over the state it was computed from |  |
| [0072](0072-the-log-shows-what-a-step-changed.md) | The log shows what a step changed, as the program deployed computes it |  |
| [0098](0098-json-is-effect-s.md) | `Json` is Effect's |  |

## What enters the library

| Note | Decides | Changed by |
| --- | --- | --- |
| [0052](0052-what-crosses-the-library-is-never-mutated.md) | What crosses the library is never mutated |  |
| [0053](0053-what-a-handle-is-given-is-checked.md) | What a handle is given is checked |  |
| [0054](0054-a-program-is-checked-where-it-enters.md) | A program is checked where it enters |  |

## The runtime

| Note | Decides | Changed by |
| --- | --- | --- |
| [0028](0028-rules-the-runtime-settled.md) | Rules the runtime settled | [0029](0029-an-idle-entity-is-unloaded.md), [0063](0063-the-runtime-waits-for-what-it-waits-for.md), [0073](0073-what-the-runtime-did-is-told-to-a-probe.md) |
| [0029](0029-an-idle-entity-is-unloaded.md) | An idle entity is unloaded, and what is stored wakes it | [0067](0067-each-entity-is-held-by-its-own-lock.md), [0068](0068-what-another-fiber-reads-changes-in-one-step.md), [0071](0071-a-process-starts-the-entities-with-a-message.md), [0073](0073-what-the-runtime-did-is-told-to-a-probe.md), [0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md), [0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md) |
| [0063](0063-the-runtime-waits-for-what-it-waits-for.md) | The runtime waits for what it waits for, and polls nothing |  |
| [0066](0066-the-runtimes-tests-move-time.md) | The runtime's tests move time, and wait for nothing on a clock |  |
| [0067](0067-each-entity-is-held-by-its-own-lock.md) | Each entity is held by its own lock | [0079](0079-what-a-caller-sets-going-is-finished-without-it.md) |
| [0068](0068-what-another-fiber-reads-changes-in-one-step.md) | What another fiber reads changes in one step |  |
| [0071](0071-a-process-starts-the-entities-with-a-message.md) | A process starts the entities whose mailbox holds a message |  |
| [0073](0073-what-the-runtime-did-is-told-to-a-probe.md) | What the runtime did is told to a probe, out of its options |  |
| [0074](0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) | A message that finds the mailbox empty is handled as it arrives | [0081](0081-on-cluster-a-step-commits-with-its-reply.md) |
| [0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md) | A process over its capacity unloads the least recently used | [0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) |
| [0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md) | The waker tries an entity it cannot load again, after the retry |  |
| [0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) | A timer due is no spare entity, and a registered deploy keeps its name |  |
| [0079](0079-what-a-caller-sets-going-is-finished-without-it.md) | What a caller sets going is finished without it | [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |

## Effect Cluster

| Note | Decides | Changed by |
| --- | --- | --- |
| [0081](0081-on-cluster-a-step-commits-with-its-reply.md) | On Cluster, a step commits with its reply | [0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md), [0087](0087-on-cluster-what-is-not-a-reply-is-handled-again.md), [0088](0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md), [0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md), [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md) | What 0081 saw of a defect is not Cluster's contract | [0083](0083-effect-moves-to-4-1-1.md), [0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md) |
| [0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md) | A step commits only where the commit checks the shard |  |
| [0085](0085-on-cluster-a-request-is-keyed-as-the-machine-keys-it.md) | On Cluster, a request is keyed as the machine keys it | [0086](0086-on-cluster-a-request-is-keyed-by-its-version-too.md) |
| [0086](0086-on-cluster-a-request-is-keyed-by-its-version-too.md) | On Cluster, a request is keyed by its version too | [0087](0087-on-cluster-what-is-not-a-reply-is-handled-again.md) |
| [0087](0087-on-cluster-what-is-not-a-reply-is-handled-again.md) | On Cluster, what is not a reply is handled again | [0088](0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md) |
| [0088](0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md) | On Cluster, the message an entity dies on stays in its mailbox |  |
| [0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) | On Cluster, a reply is deleted as on one process, and Cluster's rows with it | [0096](0096-cluster-stores-an-answer-no-step-gave-for-a-type-not-registered.md), [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md) | On Cluster, an interrupted caller leaves its request alone | [0096](0096-cluster-stores-an-answer-no-step-gave-for-a-type-not-registered.md) |
| [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) | On Cluster, the runtime keeps its entities, and learns its shards from a singleton of each |  |
| [0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md) | Cluster restarts an entity after a defect, whatever its policy |  |
| [0096](0096-cluster-stores-an-answer-no-step-gave-for-a-type-not-registered.md) | Cluster stores an answer no step gave, for a type not registered | [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |

## Reviews

Each review of the notes, as [decision 0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md)
has them made: the notes it read, and what it found.

| Date | Read | Found |
| --- | --- | --- |
| 2026-10-31 | 0080 to 0091, and 0092 (proposed) | [0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md): a `defectRetryPolicy` that gives up does not end Cluster's retry; [0096](0096-cluster-stores-an-answer-no-step-gave-for-a-type-not-registered.md): Cluster stores a defect no step gave for a type not registered, and 0090 keeps no id for it. Of 0092, for its step: a receiver's defect is not saved, and the id of a request answered with Cluster's defect has to be kept. Not checked: 0080's hold of a database not in WAL mode, which no test runs. |
| 2026-10-31 | 0001 to 0015, the first lot of the backlog | Fixed: the status lines of [0006](0006-a-defect-suspends-the-entity.md), [0009](0009-entities-talk-through-operations.md), [0012](0012-creation-is-a-request-of-its-own.md) and [0013](0013-the-runtime-is-a-pure-machine.md) did not say that [0061](0061-only-what-the-program-does-is-its-defect.md) and [0046](0046-a-receiver-that-crashes-is-sent-again.md), [0047](0047-a-request-of-an-operation-has-a-name.md) and [0060](0060-send-and-create-take-no-key.md), and [0065](0065-the-machine-holds-no-replies.md) changed them. Seen in spikes: a transaction is stored whole or not at all, when it fails, is interrupted, or its process is killed (`spikes/sqlite-transaction.test.ts`, for 0002, 0007, 0013); a workflow replays its body past a signal, which takes one value (`spikes/workflow-replays-its-body.test.ts`, for 0007). Read in the source only: Workflow has no mailbox into a workflow, its `DurableQueue` being one out of it. Tested: each rule of 0004, 0005, 0008 and 0014 that the machine keeps fails a test of `src/machine.test.ts` once taken out. Open: [a planned stop](../open-questions.md#running), which 0011 asks of the runtime and nothing does. Reasoned, and left so: what 0002, 0007 and 0011 say of systems they rejected (Akka Persistence, services with no idempotency keys). |
| 2026-10-31 | 0016 to 0030, the second lot of the backlog; 0016, which [0018](0018-operations-are-data.md) superseded, and 0024, which decides nothing, are skipped | [0098](0098-json-is-effect-s.md): Effect has a `Json` type, which [0030](0030-a-schema-encodes-to-json.md) said it had not; the library uses it, and `src/program.test.ts` has the compiler refuse a schema that encodes to a `DateTime.Utc`. Fixed: the status lines of [0017](0017-creation-in-the-machine.md), [0018](0018-operations-are-data.md), [0020](0020-a-new-program-is-checked-against-the-stored-work.md), [0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md), [0025](0025-operations-and-projections-have-schemas.md), [0028](0028-rules-the-runtime-settled.md) and [0029](0029-an-idle-entity-is-unloaded.md) did not say that [0047](0047-a-request-of-an-operation-has-a-name.md) and [0060](0060-send-and-create-take-no-key.md), [0058](0058-work-is-compared-by-what-is-stored.md), [0064](0064-the-program-is-not-the-machines-state.md), [0057](0057-the-machine-gives-what-is-written.md), 0058 again, 0029, and [0068](0068-what-another-fiber-reads-changes-in-one-step.md), [0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md) and [0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md) changed them; nor did [0014](0014-rules-the-machine-settled.md)'s, of the first lot, say that 0064 did. Seen in a spike: a take that a timeout interrupts loses no item offered as it runs out (`spikes/effect-queue-take-timeout.test.ts`, for 0029's wait). Documented at 4.1.1: `effect/sql`, `effect/cluster` and `effect/workflow` are `@stability unstable` (0019); `Schema.DateTimeUtc` declares a `DateTime.Utc` (0028, 0030). Tested: each rule of 0017, 0018, 0020, 0021, 0022 and 0023 that the machine keeps fails a test of `src/machine.test.ts` once taken out; the deletions of 0021 are `src/storage.test.ts`'s; 0029's readings of the timers due in batches are a test of `src/runtime.test.ts` over 600 entities. Not checked, being replaced: what 0018 and 0025 say of `Equal.equals`. Decided with the author: whether a published library may depend on unstable modules, which 0019 asked again at its naming and no open question held, by [0099](0099-a-library-on-unstable-modules-is-released-as-experimental.md). Reasoned, and left so: what 0026 takes from effect-tea's `dispatchViolations`, and 0019's that an API that changes costs an update of the runtime alone. |
