# 0117. A joined fiber outlives its joiner, by Effect's site

**Status:** accepted, 2026-11-02. Changes what [decision 0107](0107-what-effect-documents-of-the-premises.md) says of a
premise of [decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) and
[decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md): that a joiner interrupted leaves the fiber it
joined running is documented by effect.website, not by the JSDoc of the version pinned.

## Context

Decision 0107 read the JSDoc of `effect` 4.1.1 for the premises of the notes, and found this one not documented:
`Fiber.join` says only that it waits for the fiber. The runtime relies on it where a caller sets work going and stops
waiting: the work runs in a fiber forked by `forkIn` into the deployment's scope, and goes on when its caller is
interrupted (decision 0079).

The premise was to be put to Effect, in an issue that asks for documentation. Looking for it in the rest of Effect's
documentation first found it said, in other words. Effect documents what ends a fiber, by how it was forked, and
joining is not one of them:

- the JSDoc of `forkDetach`: the fiber "continues running until it completes or is explicitly interrupted through the
  returned handle";
- the Fibers page of effect.website for v4, *Lifetime of Child Fibers*: a fiber forked by `forkScoped` or `forkIn` is
  "terminated when they complete or their local scope is closed", and one forked by `forkChild` when its parent ends;
- the JSDoc of `forkIn`: the fiber "will be interrupted when the scope is closed", without saying that nothing else
  interrupts it.

The premise as the issue put it was wrong besides. A parent that joins a child forked by `forkChild`, and is
interrupted, ends, and its child with it. `join` does not interrupt the child; the parent's end does.

## Decision

- **That a joiner interrupted leaves the fiber it joined running is documented by effect.website**, for the fibers
  the runtime forks, by `forkIn` into a scope: such a fiber ends when it completes, is interrupted through its handle,
  or its scope closes. For `forkDetach` it is documented by the JSDoc of 4.1.2 too.
- **It is not documented by the JSDoc of the version pinned for `forkIn`**, which is where
  [decision 0108](0108-a-premise-about-a-dependency-is-looked-up-in-its-documentation-first.md) looks first. The site
  is written apart from the JSDoc, and is not tied to a release.
- **The premise is not put to Effect.** The lifetime of a fiber is documented by how it was forked, and joining adds
  nothing to it. What is missing is a word, "only", in the JSDoc of `forkIn`.
- **`scripts/compare-docs.ts` keeps the forks and `Fiber.join` as `undocumented`.** The script compares the JSDoc, not
  the site, and lists what the JSDoc of a stable declaration does not promise
  ([decision 0116](0116-effect-moves-to-4-1-2.md)). A promise added to the JSDoc of `forkIn` is what it would show. A
  comment beside them names the page of the site.

## What it rests on

- What the site says: **documented**, the page `docs/v4/concurrency/fibers.mdx` of `Effect-TS/website` on `main`, read
  on 2026-11-02, served at https://effect.website/docs/v4/concurrency/fibers/#lifetime-of-child-fibers.
- What the JSDoc says: **documented**, `Effect.ts` of `effect` 4.1.2, `forkIn`, `forkScoped`, `forkDetach` and
  `forkChild`, and `Fiber.ts`, `join`.
- That a joiner interrupted leaves the fiber it joined running, when it is forked by `forkIn`: **seen**, by the spike
  `a joiner that is interrupted stops waiting, and the fiber it joined runs to its end` in
  `spikes/effect-uninterruptible-fork.test.ts`, at 4.1.2.
- That a parent's end ends a child forked by `forkChild`: **documented**, the JSDoc of `forkChild` at 4.1.2.

## Alternatives

- **Asking Effect to document that `join` does not interrupt the fiber it joins.** The sentence is false for a parent
  that joins its own child, and what is true is already the model the site documents.
- **Taking the forks off the script's list**, as a stable promise is. The promise is on the site, not in the JSDoc the
  script reads, and the site is not tied to a release.

## Consequences

- A review reads this premise again in the JSDoc of the version pinned then, as decision 0108 asks of one only seen.
