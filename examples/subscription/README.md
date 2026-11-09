# A subscription

A subscription billed every month, in advance, for as long as the customer keeps it. It shows a **timer** that
repeats: the state of each period holds the timer of the next renewal, so the timer is armed again by the step that
pays the period. A period is paid from the account's credit when the credit covers the price, and charged otherwise.
A declined charge is tried again behind a timer, and the state counts the attempts, so the third decline cancels the
subscription. A change of plan or of payment method during a charge applies from the next one.

- [`subscription.ts`](subscription.ts): the program.
- [`scenarios.test.ts`](scenarios.test.ts): the subscription's scenarios, rehearsed, a restart among them.
- [`subscription.test.ts`](subscription.test.ts): the subscription's properties, checked for generated states.
