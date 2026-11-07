# Decisions

Each note decides one thing that rests on a premise that can fall, or that an API, a test or a semantics of the
code keeps. A note made for a step of the roadmap is `proposed`, and rewritten while the step is under way; once
taken it is `accepted`, and never rewritten: a decision that changes is a later note, which the changed one's
status line names. The rules of work have no note: [`AGENTS.md`](../../AGENTS.md) states them, and git keeps what
they were. A number with no note was one of theirs, a record of a move of Effect's version, a note deleted once no
document needed it, which git keeps and its citations sum up, or never used; a number is never given again.

Here every note is listed by what it decides, with the notes that changed each one. A note in [`archive/`](archive)
is one a document says what holds of: [`design.md`](../design.md) for the design, the repository's
[`README.md`](../../README.md) for the project, and [`AGENTS.md`](../../AGENTS.md) for the rules of work; it keeps
its number and its text, and is read for why. The notes not archived come first. The reviews of the notes, with what
each read and found, are in [`reviews.md`](reviews.md).

## Effect Cluster

| Note | Decides | Changed by |
| --- | --- | --- |
| [0081](0081-on-cluster-a-step-commits-with-its-reply.md) | On Cluster, a step commits with its reply | [0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md), [0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md), [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md) | A step commits only where the commit checks the shard | [0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) |
| [0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md) | On Cluster, a request is keyed and answered as on one process | [0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md), [0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), [0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) | On Cluster, a reply is deleted as on one process, and Cluster's rows with it | [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md) | On Cluster, an interrupted caller leaves its request alone |  |
| [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) | On Cluster, the runtime keeps its entities, and learns its shards from a singleton of each | [0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md), [0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md), [0168](0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md), [0170](0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) |
| [0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) | On Cluster, an older version serves no shard once a newer one launches, and a step commits only at the newest version | [0174](0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md) |
| [0160](0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md) | On Cluster, a door answers as text, and a creation the program dies on waits for a fix |  |
| [0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md) | On Cluster, a step settles the machine by the count of the steps that wrote it, and an entity's lock is taken only inside a transaction | [0164](0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md), [0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md), [0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), [0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md) | On Cluster, an entity's shard is its partition, and each deployment serves its shards from a singleton of each |  |
| [0163](0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md) | On Cluster, a reading that waits learns of another runner's commit from the file, read while it waits |  |
| [0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) | On Cluster, a caller sends through the door's client, and is never answered `Full` | [0171](0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md), [0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), [0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md) | On Cluster, an operator resumes and discards through the door's client, each event a request of its own | [0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) | On Cluster, an operation sends through the door's client, and is woken by `Resumed` |  |
| [0168](0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md) | On Cluster, a failure Cluster saved of its own is reset before it is given | [0170](0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) |
| [0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md) | On Cluster, an operation's request ids are kept under its work, and Cluster's rows deleted with it | [0170](0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) |
| [0170](0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) | On Cluster, an operation's client keeps the request's id before it resets a failure Cluster saved |  |
| [0171](0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md) | On Cluster, a caller's rows go once its client has the answer and its time is past |  |
| [0172](0172-on-cluster-the-two-interleavings-of-decision-0104-are-read-again.md) | On Cluster, an operation registers for a resumption before it sends, and two loaders of an entity never wait for its lock at once on SQLite |  |
| [0173](0173-on-cluster-a-reply-cluster-saves-after-its-request-is-gone-is-left.md) | On Cluster, a reply Cluster saves of its own after its request's rows are gone is left |  |
| [0174](0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md) | On Cluster, a runner deploys only the programs its `sharding` names, at the version named |  |

## The project

| Note | Decides | Changed by |
| --- | --- | --- |
| [0007](archive/0007-one-process-first.md) | One process with SQL first, Effect Cluster later | [0080](archive/0080-a-database-is-held-by-one-runtime.md), [0081](0081-on-cluster-a-step-commits-with-its-reply.md), [0157](0157-the-storage-speaks-sqlite-and-postgresql.md) |
| [0019](archive/0019-unstable-effect-modules.md) | The library depends on Effect's unstable modules | [0099](archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md) |
| [0055](archive/0055-the-public-surface-is-what-its-users-use.md) | The public surface is what its users use |  |
| [0080](archive/0080-a-database-is-held-by-one-runtime.md) | A database is held by one runtime | [0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md), [0120](0120-the-runtime-closes-a-sequential-scope-of-its-own.md) |
| [0099](archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md) | A library on unstable modules is released as experimental |  |

