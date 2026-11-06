# 0133. An entity composes children as effect-tea does

**Status:** accepted, 2026-11-05, with the step Children inside an entity of the roadmap. Decided the open question
on children inside an entity, and the row of the table in `docs/design.md`, under Where it departs from effect-tea,
that left it open. Changed by [decision 0155](0155-a-foreach-of-messages-to-children-puts-them-back-once.md):
`forEach` over messages to children by id puts them back once.

## Context

effect-tea composes programs into a tree. A parent declares its children with `child`, or with `each` for children by
id, and an optic says where each child's state lives in the parent's. The library routes each child's messages,
lifts its commands, and keeps its subscriptions under `[<child>, key]`, or `[<child>, id, key]` for a child by id. A
child talks to its parent through events, and the parent to a child through the messages the child declares
`external`. A parent never reads a child's state to decide (the Guide, under Composition and under Splitting a
program).

A program here is one state machine. A program whose concerns grow, an order whose lines each carry a charge and a
shipment, writes them all in one `update`, one `durable` and one list of keys. Splitting it into entities moves every
rule that holds across the parts into a protocol, since entities agree only through messages
([decision 0009](archive/0009-entities-talk-through-operations.md)).

[Decision 0132](0132-a-key-may-take-a-parameter.md) gives a key a parameter. The keys of children by id are such keys,
so the machine needs nothing else: a parent is a program the machine takes as any other.

## Decision

### A child is a part

- **A part is declared as a program is, without a name, indexes or migrations.** `part(schemas)(…)` in
  [`src/program.ts`](../../src/program.ts) takes the schemas of a program and the same pieces: `keys`, `init`,
  `update`, `durable`, `operations` and `project`. The entity is the parent's, and so are its address, its row of the
  read model and the versions of its state. A migration of the parent is a function on the JSON of the whole state,
  the children's included, and on the wrapped messages, operations and reasons
  ([decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md)).
- **A part may raise events for its parent.** Its `update` returns a state, a rejection, or `raise(event)(state)`. A
  step that raises gives the state with the events, and a step that raises none gives the state alone. An event is
  handled by the parent's `onEvent` in the step that raised it, so nothing stores it.
- **A part may take external messages from its parent.** They are a type of their own, apart from its inbound
  messages, and only the parent sends them, through `children.<child>.update`. effect-tea counts them among the
  child's messages, which any view of the child may dispatch. Here an inbound message is what a caller outside may
  send, and a fact the parent hands down as one truth, an order cancelled, must not be sent to a line by a caller.
- **The types of events, external messages and the sender are given by schemas.** Neither events nor external
  messages are stored, so their schemas only type the part, as decision 0035 has every type of a program come from a
  schema ([decision 0035](archive/0035-one-place-where-a-program-is-declared.md)). A part whose `update` reads no
  sender gives none, and reads `unknown`. A parent whose sender is not one a child reads does not compile.
- **A part with children of its own is a part.** A tree is as deep as a program needs, and each level wraps its
  children's messages, keys and work once more.

### A parent declares its children

- **`children` holds each child, placed with `child` or `each`.** `child(part, { at })` places one child where an
  optic of Effect focuses: where the optic focuses nothing, the child is not there. `each(part, { id, at })` places
  children by id, as the entries an optic focuses: `Optic.id<State>().key('lines').compose(Optic.entries())` for a
  record by id. effect-tea gives `each` a function from an id to an optic, and `subscribed` to list the children whose
  subscriptions run. Here every child that is there holds its work, so a step lists them all, and one optic over the
  entries says both where a child is and which children are there, with no second function to disagree with it.
- **An id has a schema, and two ids are one when they encode alike.** An id goes into the parameters of keys and
  into stored messages, operations and reasons, and the machine compares what is stored by its encoding, as it
  compares the parameters of a key ([decision 0132](0132-a-key-may-take-a-parameter.md)).
- **`update` takes the parent's own messages, its `meta`, and `children`.** `children.Line.update(id, message)` sends
  a child an external message and returns the parent's step. A child that rejects it, or is not there, is a defect,
  as in effect-tea, since the parent decides when to send. `andThen` and `forEach` add up a parent's steps, keeping
  the events of each, for a parent that is a part. A parent that is a program raises nothing, so its steps are
  states, which a function composes.
- **`onEvent` has a handler for each child that raises events,** required exactly when one does, as in effect-tea. A
  handler of children by id takes the id first. It returns the parent's step, and a parent that is a part may pass
  the event on with `raise`.
