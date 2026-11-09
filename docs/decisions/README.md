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
| [0081](archive/0081-on-cluster-a-step-commits-with-its-reply.md) | On Cluster, a step commits with its reply | [0085](archive/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md), [0091](archive/0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md), [0092](archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0084](archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md) | A step commits only where the commit checks the shard | [0159](archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) |
| [0085](archive/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md) | On Cluster, a request is keyed and answered as on one process | [0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md), [0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0090](archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) | On Cluster, a reply is deleted as on one process, and Cluster's rows with it | [0092](archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) |
| [0091](archive/0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md) | On Cluster, an interrupted caller leaves its request alone |  |
| [0092](archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) | On Cluster, the runtime keeps its entities, and learns its shards from a singleton of each | [0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md), [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md), [0168](archive/0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md), [0170](archive/0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md), [0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md) |
| [0159](archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) | On Cluster, an older version serves no shard once a newer one launches, and a step commits only at the newest version | [0174](archive/0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md), [0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md), [0176](archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md) |
| [0160](archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md) | On Cluster, a door answers as text, and a creation the program dies on waits for a fix |  |
| [0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md) | On Cluster, a step settles the machine by the count of the steps that wrote it, and an entity's lock is taken only inside a transaction | [0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md), [0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md), [0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md), [0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) |
| [0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md) | On Cluster, an entity's shard is its partition, and each deployment serves its shards from a singleton of each |  |
| [0163](archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md) | On Cluster, a reading that waits learns of another runner's commit from the file, read while it waits |  |
| [0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) | On Cluster, a caller sends through the door's client, and is never answered `Full` | [0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md), [0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md), [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md) | On Cluster, an operator resumes and discards through the door's client, each event a request of its own | [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) |
| [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) | On Cluster, an operation sends through the door's client, and is woken by `Resumed` |  |
| [0168](archive/0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md) | On Cluster, a failure Cluster saved of its own is reset before it is given | [0170](archive/0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) |
| [0169](archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md) | On Cluster, an operation's request ids are kept under its work, and Cluster's rows deleted with it | [0170](archive/0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) |
| [0170](archive/0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md) | On Cluster, an operation's client keeps the request's id before it resets a failure Cluster saved |  |
| [0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md) | On Cluster, a caller's rows go once its client has the answer and its time is past |  |
| [0172](archive/0172-on-cluster-the-two-interleavings-of-decision-0104-are-read-again.md) | On Cluster, an operation registers for a resumption before it sends, and two loaders of an entity never wait for its lock at once on SQLite |  |
| [0173](archive/0173-on-cluster-a-reply-cluster-saves-after-its-request-is-gone-is-left.md) | On Cluster, a reply Cluster saves of its own after its request's rows are gone is left |  |
| [0174](archive/0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md) | On Cluster, a runner deploys only the programs its `sharding` names, at the version named |  |
| [0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md) | On Cluster, every step checks the newest version and the shard's lease, a door's, the loop's and an activation's | [0176](archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md) |
| [0176](archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md) | On Cluster, a rename marks the old name, which no runner steps again, and keeps a door under it that delivers to the new program | [0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) |
| [0178](archive/0178-a-server-of-the-orders-on-cluster-is-run-as-a-process.md) | A server of the orders on Cluster is run as a process, on one runner and then on two |  |

## The project

| Note | Decides | Changed by |
| --- | --- | --- |
| [0007](archive/0007-one-process-first.md) | One process with SQL first, Effect Cluster later | [0080](archive/0080-a-database-is-held-by-one-runtime.md), [0081](archive/0081-on-cluster-a-step-commits-with-its-reply.md), [0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) |
| [0019](archive/0019-unstable-effect-modules.md) | The library depends on Effect's unstable modules | [0099](archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md) |
| [0055](archive/0055-the-public-surface-is-what-its-users-use.md) | The public surface is what its users use | [0191](0191-a-launch-creates-the-tables.md), [0193](0193-the-public-surface-is-four-entries.md) |
| [0080](archive/0080-a-database-is-held-by-one-runtime.md) | A database is held by one runtime | [0084](archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md), [0120](archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md) |
| [0099](archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md) | A library on unstable modules is released as experimental |  |
| [0193](0193-the-public-surface-is-four-entries.md) | The public surface is four entries: the main one, a program's module, a test's and a launcher's on Cluster |  |
| [0195](0195-the-package-is-effect-tea-persistent.md) | The package is `@fgaudo/effect-tea-persistent`, a program's work is `work`, a reader fetches, and `deploy` stays |  |
| [0196](0196-the-quick-start-is-an-example-the-readme-shows-whole.md) | The quick start is an example that the README shows whole, and a test keeps the two equal |  |
| [0203](0203-the-guides-code-is-found-in-the-examples.md) | The guide's code is found in the examples, part by part, and a test finds it |  |
| [0212](0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md) | The property tests of the fixtures derive their values from the programs' schemas, on Effect's engine |  |