## The machine and the program

| Note | Decides | Changed by |
| --- | --- | --- |
| [0002](archive/0002-store-the-state-not-the-messages.md) | Store the state after each message, never replay messages |  |
| [0003](archive/0003-durable-work-derived-from-state.md) | All durable work is derived from the state |  |
| [0013](archive/0013-the-runtime-is-a-pure-machine.md) | The runtime's semantics are a pure machine | [0065](archive/0065-the-machine-holds-no-replies.md) |
| [0014](archive/0014-rules-the-machine-settled.md) | The rules the pure machine settled | [0023](archive/0023-suspended-means-no-reply-yet.md), [0041](archive/0041-a-completion-is-not-discarded.md), [0044](archive/0044-a-firing-is-not-discarded.md), [0064](archive/0064-the-program-is-not-the-machines-state.md), [0124](0124-the-boundary-authenticates-and-update-authorizes.md) |
| [0031](archive/0031-a-state-is-an-object.md) | A state is an object |  |
| [0033](archive/0033-a-program-declares-its-keys.md) | A program declares its keys | [0132](0132-a-key-may-take-a-parameter.md) |
| [0035](archive/0035-one-place-where-a-program-is-declared.md) | One place where a program is declared |  |
| [0037](archive/0037-the-machine-checks-the-declared-keys.md) | The machine checks the declared keys | [0132](0132-a-key-may-take-a-parameter.md) |
| [0057](archive/0057-the-machine-gives-what-is-written.md) | The machine gives what is written |  |
| [0064](archive/0064-the-program-is-not-the-machines-state.md) | The program is not the machine's state, and a fix is a deploy | [0075](archive/0075-a-name-is-deployed-once-in-a-process.md) |
| [0132](0132-a-key-may-take-a-parameter.md) | A key may take a parameter, and an incarnation is drawn from one counter of the entity | [0136](0136-a-key-is-a-name-and-a-parameter-as-data.md) |
| [0136](0136-a-key-is-a-name-and-a-parameter-as-data.md) | A key is a name and a parameter, as data, in every value and row that holds one |  |
| [0133](0133-an-entity-composes-children-as-effect-tea-does.md) | An entity composes children as effect-tea does: a part, placed with `child` or `each`, whose messages, keys, operations and reasons the library wraps | [0155](0155-a-foreach-of-messages-to-children-puts-them-back-once.md) |

## Messages, requests and replies

| Note | Decides | Changed by |
| --- | --- | --- |
| [0004](archive/0004-incarnations-guard-internal-messages.md) | Incarnations guard internal messages | [0132](0132-a-key-may-take-a-parameter.md) |
| [0009](archive/0009-entities-talk-through-operations.md) | Entities talk through operations, as themselves | [0047](archive/0047-a-request-of-an-operation-has-a-name.md), [0060](archive/0060-send-and-create-take-no-key.md), [0131](0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) |
| [0010](archive/0010-a-rejection-may-carry-a-reason.md) | A rejection may carry a reason, an acceptance never carries data | [0023](archive/0023-suspended-means-no-reply-yet.md) |
| [0015](archive/0015-a-request-belongs-to-its-sender.md) | A request belongs to its sender, and work to its entity | [0022](archive/0022-a-new-program-keeps-what-work-started-with.md), [0048](archive/0048-a-callers-request-belongs-to-its-sender.md), [0123](0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md) |
| [0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md) | A reply to an entity is kept while the work that asked is stored | [0057](archive/0057-the-machine-gives-what-is-written.md), [0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md), [0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md) |
| [0023](archive/0023-suspended-means-no-reply-yet.md) | `Suspended` means no reply yet |  |
| [0047](archive/0047-a-request-of-an-operation-has-a-name.md) | A request of an operation has a name | [0059](archive/0059-a-request-is-a-value.md), [0060](archive/0060-send-and-create-take-no-key.md) |
| [0048](archive/0048-a-callers-request-belongs-to-its-sender.md) | A caller's request belongs to its sender | [0059](archive/0059-a-request-is-a-value.md), [0065](archive/0065-the-machine-holds-no-replies.md), [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md), [0124](0124-the-boundary-authenticates-and-update-authorizes.md) |
| [0059](archive/0059-a-request-is-a-value.md) | A request is a value | [0065](archive/0065-the-machine-holds-no-replies.md), [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) |
| [0060](archive/0060-send-and-create-take-no-key.md) | `send` and `create` take no key |  |
| [0065](archive/0065-the-machine-holds-no-replies.md) | The machine holds no replies, and a receive is given the one it asks for | [0157](0157-the-storage-speaks-sqlite-and-postgresql.md) |
| [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) | A reply is keyed by the version that wrote it |  |
| [0124](0124-the-boundary-authenticates-and-update-authorizes.md) | The boundary authenticates, and `update` authorizes |  |
| [0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md) | A caller's reply is kept as long as its boundary says, from the step that answers | [0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) |
| [0131](0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) | A rehearsal runs the entities an operation sends to |  |

