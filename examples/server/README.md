# A server

The orders of [the order](../order/README.md) served over HTTP by a runner of Effect Cluster, as a process of its
own on a file of SQLite. The boundary takes the request id from the header `Idempotency-Key` and the sender from
`Authorization`. The world the orders act on is a server of its own, which charges once per idempotency key, as a
payment provider does. The tests start the runners as processes and kill them: an order whose runner is killed
during its charge is paid once, by the runner started again on the same file. With two runners, the one that
survives finishes the orders of the one killed.

- [`server.ts`](server.ts): the runner's layer and the boundary's routes.
- [`main.ts`](main.ts): the process, configured by its environment.
- [`server.test.ts`](server.test.ts): the processes started, killed and started again.

The guide's page on [Effect Cluster](../../docs/guide/cluster.md) shows this server.