## The machine and the program

| Note | Decides | Changed by |
| --- | --- | --- |
| [0002](archive/0002-store-the-state-not-the-messages.md) | Store the state after each message, never replay messages |  |
| [0003](archive/0003-durable-work-derived-from-state.md) | All durable work is derived from the state | [0195](0195-the-package-is-effect-tea-persistent.md) |
| [0013](archive/0013-the-runtime-is-a-pure-machine.md) | The runtime's semantics are a pure machine | [0065](archive/0065-the-machine-holds-no-replies.md) |
| [0014](archive/0014-rules-the-machine-settled.md) | The rules the pure machine settled | [0023](archive/0023-suspended-means-no-reply-yet.md), [0041](archive/0041-a-completion-is-not-discarded.md), [0044](archive/0044-a-firing-is-not-discarded.md), [0064](archive/0064-the-program-is-not-the-machines-state.md), [0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md), [0187](0187-a-rehearsal-moves-time-by-a-duration.md) |
| [0031](archive/0031-a-state-is-an-object.md) | A state is an object |  |
| [0033](archive/0033-a-program-declares-its-keys.md) | A program declares its keys | [0132](archive/0132-a-key-may-take-a-parameter.md) |
| [0035](archive/0035-one-place-where-a-program-is-declared.md) | One place where a program is declared | [0180](0180-a-program-leaves-out-what-it-does-not-have.md) |
| [0037](archive/0037-the-machine-checks-the-declared-keys.md) | The machine checks the declared keys | [0132](archive/0132-a-key-may-take-a-parameter.md) |
| [0057](archive/0057-the-machine-gives-what-is-written.md) | The machine gives what is written |  |
| [0064](archive/0064-the-program-is-not-the-machines-state.md) | The program is not the machine's state, and a fix is a deploy | [0075](archive/0075-a-name-is-deployed-once-in-a-process.md) |
| [0132](archive/0132-a-key-may-take-a-parameter.md) | A key may take a parameter, and an incarnation is drawn from one counter of the entity | [0136](archive/0136-a-key-is-a-name-and-a-parameter-as-data.md), [0197](0197-a-program-lists-its-keys-and-key-gives-one-a-parameter.md) |
| [0136](archive/0136-a-key-is-a-name-and-a-parameter-as-data.md) | A key is a name and a parameter, as data, in every value and row that holds one |  |
| [0133](archive/0133-an-entity-composes-children-as-effect-tea-does.md) | An entity composes children as effect-tea does: a part, placed with `child` or `each`, whose messages, keys, operations and reasons the library wraps | [0155](archive/0155-a-foreach-of-messages-to-children-puts-them-back-once.md) |
| [0180](0180-a-program-leaves-out-what-it-does-not-have.md) | A program leaves out what it does not have, and each piece left out is empty | [0197](0197-a-program-lists-its-keys-and-key-gives-one-a-parameter.md), [0202](0202-update-is-left-out-where-there-is-no-own-message.md) |
| [0197](0197-a-program-lists-its-keys-and-key-gives-one-a-parameter.md) | A program lists its keys, and `key` gives one a parameter | [0199](0199-a-list-of-keys-names-each-key-by-a-literal-type.md) |
| [0199](0199-a-list-of-keys-names-each-key-by-a-literal-type.md) | A list of keys names each key by a literal type, and a list typed `string[]` does not compile |  |
| [0202](0202-update-is-left-out-where-there-is-no-own-message.md) | `update` may be left out exactly where there is no own message, and leaves the state as it is |  |

## Messages, requests and replies

