# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## 1. Passivation

An entity with no message, no operation under way and only timers armed is unloaded, and the earliest of those
timers wakes it: to the machine, a passivation is a crash the runtime chose
([`docs/design.md`](design.md)). Today a process activates every entity whose state holds work when it starts,
and holds it for as long as it lives ([decision 0028](decisions/0028-rules-the-runtime-settled.md)); the time
of each timer is already stored, in `entity_keys.due`.

## 2. Later

- Projections into read tables, for queries across entities.
- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
