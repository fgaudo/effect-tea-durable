# 0064. The program is not the machine's state, and a fix is a deploy

**Status:** accepted, 2026-10-31. Decides [a fixed program brought by `resume`](../open-questions.md#running). Deploying
a program twice in one process, which it leaves open, is decided by
[decision 0075](0075-a-name-is-deployed-once-in-a-process.md): a process deploys a name once.

## Context

`Machine` held its program, and `Restart` and `Resume` could replace it. The runtime replaced only the program of
the machine it held: the runners that started the operations, the schemas the storage wrote with and the program
that activated the entity again after an unload were still the deployed one's. A fix brought by `resume` with
other runners or another version of its schemas was not run or written as itself, and an entity unloaded after it
came back under the program that died on it. The machine and the runtime saw two programs, and nothing said which
one ran.

## Decision

- **`step` and `start` take the program as an argument**, and a machine is what is stored and what runs, nothing
  else. Every event is stepped by the program that runs the entity: in the runtime, the deployed one.
- **A deploy is a `Restart` stepped by another program.** The events carry no program: `Restart` activates the
  entity by the program it is stepped by, and checks it against the stored work as before
  ([decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md)).
- **A fix is a deploy, and the resumption follows it.** `Resume` takes no program, and neither does the runtime's
  `resume`: an operator deploys the fixed version, which the suspended entity stays suspended through, storing
  nothing, and then resumes it. `rehearse` does the same with `deploy` and the events after it.

## Alternatives

- **Storing the program an entity runs.** A program is code, and what a storage can hold of it is a version, which
  does not tell two programs of the same schemas apart. The version that wrote each row is already stored, and a
  row no version reads fails what reads it ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)):
  that is what the stored entity says of the version that runs.
- **Keeping a fix in the runtime, for one entity.** It would hold until the process dies, and the next one would
  activate the entity by the deployed program again, which is the defect this decision removes.

## Consequences

- An entity runs by one program at a time, the same in the machine and in the runtime: its operations are started
  by the runners that admitted them, and the runtime treats an operation with no runner as its own bug.
- Resuming with a fix needs a deploy, which on one process is a new process: deploying a program twice in one
  process is still an [open question](../open-questions.md#running).