| Note | Decides | Changed by |
| --- | --- | --- |
| [0004](archive/0004-incarnations-guard-internal-messages.md) | Incarnations guard internal messages | [0132](archive/0132-a-key-may-take-a-parameter.md) |
| [0009](archive/0009-entities-talk-through-operations.md) | Entities talk through operations, as themselves | [0047](archive/0047-a-request-of-an-operation-has-a-name.md), [0060](archive/0060-send-and-create-take-no-key.md), [0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) |
| [0010](archive/0010-a-rejection-may-carry-a-reason.md) | A rejection may carry a reason, an acceptance never carries data | [0023](archive/0023-suspended-means-no-reply-yet.md), [0201](0201-rejectwith-keeps-the-literal-of-its-reason.md) |
| [0015](archive/0015-a-request-belongs-to-its-sender.md) | A request belongs to its sender, and work to its entity | [0022](archive/0022-a-new-program-keeps-what-work-started-with.md), [0048](archive/0048-a-callers-request-belongs-to-its-sender.md), [0123](archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md) |
| [0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md) | A reply to an entity is kept while the work that asked is stored | [0057](archive/0057-the-machine-gives-what-is-written.md), [0090](archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md), [0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md) |
| [0023](archive/0023-suspended-means-no-reply-yet.md) | `Suspended` means no reply yet |  |
| [0047](archive/0047-a-request-of-an-operation-has-a-name.md) | A request of an operation has a name | [0059](archive/0059-a-request-is-a-value.md), [0060](archive/0060-send-and-create-take-no-key.md) |
| [0048](archive/0048-a-callers-request-belongs-to-its-sender.md) | A caller's request belongs to its sender | [0059](archive/0059-a-request-is-a-value.md), [0065](archive/0065-the-machine-holds-no-replies.md), [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md), [0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md) |
| [0059](archive/0059-a-request-is-a-value.md) | A request is a value | [0065](archive/0065-the-machine-holds-no-replies.md), [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) |
| [0060](archive/0060-send-and-create-take-no-key.md) | `send` and `create` take no key |  |
| [0065](archive/0065-the-machine-holds-no-replies.md) | The machine holds no replies, and a receive is given the one it asks for | [0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) |
| [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) | A reply is keyed by the version that wrote it |  |
| [0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md) | The boundary authenticates, and `update` authorizes | [0182](0182-init-may-reject-the-flags.md) |
| [0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md) | A caller's reply is kept as long as its boundary says, from the step that answers | [0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) |
| [0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) | A rehearsal runs the entities an operation sends to | [0183](0183-a-receiver-is-named-by-a-reference.md), [0186](0186-a-rehearsal-names-the-work-by-its-key.md), [0187](0187-a-rehearsal-moves-time-by-a-duration.md), [0189](0189-a-world-asks-a-run-for-every-service-of-its-program.md), [0200](0200-a-rehearsal-sends-under-a-request-id-the-test-names.md), [0211](0211-a-rehearsal-gives-the-projection-as-a-caller-reads-it.md) |
| [0183](0183-a-receiver-is-named-by-a-reference.md) | A receiver is named by a reference, which carries its program's name and types and none of its code |  |
| [0186](0186-a-rehearsal-names-the-work-by-its-key.md) | A rehearsal names the work by its key, and `underWay` gives it or null |  |
| [0187](0187-a-rehearsal-moves-time-by-a-duration.md) | A rehearsal moves time by a duration with `advance`, and fires the timers due within it |  |
| [0188](0188-typesof-gives-a-programs-types.md) | `TypesOf` gives a program's types, of the program or of a reference to it |  |
| [0189](0189-a-world-asks-a-run-for-every-service-of-its-program.md) | A world asks a run for every service of its program, and a test mocks the ones it does not run |  |
| [0190](0190-a-boundary-maps-each-answer-to-its-protocol.md) | A boundary maps each answer to its protocol, with one entry for each tag |  |
| [0200](0200-a-rehearsal-sends-under-a-request-id-the-test-names.md) | A rehearsal sends under a request id the test names, and a retry is given the stored reply |  |
| [0201](0201-rejectwith-keeps-the-literal-of-its-reason.md) | `rejectWith` keeps the literal of its reason, with a `const` type parameter |  |
| [0211](0211-a-rehearsal-gives-the-projection-as-a-caller-reads-it.md) | A rehearsal gives the projection as a caller reads it, decoded from its JSON |  |

## Operations and timers

