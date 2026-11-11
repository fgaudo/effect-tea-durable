# 0200. A rehearsal sends under a request id the test names

**Status:** accepted, 2026-11-08. Changes the surface of a rehearsal that
[decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) gives a member of a world and
`rehearse` gives its entity: `send` takes a request id. A second send under the same sender and request id that
carries another message is answered `Reused`, by [decision 0269](0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md).

## Context

A rehearsal's `send` gave each message a new request id. So a scenario could not show a caller's retry, which is
the same message sent again under the same request id, answered from the stored reply and applied once. The runtime
keeps that promise ([decision 0048](archive/0048-a-callers-request-belongs-to-its-sender.md)), and the library tests
it.

A program's author still wants to rehearse it. The reader who checked the guide was given a turnstile that sends the
same entry twice, and could write that scenario only on the runtime, with a database. The scenario also shows the
rule a boundary follows: the same entry under a new request id counts twice, so the turnstile's request id must be
derived from the entry. A rehearsal reads as the use case does, retries included, as the README says of scenarios.

## Decision

- **`send(message, sender, { requestId })` sends under a request id the test names.** A second send under the same
  sender and request id is a retry. It is given the reply stored for the first, `Accepted` or `Rejected` with its
  reason, and the message is not applied again. A request id is its sender's, so two senders' requests under one id
  are two requests.
- **The reply is kept for the whole rehearsal.** A restart and a deploy keep it, as the runtime keeps a reply sent
  without `keep`. A rehearsal takes no `keep`, so a retry past a reply's time is tested on the runtime.
- **`send` without a request id is a new request, as before.** It draws an id that no request the test named has,
  so its reply is not kept and no named request finds it.
- **A member of a world sends the same way**, since it shares the acts of `rehearse`.

## What it rests on

- That the machine answers a receive given a stored reply with that reply, and applies nothing: **tested** by
  `answers a retry under the same request id from the stored reply, and applies the message once` and
  `answers a retry with the rejection stored, once the state would accept the message` in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts). The machine's properties test it too, where a receive given
  its reply is the runtime's retry ([decision 0065](archive/0065-the-machine-holds-no-replies.md)).
- That the replies a rehearsal keeps outlive a restart and a deploy: **tested** by
  `keeps the reply across a restart and a deploy` in the same file.
- That a drawn id never meets a named one: **tested** by
  `gives a send without a request id no reply of a named request, whatever id it draws`, which fails when the draw
  does not skip the ids the test named.

## Alternatives

- **No request id in a rehearsal, and a retry tested on the runtime only.** It is what the guide said. It costs a
  database for a scenario of the program's domain, and the guide's reader took it for a gap.
- **Keeping every reply, a drawn request's included.** A request id the test names, such as `request-2`, could then
  meet a drawn one, and a new message would be answered as a retry. Keeping only the named requests' replies avoids
  it.
- **`keep` in a rehearsal, expiring a reply as time passes.** A rehearsal has a time and `advance`, so it could. No
  scenario asked for it, and the expiry is the runtime's, which its tests hold
  ([decision 0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)).

## Consequences

- The design says under Rehearsing that `send` takes a request id, and the guide rehearses a retry of the rental.
