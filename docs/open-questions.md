# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Programs

- **Work under many keys.** A program declares its keys, so an entity holds as many pieces of work as it has
  keys, and no more ([decision 0033](decisions/0033-a-program-declares-its-keys.md)). A state that would hold one
  operation per line of an order has nowhere to put them. Do such items want to be entities of their own, as a
  large state does, or is there a kind of work held under keys a state computes?
- **Work that may be abandoned.** An operation leaves only through its completion. Is there a kind of work with
  no effect on the world (a computation, a read) that a state may drop, as effect-tea drops a subscription?
- **Live streams.** A timer and an operation survive passivation. A stream from a socket or a feed does not.
  Are they allowed, keeping the entity loaded while their key is present, or left out? A process over its
  capacity unloads only entities with nothing to do
  ([decision 0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)), so a stream
  that keeps its entity loaded would count as something to do, and hold a place under the capacity.
- **Children inside an entity.** effect-tea composes programs into a tree. Does an entity's program compose
  children the same way, stored as one state? The decider pattern (Jérémie Chassaing's `Decider`) has an algebra
  for it — two state machines compose into one, with laws a test can check — and is worth reading before this is
  designed, although it stores the events where this design stores the state
  ([decision 0002](decisions/0002-store-the-state-not-the-messages.md)).
- **Rehearsing entities together.** `rehearse` runs one entity, and the test answers for the others. A booking
  that sends a confirmation the inventory would reject passes both rehearsals
  ([decision 0009](decisions/0009-entities-talk-through-operations.md)). Is a rehearsal of several entities
  needed, where `send` reaches the other program, or a check that two programs agree on their messages?
- **Who may send what.** `update` reads `meta.from` and rejects what a sender may not do. Should authorization
  that is not domain (a valid token) happen before the mailbox, and what does the caller get then? Flags and
  messages that do not encode are the caller's defect, not a reply
  ([decision 0049](decisions/0049-flags-are-checked-by-their-schema.md)). And who may create an entity, since
  `init` sees no sender ([decision 0012](decisions/0012-creation-is-a-request-of-its-own.md))? A defect at
  creation stores nothing ([decision 0014](decisions/0014-rules-the-machine-settled.md)): what is its creator
  answered? A caller's requests are its sender's
  ([decision 0048](decisions/0048-a-callers-request-belongs-to-its-sender.md)), so how fine a sender is says
  whose request ids are whose.

## Storage and reading

- **A log that nobody prunes.** A consumer is a name holding a stored cursor, and the runtime never drops a row
  a consumer has not read: one that stops acking holds the log, where `consumers` shows it
  ([decision 0039](decisions/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)). Nothing caps what that grows
  to. A step that cannot publish cannot commit, so a cap would stop the entities: what a deployment does when
  the disk is the limit — a warning, a refusal, a drop that says which consumer lost rows — is not decided.
- **The order of what is published.** A cursor over the outbox skips nothing while one transaction writes at a
  time, which is what the runtime on SQLite does
  ([decision 0038](decisions/0038-what-happened-is-published-through-an-outbox.md)). Where two write at once —
  a cluster, or a store that allows it — a row with a lower `seq` may commit after one a consumer has read, and
  be stepped over. What orders the log then, and what a consumer reads from, is not decided.
- **Large states.** Each message stores the whole state. Where is the limit, and what does a program with a
  large state do: split into entities, or store a difference?
- **Renaming a program.** A program's name is the entities' address, and a schema's migration does not move
  what is stored under it: its entities, and the replies stored for them by other entities
  ([decision 0022](decisions/0022-a-new-program-keeps-what-work-started-with.md)). How a rename is run, and
  what reaches the senders that stored a reply under the old name, is not decided. A schema that changes is
  ([decision 0036](decisions/0036-a-migration-is-a-function-on-the-json.md)).
- **Migrations that never leave.** A program's version is how many migrations it carries, plus one
  ([decision 0036](decisions/0036-a-migration-is-a-function-on-the-json.md)): nothing is declared, and no bump is
  forgotten. But a migration can never be dropped, since dropping the first renumbers every version after it, and
  a row is migrated only when it is written again, while a caller's reply is kept for ever
  ([callers' stored replies](#running)). So a program carries every migration it ever had. Dropping them would
  need every row written again at the program's version — what `reindex` does for the read model alone — and a
  version that starts past 1, which a program then declares: one that forgets to raise it reads its own rows as
  newer and fails loudly ([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)). Nothing
  either checks that a migration once deployed is never changed, which a function cannot be compared for. Is it
  worth it, and once replies are no longer kept for ever?
- **Reading with a program that dies on the state.** `read` calls `project` on the stored state outside the
  machine. A new program whose `project` dies on it gives the reader a defect, where an activation would suspend
  the entity ([decision 0020](decisions/0020-a-new-program-is-checked-against-the-stored-work.md)). Should a
  read activate the entity, answer from the read model, or say that the entity is suspended? A `read` of an
  entity this process does not hold also loads all of it, its keys and its mailbox, to read its state alone.

## Running

- **Two versions at once.** During a rolling deploy, a state written by the new version may be read by the
  old one. Is forward compatibility for one version required, or do deploys avoid it? A database is held by one
  runtime ([decision 0080](decisions/0080-a-database-is-held-by-one-runtime.md)), so two versions meet only where
  two processes share a store. On Effect Cluster a runner carries no version, and a shard may go from a new runner
  back to an old one ([Cluster](cluster.md#two-versions-at-once)): the choice is between deploys that replace every
  runner before a new one writes, forward compatibility for one version, or a change to Cluster.
- **Suspended entities.** A caller gets `Suspended`, and an operation that sends waits, keeping its own entity
  waiting with it ([decision 0010](decisions/0010-a-rejection-may-carry-a-reason.md)), as it waits for a
  program not deployed yet ([decision 0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md)),
  for ever if it never is, and for a receiver that crashes
  ([decision 0046](decisions/0046-a-receiver-that-crashes-is-sent-again.md)), for ever if it keeps crashing.
  How does an operator see, resume and discard? And how long may a sender wait before someone is told? It
  waits for the receiver's resumption, and costs nothing meanwhile
  ([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)), but nothing says it waits.
  A suspension stops every operation of the entity, and drops what they deliver meanwhile
  ([decision 0006](decisions/0006-a-defect-suspends-the-entity.md)): a charge interrupted because another
  operation died runs again, or delivers `unknown` if at most once. Should a suspension stop only the handling
  of messages, and let the work under way record its completions? And an operation that dies cannot be
  discarded, only resumed: one that dies on a reply stored by another entity dies again on every resume, and
  only a new version of the program gets it out. Neither can a completion or a firing `update` dies on
  ([decision 0041](decisions/0041-a-completion-is-not-discarded.md),
  [decision 0044](decisions/0044-a-firing-is-not-discarded.md)), and the runtime's `discard` does not say that it
  did nothing.
- **Callers' stored replies.** A caller's reply is stored so that a retry gets it, and is kept for ever: a time
  after which a retry is applied again would depend on the protocol, and on who callers are
  ([who may send what](#programs)). Replies to entities are kept while the work that asked is stored
  ([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
- **Idempotency keys that services cap.** An idempotency key is readable JSON, the entity's program name and id,
  the key and the incarnation ([decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)), and an id
  may be long. Payment providers cap the length of a key (Stripe at 255 characters). The machine keeps the key
  readable; should the runtime, or the runner, hash it for such services, and with what, so that it stays the
  same across versions?
- **Failing operations.** A transient failure (a timeout) is retried inside the operation, or becomes a
  message. After how many retries does it become a defect, if ever? And
  should the runtime notice work that comes back at once, turn after turn: a timer kept at a time already past,
  an operation kept on its own completion ([decision 0008](decisions/0008-delivered-work-is-done.md))?
- **Bookkeeping in transactions.** What another fiber reads changes in one synchronous step
  ([decision 0068](decisions/0068-what-another-fiber-reads-changes-in-one-step.md)): a rule kept by hand, which
  a step that waits cannot keep. The waker reads the entities held and then waits for a poke, and only the steps
  between the two keep a timer from being slept past. Effect's `Tx` modules (`TxRef`, `TxHashMap`, `Effect.tx`,
  `Effect.txRetry`) would make the reading and the wait one transaction, and `settled` a wait on a condition. A
  transaction does no I/O, so an entity's lock stays
  ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)), and holds in one process only. Is it
  worth it once the runtime is whole, and once Effect Cluster says what bookkeeping a node keeps? The tests that
  run the runtime under every budget of steps are what such a rewrite is checked against.

## Naming

- The name of the library, once there is code to publish.