| Note | Decides | Changed by |
| --- | --- | --- |
| [0005](archive/0005-an-operation-leaves-only-by-completing.md) | An operation leaves the state only through its completion | [0128](archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md) |
| [0008](archive/0008-delivered-work-is-done.md) | Work that has delivered its message is done | [0041](archive/0041-a-completion-is-not-discarded.md), [0130](archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md) |
| [0011](archive/0011-an-operation-declares-what-a-crash-does.md) | An operation declares what a crash does to it | [0018](archive/0018-operations-are-data.md), [0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md), [0123](archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md), [0128](archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md) |
| [0018](archive/0018-operations-are-data.md) | Operations are data, and their runners never see the state | [0058](archive/0058-work-is-compared-by-what-is-stored.md) |
| [0034](archive/0034-an-operation-answers-the-messages-of-its-runner.md) | An operation answers the messages of its runner |  |
| [0041](archive/0041-a-completion-is-not-discarded.md) | A completion is not discarded | [0044](archive/0044-a-firing-is-not-discarded.md), [0064](archive/0064-the-program-is-not-the-machines-state.md), [0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) |
| [0044](archive/0044-a-firing-is-not-discarded.md) | A timer's firing is not discarded | [0064](archive/0064-the-program-is-not-the-machines-state.md), [0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) |
| [0045](archive/0045-an-operation-waits-for-a-program-not-deployed-yet.md) | An operation waits for a program not deployed yet | [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md) |
| [0046](archive/0046-a-receiver-that-crashes-is-sent-again.md) | A receiver that crashes is sent to again | [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0147](archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md) |
| [0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md) | Nothing waits for an operation under the permit | [0067](archive/0067-each-entity-is-held-by-its-own-lock.md) |
| [0123](archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md) | An idempotent runner may be given the digest of its key, as its delivery | [0192](0192-the-digest-of-a-key-is-computed-by-the-machine.md) |
| [0192](0192-the-digest-of-a-key-is-computed-by-the-machine.md) | The digest of an idempotency key is computed by the machine, and `src/program.ts` reaches no module of Node | [0193](0193-the-public-surface-is-four-entries.md) |
| [0127](archive/0127-a-live-stream-feeds-its-entities-from-the-boundary.md) | A live stream is no work of a program: the boundary reads it, and sends each item |  |
| [0128](archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md) | An operation that acts on nothing may be dropped or changed while it runs | [0129](archive/0129-a-droppable-runner-that-sends-does-not-compile.md) |
| [0129](archive/0129-a-droppable-runner-that-sends-does-not-compile.md) | A droppable runner whose services hold `Entities` does not compile |  |
| [0130](archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md) | A runner retries, the state counts the attempts, and a rehearsal fails on an operation that loops |  |
| [0181](0181-a-timer-needs-no-type-parameter.md) | A timer needs no type parameter, and `update` keeps `Match.withReturnType` |  |

## Creation

| Note | Decides | Changed by |
| --- | --- | --- |
| [0012](archive/0012-creation-is-a-request-of-its-own.md) | Creating an entity is a request of its own | [0049](archive/0049-flags-are-checked-by-their-schema.md), [0060](archive/0060-send-and-create-take-no-key.md), [0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md), [0182](0182-init-may-reject-the-flags.md) |
| [0017](archive/0017-creation-in-the-machine.md) | Creation is part of the machine | [0047](archive/0047-a-request-of-an-operation-has-a-name.md), [0060](archive/0060-send-and-create-take-no-key.md) |
| [0049](archive/0049-flags-are-checked-by-their-schema.md) | Flags are checked by their schema |  |
| [0050](archive/0050-a-creation-is-answered-apart-from-a-message.md) | A creation is answered apart from a message |  |
| [0182](0182-init-may-reject-the-flags.md) | A program's `init` may reject the flags, and the rejection is not stored |  |

## Defects

| Note | Decides | Changed by |
| --- | --- | --- |
| [0006](archive/0006-a-defect-suspends-the-entity.md) | A defect suspends the entity | [0046](archive/0046-a-receiver-that-crashes-is-sent-again.md), [0061](archive/0061-only-what-the-program-does-is-its-defect.md), [0113](archive/0113-a-suspended-entitys-operations-run-to-their-end.md), [0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) |
| [0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) | An event the runtime cannot finish crashes its entity | [0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md), [0067](archive/0067-each-entity-is-held-by-its-own-lock.md), [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) |
| [0061](archive/0061-only-what-the-program-does-is-its-defect.md) | Only what the program does is its defect |  |
| [0113](archive/0113-a-suspended-entitys-operations-run-to-their-end.md) | A suspended entity's operations run to their end |  |
| [0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) | An operator sees the suspended entities, and what a resume or a discard did | [0185](0185-inspect-gives-what-is-stored-of-one-entity.md) |
| [0185](0185-inspect-gives-what-is-stored-of-one-entity.md) | `inspect` gives what is stored of one entity, read from one snapshot |  |
| [0205](0205-a-defects-cause-is-written-as-text-every-database-holds.md) | A defect's cause is written as text every database holds, with each character none holds escaped |  |

## Versions and deploys

