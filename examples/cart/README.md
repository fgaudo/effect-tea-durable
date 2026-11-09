# A cart

A cart whose lines reserve their stock. It shows **children**: each line is a child by id, declared as a part, with
its own state, messages and work, kept inside the cart's state. The cart starts a line when an article is added, and
tells every line of the checkout in the step that takes it. A line decides its own removal: it releases its stock,
and then tells the cart that it is gone. The cart never reads a line's state to decide.

- [`cart.ts`](cart.ts): the cart, the parent.
- [`line.ts`](line.ts): a line, the child.
- [`scenarios.test.ts`](scenarios.test.ts): the cart's scenarios, rehearsed, each line addressed by its id.

The guide's page on [children](../../docs/guide/children.md) is written on this example.
