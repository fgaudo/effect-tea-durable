# A booking

A booking of seats for an event, held in the event's inventory and confirmed before a deadline. It shows two
**entities that talk**: the booking's operation sends a request to the inventory, and the booking acts on the
reply. A booking cancelled or expired once its seats are held releases them. The scenarios rehearse each entity
alone, answering for the other, and then both together in one world. The runtime test runs both in one database.

- [`booking.ts`](booking.ts): the booking.
- [`inventory.ts`](inventory.ts): the seats of an event.
- [`scenarios.test.ts`](scenarios.test.ts): the scenarios of each, and of both together, rehearsed.
- [`booking.test.ts`](booking.test.ts): the booking's properties, checked for generated states.
- [`runtime.test.ts`](runtime.test.ts): the booking and its inventory on the runtime.
