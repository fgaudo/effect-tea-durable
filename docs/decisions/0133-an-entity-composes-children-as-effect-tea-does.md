# 0133. An entity composes children as effect-tea does

**Status:** proposed, for the step Children inside an entity of the [roadmap](../roadmap.md); rewritten in place
while the step is under way. Decides the open question on [children inside an entity](../open-questions.md#programs),
and the row of the table in `docs/design.md`, under Where it departs from effect-tea, that leaves it open.

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
so the machine needs nothing else.

## Decision

The terms below are a draft, rewritten while the step is under way.

- **A parent declares its children as in effect-tea.** `parent`, `child` and `each` in
  [`src/program.ts`](../../src/program.ts) take the shape of effect-tea's: where each child lives in the parent's state,
  and how the parent starts it. They give a program, which `deploy` and `rehearse` take as any other. A child's work
  runs while the child is there, and there is no `subscribed`: effect-tea pauses a child's subscriptions, and an
  operation cannot be paused.
- **A child is part of a program, not a program.** It has a state, flags, messages and operations with their runners,
  and `init`, `update` and `durable`, each with its schema. It has no name, no indexes and no migrations: the entity
  is the parent's, and so are its address, its row of the read model, and the versions of its state. A migration of
  the parent is a function on the JSON of the whole state, the children's included
  ([decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md)).
- **What the library derives.** The parent's inbound messages are its own and each child's, as
  `{ _tag: <child>, message }`, or `{ _tag: <child>, id, message }` for a child by id. A child's sender is the
  parent's, so `meta.from` reaches the child as it reached the parent. The parent's keys are its own and each child's,
  under the name `<child>.<key>`, with the child's id as parameter for a child by id, and the child's own parameter
  beside it. A name with a `.` is composition's: a key or a child a program names with one is refused where the
  program enters ([decision 0054](archive/0054-a-program-is-checked-where-it-enters.md)), so two pieces of work never
  share a name. The parent's internal messages, operations, runners and rejections are its own and its children's,
  wrapped likewise, so a child's reason reaches the caller as the child gave it.
- **A child's rejection rejects the parent's message.** An inbound message the child rejects is answered `Rejected`,
  with the child's reason. An inbound message to a child that is not there is answered `Rejected` too, with a reason
  of the library's that names the child, as effect-tea rejects it. An external message a child rejects is a defect,
  as in effect-tea.
- **A child that leaves the state with an operation under way is a defect**, as a key dropped while its operation runs
  is ([decision 0005](archive/0005-an-operation-leaves-only-by-completing.md)). A child by id that comes back in a
  later step comes back under keys whose incarnations have moved on, so an answer of its earlier run is dropped
  ([decision 0004](archive/0004-incarnations-guard-internal-messages.md)). effect-tea asks a program to mind ids that
  come back, since a command's answer goes to whichever row has its id. Here no program minds them. A child by id
  removed and added again with the same id in one step keeps the work that encodes alike, as any kept key does
  ([decision 0058](archive/0058-work-is-compared-by-what-is-stored.md)).
- **The parent reads its children's projections.** `project` is given each child's projection, computed from the
  child's state. The read model stays one row for the entity, so a query across children is a query of the parent's
  indexes.
- **The laws of composition are tested.** A parent with one child and nothing of its own does what the child does: on
  a sequence of the child's messages, each wrapped, it reaches the child's state where the optic puts it, holds the
  child's work under the wrapped keys, and projects what the child projects. A child of a child does what it does as a
  child of the parent, up to its messages and keys being wrapped twice. A property test in
  [`src/program.test.ts`](../../src/program.test.ts) checks both, as the machine's properties check what an event
  writes. The Decider pattern (Jérémie Chassaing's `Decider`) states the laws of its own composition, which is binary
  and nameless where effect-tea's names each child, and is read before the step writes them, although it stores the
  events where this design stores the state ([decision 0002](archive/0002-store-the-state-not-the-messages.md)).

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
  runners by tag. **Only reasoned**, on [decision 0132](0132-a-key-may-take-a-parameter.md) and the type of `Program`
  in [`src/program.ts`](../../src/program.ts). The compiler and the laws above will test it.
- That effect-tea's composition carries over where nothing is stored. **Documented**, in the Guide of effect-tea,
  under Composition.
- That the Guide's rules on splitting a program hold of a state that is stored. **Only reasoned**: a parent that never
  reads a child's state to decide loses nothing when the two are stored in one row, and a step of the parent is a
  step of the child, as in effect-tea.
- That the laws of a Decider's composition are the laws a composition of programs keeps, for a program whose state is
  stored. **Only reasoned**. The step reads the Decider before it writes the laws.

## Alternatives

- **Every child an entity**, with the protocols it costs: the rule this note's section on where an item goes draws
  the line for.
- **A child as a whole program**, with its own name, indexes and migrations. A child's state would be stored apart
  from its parent's, which makes it an entity, and its migrations would run inside the parent's row, on a version no
  row records.
- **A child's key as a tuple**, `[<child>, id, key]`, as effect-tea keeps its subscriptions. A key's name would have
  two shapes, in the types, in `entity_keys` and in `rehearse`'s `pending`. A name reserved for composition keeps one
  shape, and the check refuses what would collide.
- **effect-tea's care for ids that come back**, asked of the program. The incarnations exist so that no program has
  to remember attempt numbers, and they cover a child by id as they cover a key.
- **Composition left to the program**, by hand, as today. It works, and every program that splits repeats the
  routing, the wrapping of keys and the lifting of runners, where a mistake is a key two children share.

## Consequences

- `docs/design.md` gains a section on children, and its row on effect-tea's tree changes: children are composed as
  effect-tea composes them, and `subscribed` has no counterpart.
- The two diagrams of [`README.md`](../../README.md) show the pieces of a program, which gains children.
- [`examples/order/order.ts`](../../examples/order/order.ts), or a new example, holds a child by id for each line.
- `docs/glossary.md` defines a child and a parent.