| Note | Decides | Changed by |
| --- | --- | --- |
| [0020](archive/0020-a-new-program-is-checked-against-the-stored-work.md) | A new program is checked against the work it finds stored | [0064](archive/0064-the-program-is-not-the-machines-state.md) |
| [0022](archive/0022-a-new-program-keeps-what-work-started-with.md) | A new program keeps how its work is delivered, and its name | [0156](archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md) |
| [0036](archive/0036-a-migration-is-a-function-on-the-json.md) | A program carries its migrations, and a migration is a function on the JSON | [0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md), [0058](archive/0058-work-is-compared-by-what-is-stored.md), [0100](archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md), [0126](archive/0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md) |
| [0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md) | A row no version reads fails what reads it, not the process | [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), [0122](archive/0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) |
| [0100](archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md) | A rejection's reason is kept as long as a reply of its version is stored |  |
| [0126](archive/0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md) | A program keeps every migration, and a test records what each did |  |
| [0156](archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md) | A program is renamed by its launch, which moves what is stored under its old name, and its entities keep their keys | [0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md), [0176](archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md) |
| [0051](archive/0051-a-deploy-that-fails-leaves-nothing-running.md) | A deploy that fails leaves nothing running | [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md) |
| [0058](archive/0058-work-is-compared-by-what-is-stored.md) | Work is compared by what is stored |  |
| [0075](archive/0075-a-name-is-deployed-once-in-a-process.md) | A name is deployed once in a process | [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) |
| [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md) | A deploy interrupted before it registers undoes itself whole |  |

## Schemas, storage and projections