## Operations and timers

| Note | Decides | Changed by |
| --- | --- | --- |
| [0005](archive/0005-an-operation-leaves-only-by-completing.md) | An operation leaves the state only through its completion | [0128](0128-an-operation-that-acts-on-nothing-may-be-dropped.md) |
| [0008](archive/0008-delivered-work-is-done.md) | Work that has delivered its message is done | [0041](archive/0041-a-completion-is-not-discarded.md), [0130](0130-a-runner-retries-and-the-state-counts-the-attempts.md) |
| [0011](archive/0011-an-operation-declares-what-a-crash-does.md) | An operation declares what a crash does to it | [0018](archive/0018-operations-are-data.md), [0119](0119-a-planned-stop-drains-the-at-most-once-operations.md), [0123](0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md), [0128](0128-an-operation-that-acts-on-nothing-may-be-dropped.md) |
| [0018](archive/0018-operations-are-data.md) | Operations are data, and their runners never see the state | [0058](archive/0058-work-is-compared-by-what-is-stored.md) |
| [0034](archive/0034-an-operation-answers-the-messages-of-its-runner.md) | An operation answers the messages of its runner |  |
| [0041](archive/0041-a-completion-is-not-discarded.md) | A completion is not discarded | [0044](archive/0044-a-firing-is-not-discarded.md), [0064](archive/0064-the-program-is-not-the-machines-state.md), [0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) |
| [0044](archive/0044-a-firing-is-not-discarded.md) | A timer's firing is not discarded | [0064](archive/0064-the-program-is-not-the-machines-state.md), [0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) |
| [0045](archive/0045-an-operation-waits-for-a-program-not-deployed-yet.md) | An operation waits for a program not deployed yet | [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md) |
| [0046](archive/0046-a-receiver-that-crashes-is-sent-again.md) | A receiver that crashes is sent to again | [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md) |
| [0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md) | Nothing waits for an operation under the permit | [0067](archive/0067-each-entity-is-held-by-its-own-lock.md) |
| [0123](0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md) | An idempotent runner may be given the digest of its key, as its delivery |  |
| [0127](0127-a-live-stream-feeds-its-entities-from-the-boundary.md) | A live stream is no work of a program: the boundary reads it, and sends each item |  |
| [0128](0128-an-operation-that-acts-on-nothing-may-be-dropped.md) | An operation that acts on nothing may be dropped or changed while it runs | [0129](0129-a-droppable-runner-that-sends-does-not-compile.md) |
| [0129](0129-a-droppable-runner-that-sends-does-not-compile.md) | A droppable runner whose services hold `Entities` does not compile |  |
| [0130](0130-a-runner-retries-and-the-state-counts-the-attempts.md) | A runner retries, the state counts the attempts, and a rehearsal fails on an operation that loops |  |

## Creation

| Note | Decides | Changed by |
| --- | --- | --- |
| [0012](archive/0012-creation-is-a-request-of-its-own.md) | Creating an entity is a request of its own | [0049](archive/0049-flags-are-checked-by-their-schema.md), [0060](archive/0060-send-and-create-take-no-key.md), [0124](0124-the-boundary-authenticates-and-update-authorizes.md) |
| [0017](archive/0017-creation-in-the-machine.md) | Creation is part of the machine | [0047](archive/0047-a-request-of-an-operation-has-a-name.md), [0060](archive/0060-send-and-create-take-no-key.md) |
| [0049](archive/0049-flags-are-checked-by-their-schema.md) | Flags are checked by their schema |  |
| [0050](archive/0050-a-creation-is-answered-apart-from-a-message.md) | A creation is answered apart from a message |  |

## Defects

