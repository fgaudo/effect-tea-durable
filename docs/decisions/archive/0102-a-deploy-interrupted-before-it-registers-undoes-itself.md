# 0102. A deploy interrupted before it registers undoes itself whole

**Status:** accepted, 2026-11-01. Corrects [decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)
on what a deploy interrupted before it registers leaves, and makes [decision 0051](0051-a-deploy-that-fails-leaves-nothing-running.md)
hold of an interruption too. Found by the review of 0076 to 0079. With a drain, the undo waits for the deployment's
at-most-once operations before it closes the scope, by
[decision 0280](../0280-the-undo-of-a-deploy-drains-its-deployment.md).

## Context

A deploy claims its name, activates the entities a crash interrupted, then registers its deployment with its waker in
one step that an interruption does not split ([decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)).
What it undid when it failed was in two places. The name was given back by a handler installed after the claim, in a
later step, if the deployment was not registered. The deployment's scope was closed, and what it loaded taken out of
the order of use, by a handler around the activations alone.

An interruption could fall outside both, and the review's test of a deploy interrupted at every point, under small
budgets of steps, reached each case:

- **Between the claim and the handler that gives the name back.** The name stayed claimed with no deployment: every
  later deploy of the program was refused, and nothing of it ran, for the life of the process.
- **After the activations, before the registration.** The name was given back, and the deployment's scope left open:
  the entities it had activated ran on, unreachable, and a second deploy activated them again. Each operation the
  crash had interrupted ran twice at once in one process, and each timer of those entities fired twice.

[Decision 0051](0051-a-deploy-that-fails-leaves-nothing-running.md) said that a deploy that fails leaves nothing
running, and was tested with a failure inside the activations, the one place both handlers covered.

## Decision

- **The claim of the name, the deployment's scope and what undoes them are made in one step**, which an interruption
  does not split; the rest of the deploy runs interruptible inside it.
- **A deploy that fails before its deployment is registered undoes all of it**, whatever fails and wherever,
  interruption included: its scope is closed, which stops what it started, what it loaded leaves the order of use,
  and the name is given back. One that fails after keeps all of it, with its deployment, as 0078 says.

## What it rests on

- An interruption inside an `uninterruptible` region lets the region end, and stops the fiber before its next step;
  a fiber forked inside one is interruptible, and its scope stops it: **seen**, in
  `spikes/effect-uninterruptible-fork.test.ts`, at `effect` 4.1.1. `uninterruptibleMask` restores the
  interruptibility of the region it was called in for what `restore` wraps: **documented**, in `Effect.ts`.
- A deploy interrupted at any point either keeps its name with a deployment that runs its entities' work once and
  fires their timers, or leaves nothing running and its name free: **tested**, by
  `a deploy interrupted anywhere keeps its name and its waker, or stops what it started`, in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts), which interrupts a deploy after 0 to 180 yields under budgets
  of 3 to 6 steps. Against the code before this note it fails at six points: two left the name with no deployment,
  four ran the entity's operations twice.
- The points the test reaches are every point where an interruption is seen: **reasoned**. A fiber sees an
  interruption where it yields, and a budget of 3 yields after every few steps; the yields of the test move the
  interruption across each of them, up to the end of the deploy, which 180 yields pass under each budget.

## Alternatives

- **Closing the scope in the handler that gives the name back, installed where it was.** The claim and the handler
  would still be two steps, and an interruption between them would keep the name.
- **Making the whole deploy uninterruptible.** A caller could not give up a deploy that waits on a slow database, and
  a process that ends would wait for it.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) claims the name and forks the deployment's scope in `deploy`, inside
  `uninterruptibleMask`, and `deploying` takes the deployment made there.
- What [decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) said no test
  reaches, an interruption between a deploy's registration and its end, the test above reaches, and so it reaches the
  region that registers: taken out, a deployment is registered with no waker, whose reading of the stored timers
  never comes, and the process never settles.