| Note | Decides | Changed by |
| --- | --- | --- |
| [0121](archive/0121-a-read-answers-from-the-row-of-the-read-model.md) | A read answers from the row of the read model, and calls no `project` | [0122](archive/0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) |
| [0122](archive/0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) | `reindex` leaves a row it cannot compute, and names its entity |  |
| [0135](archive/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) | A large state is split by the program, and the runtime warns of a large step | [0138](archive/0138-the-log-publishes-topics.md), [0154](archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md) |
| [0137](archive/0137-the-log-is-ordered-within-a-partition.md) | The log is ordered within a partition, and a consumer keeps a cursor per partition | [0138](archive/0138-the-log-publishes-topics.md), [0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md), [0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md) |
| [0138](archive/0138-the-log-publishes-topics.md) | The log publishes topics, and a consumer reads one | [0139](archive/0139-the-projection-is-json.md), [0140](archive/0140-a-row-of-a-topic-gives-its-value.md), [0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md), [0154](archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md) |
| [0139](archive/0139-the-projection-is-json.md) | The projection is JSON, and `project` converts |  |
| [0140](archive/0140-a-row-of-a-topic-gives-its-value.md) | A row of a topic gives the value the topic selects | [0154](archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md) |
| [0141](archive/0141-a-query-and-a-reading-of-the-log-take-a-limit.md) | A query and a reading of the log take a limit, and one left out is the caller's defect | [0143](archive/0143-a-query-pages-after-the-last-row-it-gave.md), [0207](0207-a-criterion-is-a-scalar-both-dialects-compare-alike.md) |
| [0142](archive/0142-a-consumer-waits-for-a-row-of-its-topic.md) | A consumer waits for a row of its topic, woken by the commit that writes it | [0153](archive/0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md), [0163](archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md), [0184](0184-consume-runs-a-reader-of-a-consumer.md) |
| [0143](archive/0143-a-query-pages-after-the-last-row-it-gave.md) | A query pages after the last row it gave, by the index it orders by and the id | [0144](archive/0144-a-page-reads-the-rows-before-its-cursor.md), [0145](archive/0145-a-page-is-read-as-ranges-of-its-index.md), [0146](archive/0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md) |
| [0144](archive/0144-a-page-reads-the-rows-before-its-cursor.md) | A page reads the rows of its program before its cursor, and decision 0143 stands on its other reasons | [0145](archive/0145-a-page-is-read-as-ranges-of-its-index.md) |
| [0145](archive/0145-a-page-is-read-as-ranges-of-its-index.md) | A page is read as ranges of an index of the value and the id, and a descending order reverses the ids | [0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) |
| [0146](archive/0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md) | An index that is an integer beyond 2^53 is written with the exact digits of its double |  |
| [0148](archive/0148-a-count-and-a-sum-are-read-in-one-statement.md) | A count and a sum over the entities that match are read in one statement, and a sum that meets no number is its caller's defect | [0209](0209-a-sum-is-refused-past-the-largest-double-alike-on-both-dialects.md) |
| [0209](0209-a-sum-is-refused-past-the-largest-double-alike-on-both-dialects.md) | A sum is exact on PostgreSQL, and is refused alike on both dialects past the largest double |  |
| [0207](0207-a-criterion-is-a-scalar-both-dialects-compare-alike.md) | A criterion's value and a cursor are scalars both dialects compare alike, and anything else is the caller's defect |  |
| [0149](archive/0149-the-read-model-answers-what-a-program-acts-on.md) | The read model answers what a program acts on, in three forms, and any other question is a report fed from the log | [0150](archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md) |
| [0150](archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md) | A count per value of an index is read in one statement, and an ack joins the caller's transaction |  |
| [0151](archive/0151-a-process-holds-ten-thousand-entities-by-default.md) | A process holds ten thousand entities by default |  |
| [0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md) | The consumers of a topic are declared at deploy, and a topic no consumer holds is pruned whole | [0223](0223-a-disk-that-is-really-full.md) |
| [0153](archive/0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md) | A reader of a consumer names the partitions it reads, and the division is the caller's |  |
| [0184](0184-consume-runs-a-reader-of-a-consumer.md) | `consume` runs a reader of a consumer, a page and its ack in one transaction |  |
| [0154](archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md) | A step's projection is stored once in the outbox, in a publication each topic's row names | [0224](0224-a-consumer-shows-the-time-of-the-step-it-reads-next.md) |
| [0155](archive/0155-a-foreach-of-messages-to-children-puts-them-back-once.md) | A `forEach` of messages to children by id puts them back once, with the step one message after the other gives |  |
| [0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) | The storage speaks SQLite and PostgreSQL, in the same tables, and a query reads alike on both, of text every database holds | [0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md), [0179](0179-an-id-is-not-empty.md), [0222](0222-postgresql-with-many-connections.md) |
| [0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md) | A database of SQLite made before is given `request_id`, and a page keeps the level of a caller's transaction | [0191](0191-a-launch-creates-the-tables.md), [0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) |
| [0191](0191-a-launch-creates-the-tables.md) | A launch creates the tables, in one transaction, unless it is told they exist | [0198](0198-every-object-the-runtime-makes-is-named-with-tea.md), [0216](0216-the-tables-are-made-by-effects-migrator.md) |
| [0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) | Every table, index, trigger and function the runtime makes is named with `tea_` | [0218](0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md) |
| [0222](0222-postgresql-with-many-connections.md) | On a server of PostgreSQL every transaction of the runtime states its level, an integer may come as a bigint, and a deadlock crashes the entity |  |
| [0223](0223-a-disk-that-is-really-full.md) | On a disk that is really full an operator frees room first, and the runtime keeps none of its own |  |
| [0224](0224-a-consumer-shows-the-time-of-the-step-it-reads-next.md) | A consumer shows the time of the step it reads next, and the runtime records no metric of its age |  |
| [0216](0216-the-tables-are-made-by-effects-migrator.md) | The tables are made by Effect's `Migrator`, which records each migration in `tea_migrations` | [0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md), [0218](0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md) |
| [0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md) | On PostgreSQL `tea_migrations` is named in the schema the tables are made in |  |
| [0218](0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md) | The prefix is `effecttea_`, and a launch dies on a name the runtime's objects would take |  |
| [0025](archive/0025-operations-and-projections-have-schemas.md) | A program gives the schemas of its operations and of its projection | [0058](archive/0058-work-is-compared-by-what-is-stored.md) |
| [0026](archive/0026-the-test-maps-a-projection-to-its-messages.md) | The test says which messages a projection's actions stand for | [0213](0213-a-projections-allows-is-given-the-sender.md) |
| [0213](0213-a-projections-allows-is-given-the-sender.md) | A projection's `allows` is given the sender, and says whose each action is |  |
| [0027](archive/0027-a-program-gives-the-schema-of-its-senders.md) | A program gives the schema of its senders |  |
| [0030](archive/0030-a-schema-encodes-to-json.md) | A schema encodes to what JSON holds | [0098](archive/0098-json-is-effect-s.md) |
| [0032](archive/0032-a-projection-is-a-row.md) | A projection is a row, and a program declares the indexes a query uses | [0070](archive/0070-reindex-writes-a-row-only-over-its-state.md), [0139](archive/0139-the-projection-is-json.md), [0141](archive/0141-a-query-and-a-reading-of-the-log-take-a-limit.md), [0143](archive/0143-a-query-pages-after-the-last-row-it-gave.md), [0148](archive/0148-a-count-and-a-sum-are-read-in-one-statement.md), [0206](0206-an-index-that-is-no-scalar-is-the-programs-defect.md) |
| [0206](0206-an-index-that-is-no-scalar-is-the-programs-defect.md) | An index that is no scalar is the program's defect, and suspends the entity |  |
| [0038](archive/0038-what-happened-is-published-through-an-outbox.md) | What happened is published through an outbox | [0057](archive/0057-the-machine-gives-what-is-written.md), [0072](archive/0072-the-log-shows-what-a-step-changed.md), [0137](archive/0137-the-log-is-ordered-within-a-partition.md), [0138](archive/0138-the-log-publishes-topics.md) |
| [0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md) | A consumer of the outbox keeps its cursor | [0137](archive/0137-the-log-is-ordered-within-a-partition.md), [0138](archive/0138-the-log-publishes-topics.md), [0141](archive/0141-a-query-and-a-reading-of-the-log-take-a-limit.md), [0142](archive/0142-a-consumer-waits-for-a-row-of-its-topic.md), [0150](archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md), [0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md), [0184](0184-consume-runs-a-reader-of-a-consumer.md), [0195](0195-the-package-is-effect-tea-persistent.md) |
| [0040](archive/0040-what-is-stored-encodes-to-json-as-it-is.md) | What is stored encodes to JSON as it is | [0057](archive/0057-the-machine-gives-what-is-written.md), [0210](0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md) |
| [0210](0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md) | A sparse array is no JSON, and `-0` is read back as `0` |  |
| [0214](0214-a-rejections-reason-is-given-as-a-caller-reads-it.md) | A rejection's reason is given as a caller reads it, decoded from its JSON |  |
| [0215](0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md) | The runtime's tables are made in the schema the client's `search_path` names, one runtime per database | [0216](0216-the-tables-are-made-by-effects-migrator.md), [0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md) |
| [0062](archive/0062-a-row-is-read-through-a-schema.md) | A row is read through a schema, or not at all | [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) |
| [0070](archive/0070-reindex-writes-a-row-only-over-its-state.md) | `reindex` writes a row only over the state it was computed from |  |
| [0072](archive/0072-the-log-shows-what-a-step-changed.md) | The log shows what a step changed, as the program deployed computes it | [0138](archive/0138-the-log-publishes-topics.md) |
| [0098](archive/0098-json-is-effect-s.md) | `Json` is Effect's |  |