| Note | Decides | Changed by |
| --- | --- | --- |
| [0006](archive/0006-a-defect-suspends-the-entity.md) | A defect suspends the entity | [0046](archive/0046-a-receiver-that-crashes-is-sent-again.md), [0061](archive/0061-only-what-the-program-does-is-its-defect.md), [0113](0113-a-suspended-entitys-operations-run-to-their-end.md), [0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) |
| [0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) | An event the runtime cannot finish crashes its entity | [0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md), [0067](archive/0067-each-entity-is-held-by-its-own-lock.md), [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) |
| [0061](archive/0061-only-what-the-program-does-is-its-defect.md) | Only what the program does is its defect |  |
| [0113](0113-a-suspended-entitys-operations-run-to-their-end.md) | A suspended entity's operations run to their end |  |
| [0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) | An operator sees the suspended entities, and what a resume or a discard did |  |

## Versions and deploys

| Note | Decides | Changed by |
| --- | --- | --- |
| [0020](archive/0020-a-new-program-is-checked-against-the-stored-work.md) | A new program is checked against the work it finds stored | [0064](archive/0064-the-program-is-not-the-machines-state.md) |
| [0022](archive/0022-a-new-program-keeps-what-work-started-with.md) | A new program keeps how its work is delivered, and its name | [0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md) |
| [0036](archive/0036-a-migration-is-a-function-on-the-json.md) | A program carries its migrations, and a migration is a function on the JSON | [0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md), [0058](archive/0058-work-is-compared-by-what-is-stored.md), [0100](archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md), [0126](0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md) |
| [0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md) | A row no version reads fails what reads it, not the process | [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), [0122](0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) |
| [0100](archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md) | A rejection's reason is kept as long as a reply of its version is stored |  |
| [0126](0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md) | A program keeps every migration, and a test records what each did |  |
| [0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md) | A program is renamed by its launch, which moves what is stored under its old name, and its entities keep their keys | [0157](0157-the-storage-speaks-sqlite-and-postgresql.md) |
| [0051](archive/0051-a-deploy-that-fails-leaves-nothing-running.md) | A deploy that fails leaves nothing running | [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md) |
| [0058](archive/0058-work-is-compared-by-what-is-stored.md) | Work is compared by what is stored |  |
| [0075](archive/0075-a-name-is-deployed-once-in-a-process.md) | A name is deployed once in a process | [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) |
| [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md) | A deploy interrupted before it registers undoes itself whole |  |

## Schemas, storage and projections

