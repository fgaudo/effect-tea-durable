# 0264. A launch that dies gives back what it held

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 44. It changes
[decision 0208](0208-a-launch-checks-every-option.md): every option is checked before the database is held, and a
launch that dies after the hold gives the database back with its own scope.

## Context

Decision 0208 says a launch refused for an option dies before anything is held or stored. `launchWith` of
[`src/runtime.ts`](../../src/runtime.ts) checked `log`, `tables` and `renames` first. It then held the database
([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)), created the tables
([decision 0191](0191-a-launch-creates-the-tables.md)), stored the partitions of the log and moved the renames
([decision 0156](archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). Only then did it check
`callers`, `drain`, `retry`, `passivate`, `warn`, `sweep` and `capacity`.

The hold lies in the runtime's own scope, which is a child of the scope the launcher gives, and nothing closed the
runtime's scope when the launch died. So a launch refused for its `retry` had already moved its renames, and kept the
database held until the launcher's scope closed. A launch again in that scope was refused, as held by another
runtime. That is bug 44.

Three deaths cannot move before the hold, since each reads the database. A launch dies where the log stores another
number of partitions, where a rename moves onto a name that holds an entity, and where the hold itself is refused.
A refused hold has already claimed the client in this process, and on PostgreSQL it has reserved a connection of the
pool. The maintainer chose on 2026-11-11, after the opinion of a Fable 5.2 agent, both of the fixes below.

## Decision

- **Every option is checked before the database is held.** The checks read only the options, and `checkedOptions` of
  `src/runtime.ts` holds them all. A launch refused for an option holds nothing, and stores nothing, as decision 0208
  says.
- **A launch that dies or is interrupted closes its own scope.** Closing that scope gives the database back, the
  reserved connection included, and stops what the launch forked, such as the reader of Cluster's version. So no
  launch that died keeps anything held in the scope its launcher gave, and a launch again in that scope runs.
- **A launch that succeeds leaves its scope open**, as before, and the scope still closes with the launcher's.

## What it rests on

- That a launch refused for any of the seven options checked after the hold moves no rename, and that a launch in the
  same scope then runs: **tested** by `a launch refused for an option holds nothing and moves no rename`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). It fails against the code before the change.
- That a launch that dies for the partitions stored, or for a rename onto a name that holds an entity, gives the
  database back to a launch in the same scope: **tested** by `a launch that dies for the partitions stored gives the
  database back` and `a launch that dies for a rename onto a name that holds an entity gives the database back`, in
  `src/runtime.test.ts`. Both fail against the code with the checks moved and the scope left open.
- That a launch refused by a file of SQLite another client has open gives the file back: **tested** by `a launch
  refused by a file another client has open gives the file back`, in `src/runtime.test.ts`. It fails against the
  code before the change.
- That a launch refused by the lock of another runtime on PostgreSQL gives the database back: **tested** by `a launch
  refused by another runtime’s lock gives the database back, in the scope its launcher gave`, in
  [`src/postgres.test.ts`](../../src/postgres.test.ts), on the CI's server.
- That `Effect.onExit` runs its cleanup when the effect succeeds, fails or is interrupted: **documented** in its
  JSDoc, at Effect 4.1.3.
- That `Scope.close` runs the finalizers of a sequential scope in the reverse order of their adding: **documented**
  in its JSDoc, at Effect 4.1.3, which says they run in the scope's order and shows that order in its example. So the
  scope stops what the launch forked before it gives the database back, as decision 0080 has it.
- That a launch should give back what it held rather than leave it to the launcher's scope: **chosen**, by the
  maintainer.

Of the premises of decision 0208, the one that every option is read only from the options the launch checks still
holds, since `checkedOptions` gives each value the process holds. The premise about how Effect reads a duration is
not touched.

The decision leaves out two cases, each an [open question](../open-questions.md#running). A launch that dies for a
rename has already created the tables and stored the partitions of the log, since the three are not one transaction.
And a launch interrupted on Cluster after it forked the reader of the version is held by `onExit` alone, with no test
that reaches the interruption there.

## Alternatives

- **Only the checks move before the hold.** It keeps the promise of decision 0208 for the options. But a launch that
  dies for the partitions stored, for a rename or for a refused hold would still keep the database held in the
  launcher's scope.
- **Only the scope closes when the launch dies.** It gives the database back in every case. But a launch refused for
  an option would still have moved its renames, against decision 0208.
- **The launch runs in a scope of its own, closed by `Effect.scoped`.** It would close the scope on success too, and
  the runtime would end as the launch returns.