## What enters the library

| Note | Decides | Changed by |
| --- | --- | --- |
| [0179](0179-an-id-is-not-empty.md) | An id is not empty, and an empty id is the defect of whoever gave it |  |
| [0204](0204-a-request-id-is-text-a-database-holds.md) | A request id is text a database holds, and one that is not is the caller's defect |  |
| [0052](archive/0052-what-crosses-the-library-is-never-mutated.md) | What crosses the library is never mutated |  |
| [0053](archive/0053-what-a-handle-is-given-is-checked.md) | What a handle is given is checked | [0141](archive/0141-a-query-and-a-reading-of-the-log-take-a-limit.md), [0179](0179-an-id-is-not-empty.md), [0204](0204-a-request-id-is-text-a-database-holds.md), [0207](0207-a-criterion-is-a-scalar-both-dialects-compare-alike.md) |
| [0054](archive/0054-a-program-is-checked-where-it-enters.md) | A program is checked where it enters | [0064](archive/0064-the-program-is-not-the-machines-state.md), [0132](archive/0132-a-key-may-take-a-parameter.md), [0136](archive/0136-a-key-is-a-name-and-a-parameter-as-data.md), [0208](0208-a-launch-checks-every-option.md) |
| [0208](0208-a-launch-checks-every-option.md) | A launch checks every option, `retry`, `passivate` and `warn` among them |  |

## The runtime

