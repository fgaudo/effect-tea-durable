# 0099. A library on unstable modules is released as experimental

**Status:** accepted, 2026-10-31. Decides what [decision 0019](0019-unstable-effect-modules.md) asked again for when
the library gets a name.

## Context

The runtime uses Effect's `effect/sql`, and will use `effect/cluster`, which are `@stability unstable`
([decision 0019](0019-unstable-effect-modules.md)): their API may change in a minor release. 0019 took them for an
experiment, and left whether a published library may depend on them to the step that names it. The review of 0016 to
0030 found the question asked nowhere else, and the author answered it.

## Decision

- **The library is released**, under its name, while it depends on unstable modules.
- **It is released as experimental**, and not for production: what it publishes says so, plainly, beside the
  modules it depends on and the version of Effect it pins.
- **It is called stable only once every module of Effect it depends on is.**

## What it rests on

- `effect/sql` and `effect/cluster` may change in a minor release of Effect: **documented**, by their
  `@stability unstable` tags at 4.1.1.
- A library cannot promise more stability than what it is built on: **reasoned**. An Effect release that changes
  them changes the runtime, and may change what a user's deployment stores or answers.

## Alternatives

- **Not releasing until the modules are stable.** Nobody could use the library, or tell the design what it gets
  wrong, until Effect's schedule allowed it.
- **Releasing it as stable, and following Effect's changes.** A user would read a promise the library could not
  keep: a minor release of Effect could break it.

## Consequences

- The roadmap's step that names the library releases it with the disclaimer.
- A module that becomes stable is not enough: the disclaimer goes when the last one does, by a note of its own.