- **`project` takes `children`, with each child's projection.** `children.Line(state, id)` is the projection of the
  line `id`, and one of a child that is not there is a defect. The read model stays one row for the entity, so a
  query across children is a query of the parent's indexes.
- **`init` makes the whole state, the children's included.** A child is started with its own `init`, called by the
  parent: there are no commands for the start to lose, which is why effect-tea gives `children.<child>.init`.

### What the library derives

- **Messages.** The parent's inbound and internal messages are its own and each child's, as
  `{ _tag: <child>, message }`, or `{ _tag: <child>, id, message }` for a child by id. A child's sender is the
  parent's, so `meta.from` reaches the child as it reached the parent. An own message whose tag is a child's name
  would be routed to the child, and does not compile.
- **Keys.** The parent's keys are its own and each child's, under the name `<child>.<key>`. A key of one child takes
  the child's parameter. A key of a child by id takes the child's id, or the id and the child's parameter as a pair.
- **Operations and runners.** A child's operation is the parent's under the tag `<child>.<tag>`, as
  `{ _tag: 'Line.Charge', id, operation }`, and its runner is the child's, with the same delivery, its answer wrapped
  as the child's internal message. The tag carries the child's own, because a runner is found by tag and says what a
  crash does to its operation: one runner for all of a child's operations could not say it for each.
- **Rejections.** A reason a child gives reaches the caller as `{ _tag: <child>, id, reason }`. A bare rejection stays
  bare. An inbound message to a child that is not there is rejected bare, as effect-tea rejects it: the caller named
  the id, so a reason that names it again tells nothing, and a reason of the library's would be a member of every
  parent's rejection type.
- **Names with a `.` are composition's.** A parent's own key, operation or child named with a `.` could share a name
  with one the library derives, so it is refused where the parent is declared, before any program enters. The machine
  checks nothing more: a composed program is a program.
- **A state lists its children by id once.** The library encodes each id of a state once, and keeps the listing with
  the state, so a step that asks for many children, the projection of each line or a message to each, costs the
  encoding of each id once and not once per child asked. A step that sends to each child in turn still replaces the
  parent's state once per child, which costs a copy of the record each time.

### What the machine keeps for a child

- **A child that leaves the state with an operation under way is a defect**, as a key dropped while its operation runs
  is ([decision 0005](archive/0005-an-operation-leaves-only-by-completing.md)). A child by id that comes back in a
  later step comes back under keys whose incarnations have moved on, so an answer of its earlier run is dropped
  ([decision 0004](archive/0004-incarnations-guard-internal-messages.md)). effect-tea asks a program to mind ids that
  come back, since a command's answer goes to whichever row has its id. Here no program minds them. A child by id
  removed and added again with the same id in one step keeps the work that encodes alike, as any kept key does
  ([decision 0058](archive/0058-work-is-compared-by-what-is-stored.md)).
- **A child that asks its parent to drop it leaves its work first.** It raises the event from a state that holds no
  work, as the line of the cart raises `Removed` from its state `Removed`. A completion is not discarded, and work a
  state still holds after it runs again under a new incarnation
  ([decision 0041](archive/0041-a-completion-is-not-discarded.md)), so a child that raised the event from the state
  that held the work would act twice under a parent that kept it. effect-tea's child raises `LeaveRequested` with its
  state unchanged, since a page kept open costs nothing in the world.

### The laws are tested

A parent with one child and nothing of its own does what the child does. On any sequence of the child's messages,
each wrapped, it rejects what the child rejects with the reason wrapped, dies where the child dies, holds the child's
state where the optic puts it, raises the child's events, holds the child's work lifted under the child's keys
renamed, and projects what the child projects. A child of a child does what it does as a child of the parent, up to
its messages, keys and work being wrapped twice. A property test in
[`src/composition.test.ts`](../../src/composition.test.ts) checks both.

These are the laws of the Decider's composition, said of a composition that names its children. Jérémie Chassaing's
`Decider.compose` puts two deciders side by side, tagging commands and events `Left` and `Right` and pairing the
states, and `neutral`, a decider of no commands and no state, gives back an equivalent decider when composed with
any. His `many` holds deciders by id in a map, and starts a child from its initial state on its first command. His
code states no law and tests none. effect-tea's composition, and this one, names each child, so the identity is a
parent with one child and nothing of its own, and the associativity is a child of a child read as a child of the
parent.

