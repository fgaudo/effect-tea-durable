# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## 1. The open questions that shape the API

Decide only those that change how a program is written:

- whether a rejection carries a reason (the booking's `Unavailable` is the case to answer);
- how an operation says, in its type, whether it is idempotent or accepts acting twice;
- what creating an entity that exists answers.

The others (queries across entities, two versions at once, suspended entities, Cluster) change the runtime,
not a program, and wait.

## 2. The pure core

The first code that runs: the types of a program, `reject`, `defect`, and the checks of a step (an operation's
key dropped before its completion is a defect).

The runtime's semantics are written as **a pure state machine**. Its state is the entity's state, the
incarnations, the mailbox, the stored replies and the work under way. Its events are a message arriving, an
operation completing, a timer firing and the process dying. It is three things at once:

- the executable form of the crash table in [the design](design.md#what-survives-a-crash);
- the engine of `rehearse`, which is this machine with no storage;
- the oracle of the real runtime's tests (step 3).

Tested with property tests: for random sequences of events, crashes included, every guarantee of the design
holds.

## 3. A runtime on SQLite

One process, on `SqlClient`: a transaction per message, timers stored in the database, an entity suspended on
a defect ([decision 0007](decisions/0007-one-process-first.md)). Its tests inject a crash at every point of the
crash table, under random sequences of events, and compare where the runtime ends with where the pure machine
of step 2 ends.

## 4. Later

- Projections into read tables, for queries across entities.
- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