| Note | Decides | Changed by |
| --- | --- | --- |
| [0121](0121-a-read-answers-from-the-row-of-the-read-model.md) | A read answers from the row of the read model, and calls no `project` | [0122](0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) |
| [0122](0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) | `reindex` leaves a row it cannot compute, and names its entity |  |
| [0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) | A large state is split by the program, and the runtime warns of a large step | [0138](0138-the-log-publishes-topics.md), [0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md) |
| [0137](0137-the-log-is-ordered-within-a-partition.md) | The log is ordered within a partition, and a consumer keeps a cursor per partition | [0138](0138-the-log-publishes-topics.md), [0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md), [0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md) |
| [0138](0138-the-log-publishes-topics.md) | The log publishes topics, and a consumer reads one | [0139](0139-the-projection-is-json.md), [0140](0140-a-row-of-a-topic-gives-its-value.md), [0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md), [0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md) |
| [0139](0139-the-projection-is-json.md) | The projection is JSON, and `project` converts |  |
| [0140](0140-a-row-of-a-topic-gives-its-value.md) | A row of a topic gives the value the topic selects | [0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md) |
| [0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md) | A query and a reading of the log take a limit, and one left out is the caller's defect | [0143](0143-a-query-pages-after-the-last-row-it-gave.md) |
| [0142](0142-a-consumer-waits-for-a-row-of-its-topic.md) | A consumer waits for a row of its topic, woken by the commit that writes it | [0153](0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md), [0163](0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md) |
| [0143](0143-a-query-pages-after-the-last-row-it-gave.md) | A query pages after the last row it gave, by the index it orders by and the id | [0144](0144-a-page-reads-the-rows-before-its-cursor.md), [0145](0145-a-page-is-read-as-ranges-of-its-index.md), [0146](0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md) |
| [0144](0144-a-page-reads-the-rows-before-its-cursor.md) | A page reads the rows of its program before its cursor, and decision 0143 stands on its other reasons | [0145](0145-a-page-is-read-as-ranges-of-its-index.md) |
| [0145](0145-a-page-is-read-as-ranges-of-its-index.md) | A page is read as ranges of an index of the value and the id, and a descending order reverses the ids |  |
| [0146](0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md) | An index that is an integer beyond 2^53 is written with the exact digits of its double |  |
| [0148](0148-a-count-and-a-sum-are-read-in-one-statement.md) | A count and a sum over the entities that match are read in one statement, and a sum that meets no number is its caller's defect |  |
| [0149](0149-the-read-model-answers-what-a-program-acts-on.md) | The read model answers what a program acts on, in three forms, and any other question is a report fed from the log | [0150](0150-a-count-per-value-of-an-index-is-read-in-one-statement.md) |
| [0150](0150-a-count-per-value-of-an-index-is-read-in-one-statement.md) | A count per value of an index is read in one statement, and an ack joins the caller's transaction |  |
| [0151](0151-a-process-holds-ten-thousand-entities-by-default.md) | A process holds ten thousand entities by default |  |
| [0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md) | The consumers of a topic are declared at deploy, and a topic no consumer holds is pruned whole |  |
| [0153](0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md) | A reader of a consumer names the partitions it reads, and the division is the caller's |  |
| [0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md) | A step's projection is stored once in the outbox, in a publication each topic's row names |  |
| [0155](0155-a-foreach-of-messages-to-children-puts-them-back-once.md) | A `forEach` of messages to children by id puts them back once, with the step one message after the other gives |  |
| [0157](0157-the-storage-speaks-sqlite-and-postgresql.md) | The storage speaks SQLite and PostgreSQL, in the same tables, and a query reads alike on both, of text every database holds | [0158](0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md) |
| [0158](0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md) | A database of SQLite made before is given `request_id`, and a page keeps the level of a caller's transaction |  |
| [0025](archive/0025-operations-and-projections-have-schemas.md) | A program gives the schemas of its operations and of its projection | [0058](archive/0058-work-is-compared-by-what-is-stored.md) |
| [0026](archive/0026-the-test-maps-a-projection-to-its-messages.md) | The test says which messages a projection's actions stand for |  |
| [0027](archive/0027-a-program-gives-the-schema-of-its-senders.md) | A program gives the schema of its senders |  |
| [0030](archive/0030-a-schema-encodes-to-json.md) | A schema encodes to what JSON holds | [0098](archive/0098-json-is-effect-s.md) |
| [0032](archive/0032-a-projection-is-a-row.md) | A projection is a row, and a program declares the indexes a query uses | [0070](archive/0070-reindex-writes-a-row-only-over-its-state.md), [0139](0139-the-projection-is-json.md), [0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md), [0143](0143-a-query-pages-after-the-last-row-it-gave.md), [0148](0148-a-count-and-a-sum-are-read-in-one-statement.md) |
| [0038](archive/0038-what-happened-is-published-through-an-outbox.md) | What happened is published through an outbox | [0057](archive/0057-the-machine-gives-what-is-written.md), [0072](archive/0072-the-log-shows-what-a-step-changed.md), [0137](0137-the-log-is-ordered-within-a-partition.md), [0138](0138-the-log-publishes-topics.md) |
| [0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md) | A consumer of the outbox keeps its cursor | [0137](0137-the-log-is-ordered-within-a-partition.md), [0138](0138-the-log-publishes-topics.md), [0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md), [0142](0142-a-consumer-waits-for-a-row-of-its-topic.md), [0150](0150-a-count-per-value-of-an-index-is-read-in-one-statement.md), [0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md) |
| [0040](archive/0040-what-is-stored-encodes-to-json-as-it-is.md) | What is stored encodes to JSON as it is | [0057](archive/0057-the-machine-gives-what-is-written.md) |
| [0062](archive/0062-a-row-is-read-through-a-schema.md) | A row is read through a schema, or not at all | [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) |
| [0070](archive/0070-reindex-writes-a-row-only-over-its-state.md) | `reindex` writes a row only over the state it was computed from |  |
| [0072](archive/0072-the-log-shows-what-a-step-changed.md) | The log shows what a step changed, as the program deployed computes it | [0138](0138-the-log-publishes-topics.md) |
| [0098](archive/0098-json-is-effect-s.md) | `Json` is Effect's |  |

## What enters the library

| Note | Decides | Changed by |
| --- | --- | --- |
| [0052](archive/0052-what-crosses-the-library-is-never-mutated.md) | What crosses the library is never mutated |  |
| [0053](archive/0053-what-a-handle-is-given-is-checked.md) | What a handle is given is checked | [0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md) |
| [0054](archive/0054-a-program-is-checked-where-it-enters.md) | A program is checked where it enters | [0064](archive/0064-the-program-is-not-the-machines-state.md), [0132](0132-a-key-may-take-a-parameter.md), [0136](0136-a-key-is-a-name-and-a-parameter-as-data.md) |