| Note | Decides | Changed by |
| --- | --- | --- |
| [0028](archive/0028-rules-the-runtime-settled.md) | Rules the runtime settled | [0029](archive/0029-an-idle-entity-is-unloaded.md), [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md), [0134](archive/0134-an-entitys-loop-yields-between-two-steps.md), [0205](0205-a-defects-cause-is-written-as-text-every-database-holds.md) |
| [0029](archive/0029-an-idle-entity-is-unloaded.md) | An idle entity is unloaded, and what is stored wakes it | [0067](archive/0067-each-entity-is-held-by-its-own-lock.md), [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md), [0071](archive/0071-a-process-starts-the-entities-with-a-message.md), [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md), [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md), [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), [0111](archive/0111-an-entity-s-wait-times-out-its-take-alone.md), [0113](archive/0113-a-suspended-entitys-operations-run-to-their-end.md), [0116](archive/0116-an-entitys-wait-ends-with-an-item-of-its-queue.md), [0194](0194-a-timer-months-away-sleeps-on-effects-promise-of-a-duration.md) |
| [0194](0194-a-timer-months-away-sleeps-on-effects-promise-of-a-duration.md) | A timer months away sleeps on Effect's promise of a duration, which Effect keeps by timers of the host in turn | [0221](0221-a-timer-sleeps-an-hour-at-most-and-reads-the-wall-clock-again.md) |
| [0219](0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md) | A drain holds when an interrupted fiber closes its scope, and on Cluster ends before the runner lets its shards go |  |
| [0220](0220-the-runtime-records-a-span-for-each-step-and-each-operation.md) | The runtime records a span for each step and each operation, linked to what each follows, and three metrics of its entities | [0224](0224-a-consumer-shows-the-time-of-the-step-it-reads-next.md) |
| [0221](0221-a-timer-sleeps-an-hour-at-most-and-reads-the-wall-clock-again.md) | A timer sleeps an hour at most at a time, and reads the wall clock after each sleep |  |
| [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md) | The runtime waits for what it waits for, and polls nothing | [0163](archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md) |
| [0066](archive/0066-the-runtimes-tests-move-time.md) | The runtime's tests move time, and wait for nothing on a clock | [0101](archive/0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md), [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md), [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) |
| [0067](archive/0067-each-entity-is-held-by-its-own-lock.md) | Each entity is held by its own lock | [0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md) |
| [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md) | What another fiber reads changes in one step | [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) |
| [0071](archive/0071-a-process-starts-the-entities-with-a-message.md) | A process starts the entities whose mailbox holds a message | [0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) |
| [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md) | What the runtime did is told to a probe, out of its options |  |
| [0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) | A message that finds the mailbox empty is handled as it arrives | [0081](archive/0081-on-cluster-a-step-commits-with-its-reply.md), [0147](archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md) |
| [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md) | A process over its capacity unloads the least recently used | [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md), [0109](archive/0109-settled-waits-for-an-entity-unloading.md), [0151](archive/0151-a-process-holds-ten-thousand-entities-by-default.md) |
| [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) | The waker tries an entity it cannot load again, after the retry |  |
| [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) | A timer due is no spare entity, and a registered deploy keeps its name | [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md), [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md), [0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md) |
| [0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md) | What a caller sets going is finished without it | [0092](archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md), [0110](archive/0110-detached-work-is-counted-until-it-ends-however-it-ends.md), [0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md) |
| [0101](archive/0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md) | A moved clock gives a fiber it did not wake one turn | [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) |
| [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md) | A test moves the wall clock ahead of the sleeps |  |
| [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) | The runtime's tests choose where fibers yield, and none runs under budgets | [0115](archive/0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md), [0117](archive/0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) |
| [0109](archive/0109-settled-waits-for-an-entity-unloading.md) | `settled` waits for an entity unloading |  |
| [0110](archive/0110-detached-work-is-counted-until-it-ends-however-it-ends.md) | Detached work is counted until it ends, however it ends |  |
| [0111](archive/0111-an-entity-s-wait-times-out-its-take-alone.md) | An entity's wait times out its take alone | [0116](archive/0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) |
| [0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md) | A fork from a region that cannot be interrupted says it is interruptible |  |
| [0115](archive/0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md) | The scheduler of the tests preempts from a run's third step, where Effect first can | [0117](archive/0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) |
| [0116](archive/0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) | An entity's wait ends with an item of its queue, and nothing races its take | [0117](archive/0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md), [0134](archive/0134-an-entitys-loop-yields-between-two-steps.md) |
| [0117](archive/0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) | A fiber on another's stack yields with no task ready | [0134](archive/0134-an-entitys-loop-yields-between-two-steps.md) |
| [0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md) | A planned stop drains the at-most-once operations, and stops the rest at once | [0120](archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md), [0219](0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md) |
| [0120](archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md) | The runtime closes a sequential scope of its own, whatever its caller's | [0219](0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md) |
| [0134](archive/0134-an-entitys-loop-yields-between-two-steps.md) | An entity's loop yields after a step that leaves it more to do, so that a busy entity holds no other for more than a step |  |
| [0147](archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md) | An entity holds a bounded number of callers' messages, and a `send` past it is answered `Full` | [0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) |
| [0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md) | Every fork of the runtime drops the transaction, and a count is raised and lowered by one `acquireUseRelease`, as a test reads in the code |  |
| [0177](archive/0177-the-runtimes-bookkeeping-stays-in-synchronous-steps.md) | The runtime's bookkeeping stays in synchronous steps, and not in Effect's `Tx` modules |  |
