# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## 1. Projections into read tables

Queries across entities — "orders unpaid for a day" — cannot be asked of stored states, which are read one id at
a time. A pure function from the state to rows of a read table, written in the step's transaction, would answer
them; how those tables are declared and migrated is an [open question](open-questions.md).

## 2. Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
