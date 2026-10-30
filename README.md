# effect-tea-durable

The Elm architecture for long-lived entities on a server: an order, a booking, a job, each addressed by its id,
whose state survives crashes, restarts and deploys. A program is written as in
[effect-tea](https://github.com/fgaudo/effect-tea), with a pure `update`, and tested without a database, a
cluster or a clock.

**This repository holds only a design.** Nothing here runs yet. It has:

- [`docs/design.md`](docs/design.md): what the library is for, its model of execution, and what it guarantees
  at each point where the process may die;
- [`docs/decisions/`](docs/decisions): one note per decision, with the alternatives it rejected;
- [`docs/open-questions.md`](docs/open-questions.md): what is not decided yet;
- [`docs/roadmap.md`](docs/roadmap.md): the steps from this design to a library, in order;
- [`examples/order`](examples/order): an order's lifecycle written against the imagined API
  ([`examples/api.ts`](examples/api.ts), declarations only). The typecheck tells whether the design can be
  expressed; if the example reads badly, the API is wrong.

```sh
bun install
bun run typecheck
```

The name is a working one. The library will be separate from effect-tea, which it shares ideas with but no
code ([decision 0001](docs/decisions/0001-separate-from-effect-tea.md)).

## License

MIT
