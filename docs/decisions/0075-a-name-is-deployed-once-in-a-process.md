# 0075. A name is deployed once in a process

**Status:** accepted, 2026-10-31. Decides [deploying a program twice in one process](../open-questions.md#running). When
a deploy gives its name back is corrected by
[decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md).

## Context

`deploy` of a name already deployed replaced the deployment in the runtime's map, and left the first one running:
its entities kept their loops, operations and timers, and its handle still reached them. The second deployment
activated the same entities again, from what is stored, and two loops could step one entity, each with its own
machine: two writers of one row, which every rule of the runtime assumes never happens. The open question asked
whether a second deploy is refused, or is how a new version takes over in place.

A fix is a deploy ([decision 0064](0064-the-program-is-not-the-machines-state.md)), and taking over in place would
let an operator bring one without a new process. It would have to stop the first deployment's entities, close its
scope, which drops the callers waiting on them unanswered, make every handle of the first reach the second, and
interrupt the operations under way, a crash nobody suffered: an at-most-once operation delivers its `unknown`
([decision 0011](0011-an-operation-declares-what-a-crash-does.md)). That is a rolling deploy inside one process,
which is what Effect Cluster does across processes, a node at a time, and where it belongs
([roadmap](../roadmap.md)).

## Decision

- **A process deploys a name once.** A deploy of a name this process has deployed, or is deploying, dies as the
  deployer's defect, where a program that cannot run as written dies
  ([decision 0054](0054-a-program-is-checked-where-it-enters.md)): before anything is stored or run.
- **The name is claimed in the step that checks it**, before the deploy reads or activates anything, so two deploys
  of one name at once cannot both pass. **A deploy that fails gives it back**, as it leaves nothing running
  ([decision 0051](0051-a-deploy-that-fails-leaves-nothing-running.md)), and the program can be deployed again.
- **A new version, a fix included, is deployed by a new process.** The old one is stopped, a crash of all it
  holds, which the crash table covers, and the new one activates what is stored.

## Alternatives

- **A second deploy taking over in place**, unloading what the first one holds. A rolling deploy within a process,
  with the costs above, for what restarting the process gives, and what Effect Cluster gives without a restart.
- **A second deploy answered with the first one's handle.** It would hide that the program given was not the one
  running, which is the confusion [decision 0064](0064-the-program-is-not-the-machines-state.md) removed.

## Consequences

- Two programs of one name never run in one process, so the entities' locks, their loops and the waiting callers
  belong to one deployment each.
- Resuming a suspended entity with a fixed program still needs a new process, then `resume`.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) deploys a program twice at once, under every budget of steps,
  and once more after: one deploy is made, and the others die. A deploy that failed is followed by one that is
  made.
