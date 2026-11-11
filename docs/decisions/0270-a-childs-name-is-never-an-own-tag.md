# 0270. A child's name is never an own tag

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 8. It changes
[decision 0133](archive/0133-an-entity-composes-children-as-effect-tea-does.md): the compiler refuses an own message,
reason or operation whose `_tag` may be a child's, and the composed schemas try a child's wrapper before the own
schema. It applies to tags what [decision 0199](0199-a-list-of-keys-names-each-key-by-a-literal-type.md) decided for
keys: a type that widens past the names it must keep apart does not compile.

## Context

A parent's messages, operations and reasons are its own and each child's, wrapped
([decision 0133](archive/0133-an-entity-composes-children-as-effect-tea-does.md)). A child's message is
`{ _tag: <child>, message }`, with `id` for a child by id. A child's operation is tagged `<child>.<tag>`, and a
child's reason is `{ _tag: <child>, reason }`. `update` routes a message whose `_tag` is a child's name to that child.

The compiler alone kept an own message from taking a child's name. `Checks` of `src/program.ts` refused an own
message whose `_tag` was the child's name as a literal, by `Extract` of the tags. So an own message whose `_tag` is
typed `string` passed, as did a message with no `_tag`, a record, and every own reason and operation, which `Checks`
did not read. This is bug 8 of the roadmap, and it loses more than the routing:

- **The routing.** An own message typed `{ _tag: string }`, sent with a child's name, reaches the child's `update`
  and not the parent's.
- **The composed schemas.** Each composed schema is `Schema.Union` of the own schema, first, and each child's
  wrapper. A union takes its first member that fits, so an own member with a tag typed `string`, or with no tag,
  takes a child's wrapper and drops the fields the wrapper adds. A caller's message to a child is stored without
  `id` and `message`, and so is a child's internal message, a child's operation and a child's reason.

## Decision

- **A child's name is composition's, as a name with a `.` is.** No value of a parent's own messages or reasons has
  a child's name as its `_tag`, and no value of its own operations has a tag `<child>.<tag>`.
- **The compiler refuses an own schema that may hold such a value.** `TakenBy` of `src/program.ts` gives the
  children's names that a value of an own type may carry as its `_tag`. A member whose `_tag` is `string`, a template
  that reaches the name, or the name itself takes it. So does a member with no `_tag` in its type that a value tagged
  with the name still is, as `unknown` or a record. A member with no `_tag` that requires another field, as
  `{ id: string }`, or a reason that is a string literal, takes none, and compiles. `Checks` refuses a parent's own
  messages, its own reasons and its own operations by `TakenBy`, each with a property that names what it refuses.
- **The composed schemas try each child's wrapper first.** A wrapper's `_tag` is a literal, so a value tagged with a
  child's name and that fits the wrapper is the child's, whatever the own schema takes.
- **The own schema refuses a value tagged as a child's.** In a composed schema the own member is checked by a filter
  that refuses a value whose `_tag` is a child's name, or `<child>.` and more for an operation. A value that the
  compiler did not see, through a cast or a schema whose type is wider than it says, fails where it is encoded or
  decoded, with a message that names the tag. It is never stored without its fields, and never routed to the child.
- **A parent with no children is unchanged.** Its schemas are its own, with no union and no filter, and any `_tag`
  compiles.

## What it rests on

- That `Schema.Union` of the pinned Effect takes, in encoding and in decoding, the first member that fits, so that a
  wrapper placed first keeps its fields and an own member placed first drops them: **tested** by `a child's message
  keeps its wrapper beside an own message whose tag is typed string (decision 0270)` and the three tests after it,
  in [`src/composition.test.ts`](../../src/composition.test.ts). Each failed with the own member first, as
  `test.failing` in commit `e77dc1f`, and passes with the wrappers first.
- That a filter of `Schema.makeFilter` on a member of a union runs in encoding and in decoding, and makes the union
  fail where no other member fits: **tested** by `an own value tagged as a child's, which no wrapper takes, is
  refused by the composed schemas (decision 0270)`, in [`src/composition.test.ts`](../../src/composition.test.ts).
- That `TakenBy` refuses a tag typed `string`, a template that reaches a child's name, a record, an own reason named
  like a child and an own operation typed `string`, and lets through a reason that is a literal, a message with no
  tag that requires a field, and a template of other names: **tested** by `an own message, reason or operation whose
  tag may be a child's does not compile (decision 0270)`, in [`src/composition.test.ts`](../../src/composition.test.ts),
  whose `@ts-expect-error` lines `bun run typecheck` checks. A run of the compiler with `TakenBy` set to `never` found
  each of them unused.
- That an own schema of a program that compiles today seldom has a `_tag` wider than its literals beside children:
  **chosen** by the maintainer, on 2026-11-12, who asked for the rule that holds in general. A parent with such a
  schema stops compiling. None of the examples and fixtures has one, as `bun run typecheck` shows.

## Alternatives

- **Only literal tags beside children**, as decision 0199 does for keys. It refuses a template that reaches no
  child's name, and it leaves out the reasons and the members with no tag.
- **The compiler alone.** A cast, or a schema whose type is narrower than what it decodes, would still drop a
  child's fields in silence. A loss in silence does not rest on a type alone where a guard of the library's is cheap.
- **A probe at the declaration**, which checks that the own schema refuses `{ _tag: <child> }`. It misses an own
  member with no tag that takes a wrapper by its other fields, as `{ id: string }` beside a child by id.
- **A discriminator of the children's own**, apart from `_tag`. It changes the form of every stored message and
  departs from effect-tea's Guide, which wraps a child's message as `{ _tag: <child>, message }`. An own record would
  take the new field as it takes `_tag`, so the same check would be needed.
- **Routing by the schema a message was decoded under.** The messages that the library wraps itself, a child's
  timers and an operation's answers, reach `update` without passing a decoder.

## Consequences

- Bug 8 of the roadmap is fixed. Its tests in `src/composition.test.ts` are `test`, named by this decision.
- A deploy that adds a child named like an own tag of messages still stored is left out. A stored own message so
  tagged fails to decode once the new version holds the child. It is in the
  [open questions](../open-questions.md#programs), with the step What a deploy may change of a program.
