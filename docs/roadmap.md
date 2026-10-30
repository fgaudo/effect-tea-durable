# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## 1. A runtime on SQLite

One process, on `SqlClient`: a transaction per message, timers stored in the database, an entity suspended on
a defect ([decision 0007](decisions/0007-one-process-first.md)). Its tests inject a crash at every point of the
crash table, under random sequences of events, and compare where the runtime ends with where the pure machine
([`src/machine.ts`](../src/machine.ts)) ends. The runtime interprets the machine's outputs
([decision 0013](decisions/0013-the-runtime-is-a-pure-machine.md)).

## 2. Later

- Projections into read tables, for queries across entities.
- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
