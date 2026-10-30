# 0037. The machine checks the declared keys

**Status:** accepted, 2026-10-30.

## Context

A program declares every key it holds work under, and `durable` returns work under those and no others
([decision 0033](0033-a-program-declares-its-keys.md)). The types catch a misspelt key only where the state
holds that key alone: a record of optional keys shares none of them, so `{ charg: op }` does not typecheck,
while `{ charge: op, charg: op }` does — the declared key satisfies the type, and the extra one rides along.
Such a key is new work under its own idempotency key, and the key the state no longer holds ends its work:
an operation would run twice, and nothing would say so. Decision 0033 left the machine unchanged and
[asked](../open-questions.md) whether it should close this.

## Decision

- **The machine reads `keys`.** Wherever it calls `durable`, it checks the keys of what came back against the
  ones the program declares, and a key the program does not declare is a defect, with its name in the reason.
- The check is on **every key the record holds**, whether or not it holds work: a key `durable` returns at all
  is a key the program uses, and a misspelt one is found at the first state that names it rather than the first
  state that holds work under it.
- It is a rule of the machine, so it falls where the other checks of a state fall
  ([decision 0014](0014-rules-the-machine-settled.md)): at a creation nothing is stored, at a step the entity is
  suspended with the state and the mailbox as they were, and at an activation it stays as it was, suspended on
  the activation. A deploy whose program drops a key it still holds work under is already a defect, in the same
  place ([decision 0022](0022-a-new-program-keeps-what-work-started-with.md)).

## Alternatives

- **The types alone**, as decision 0033 left it. It costs nothing and misses the state that holds a declared key
  beside a misspelt one, which is the case worth catching: the others do not compile.
- **Checking only keys that hold work.** A misspelt key whose work is `undefined` would pass, and be found later,
  on the state that fills it — the same mistake, reported further from where it was written.
- **A total record, one entry per key.** Rejected in decision 0033: it makes every state name every key.
- **The runtime checking it instead**, outside the machine. The rule would not be in `rehearse`, and the
  machine is where the rules of a step live ([decision 0013](0013-the-runtime-is-a-pure-machine.md)).

## Consequences

- `keys` is no longer data the machine does not read, which decision 0033 noted it was.
- A program whose `keys` do not cover what `durable` returns is caught by a rehearsal, at the first state that
  returns the key, and never reaches a deploy.
- A state stored by a version that declared a key the next version does not is read by a program that does not
  declare it. If it still holds work there, the activation is a defect twice over, for the undeclared key and
  for the dropped operation; the reason names the key, which an operator needs either way.