## The runtime

| Note | Decides | Changed by |
| --- | --- | --- |
| [0028](archive/0028-rules-the-runtime-settled.md) | Rules the runtime settled | [0029](archive/0029-an-idle-entity-is-unloaded.md), [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md), [0134](0134-an-entitys-loop-yields-between-two-steps.md) |
| [0029](archive/0029-an-idle-entity-is-unloaded.md) | An idle entity is unloaded, and what is stored wakes it | [0067](archive/0067-each-entity-is-held-by-its-own-lock.md), [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md), [0071](archive/0071-a-process-starts-the-entities-with-a-message.md), [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md), [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md), [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), [0111](archive/0111-an-entity-s-wait-times-out-its-take-alone.md), [0113](0113-a-suspended-entitys-operations-run-to-their-end.md), [0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) |
| [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md) | The runtime waits for what it waits for, and polls nothing | [0163](0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md) |
| [0066](archive/0066-the-runtimes-tests-move-time.md) | The runtime's tests move time, and wait for nothing on a clock | [0101](archive/0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md), [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md), [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) |
| [0067](archive/0067-each-entity-is-held-by-its-own-lock.md) | Each entity is held by its own lock | [0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md) |
| [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md) | What another fiber reads changes in one step | [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) |
| [0071](archive/0071-a-process-starts-the-entities-with-a-message.md) | A process starts the entities whose mailbox holds a message | [0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) |
| [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md) | What the runtime did is told to a probe, out of its options |  |
| [0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) | A message that finds the mailbox empty is handled as it arrives | [0081](0081-on-cluster-a-step-commits-with-its-reply.md), [0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md) |
| [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md) | A process over its capacity unloads the least recently used | [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md), [0109](archive/0109-settled-waits-for-an-entity-unloading.md), [0151](0151-a-process-holds-ten-thousand-entities-by-default.md) |
| [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) | The waker tries an entity it cannot load again, after the retry |  |
| [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) | A timer due is no spare entity, and a registered deploy keeps its name | [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md), [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md), [0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md) |
| [0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md) | What a caller sets going is finished without it | [0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md), [0110](archive/0110-detached-work-is-counted-until-it-ends-however-it-ends.md), [0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md) |
| [0101](archive/0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md) | A moved clock gives a fiber it did not wake one turn | [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) |
| [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md) | A test moves the wall clock ahead of the sleeps |  |
| [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) | The runtime's tests choose where fibers yield, and none runs under budgets | [0115](0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md), [0117](0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) |
| [0109](archive/0109-settled-waits-for-an-entity-unloading.md) | `settled` waits for an entity unloading |  |
| [0110](archive/0110-detached-work-is-counted-until-it-ends-however-it-ends.md) | Detached work is counted until it ends, however it ends |  |
| [0111](archive/0111-an-entity-s-wait-times-out-its-take-alone.md) | An entity's wait times out its take alone | [0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) |
| [0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md) | A fork from a region that cannot be interrupted says it is interruptible |  |
| [0115](0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md) | The scheduler of the tests preempts from a run's third step, where Effect first can | [0117](0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) |
| [0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) | An entity's wait ends with an item of its queue, and nothing races its take | [0117](0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md), [0134](0134-an-entitys-loop-yields-between-two-steps.md) |
| [0117](0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) | A fiber on another's stack yields with no task ready | [0134](0134-an-entitys-loop-yields-between-two-steps.md) |
| [0119](0119-a-planned-stop-drains-the-at-most-once-operations.md) | A planned stop drains the at-most-once operations, and stops the rest at once | [0120](0120-the-runtime-closes-a-sequential-scope-of-its-own.md) |
| [0120](0120-the-runtime-closes-a-sequential-scope-of-its-own.md) | The runtime closes a sequential scope of its own, whatever its caller's |  |
| [0134](0134-an-entitys-loop-yields-between-two-steps.md) | An entity's loop yields after a step that leaves it more to do, so that a busy entity holds no other for more than a step |  |
| [0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md) | An entity holds a bounded number of callers' messages, and a `send` past it is answered `Full` | [0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) |
| [0164](0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md) | Every fork of the runtime drops the transaction, and a count is raised and lowered by one `acquireUseRelease`, as a test reads in the code |  |