## Where an item goes

Two questions decide it, in order.

- **Inside the entity, or an entity of its own.** An item is inside the entity when a rule holds across the item and
  the rest of the entity within one step: an order's line is not charged once the order is cancelled, in the step
  that cancels it. An item is an entity of its own when it has a life of its own that others address: a seat's
  inventory, which every booking sends to. It is an entity of its own too when its parent would hold more items than
  one row and one step should carry. Where that starts is what
  [decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) proposes: the runtime
  warns of a step past a threshold, and the design gives what a step costs. A child by id moves that question, and
  does not answer it.
- **Inside the entity, a child or the parent's own state.** The Guide's rules on splitting a program decide it,
  unchanged. An item is a child when it is a concern of its own: the parent hears of it through its events, steers it
  through its external messages, and never reads its state to decide. A line whose charge is a state machine of its
  own, which raises `Charged` and decides its own removal, is a child. A line the order would read to decide, or whose
  state the order would copy down and back up, is the order's own state. The order's total is read off the
  children's projections in `project`, and never kept.

## What it rests on

- That a composed program is a program the machine takes as written by hand: one state, keys under declared names,
  runners by tag. **Tested**, in [`src/composition.test.ts`](../../src/composition.test.ts): a rehearsal runs a child's
  operation through the machine, delivers its answer to the child, and drops the answer of a child removed and added
  again.
- That effect-tea's composition carries over where nothing is stored. **Documented**, in the Guide of effect-tea,
  under Composition.
- That the Guide's rules on splitting a program hold of a state that is stored. **Only reasoned**: a parent that never
  reads a child's state to decide loses nothing when the two are stored in one row, and a step of the parent is a
  step of the child, as in effect-tea.
- That an optic of Effect finds what it put, and puts back only where it focuses. **Documented**, in the JSDoc of
  `Optional` in `node_modules/effect/src/Optic.ts`: `replace` returns the whole unchanged where the optic does not
  focus.
- That a state is a value nothing changes in place, so that a listing kept with a state never goes stale. **Only
  reasoned**: the machine already compares two states by reference to know whether a step changed the state, and a
  program that changed a state in place would already lose that step's write.
- That the laws above are the laws of a Decider's composition, for children that are named. **Read**, in
  Chassaing's `deciders.fsx` of `github.com/thinkbeforecoding/dddeu-2023-deciders`, which states and tests none. The
  laws are this note's, and the property test holds them.

## Alternatives

- **Every child an entity**, with the protocols it costs: the rule this note's section on where an item goes draws
  the line for.
- **A child as a whole program**, with its own name, indexes and migrations. A child's state would be stored apart
  from its parent's, which makes it an entity, and its migrations would run inside the parent's row, on a version no
  row records.
- **External messages among a child's inbound ones**, as effect-tea counts them among its messages. A caller could
  then send a child what only its parent should.
- **`each` with a function from an id to an optic, and a list of the children**, as effect-tea's `subscribed`. The
  two could disagree, and a child the list misses would hold no work.
- **A child's operations under the tag `<child>`**, with the child's operation inside. One runner would answer for
  every kind of the child's operations, which declare their deliveries apart.
- **A reason of the library's for a child that is not there.** It tells the caller the id it gave, and enters every
  parent's rejection type.
- **A child's key as a tuple**, `[<child>, id, key]`, as effect-tea keeps its subscriptions. A key's name would have
  two shapes, in the types, in `entity_keys` and in `rehearse`'s `pending`. A name reserved for composition keeps one
  shape, and the declaration refuses what would collide.
- **effect-tea's care for ids that come back**, asked of the program. The incarnations exist so that no program has
  to remember attempt numbers, and they cover a child by id as they cover a key.
- **Composition left to the program**, by hand, as before. It works, and every program that splits repeats the
  routing, the wrapping of keys and the lifting of runners, where a mistake is a key two children share.

## Consequences

- `docs/design.md` gains a section on children, and its row on effect-tea's tree changes: children are composed as
  effect-tea composes them, external messages are no inbound ones, and `subscribed` has no counterpart.
- The two diagrams of [`README.md`](../../README.md) show the pieces of a program, which gains children.
- [`examples/cart/cart.ts`](../../examples/cart/cart.ts) holds a child by id for each line.
- `docs/glossary.md` defines a part, a child, a parent, an event raised for a parent, and an external message.
