# Meters fed by a stream

Electricity meters fed by a stream of their readings, as a partition of Kafka gives them. The boundary reads each
reading from the source, sends it to its meter under a request id derived from its offset, and acknowledges it only
once the meter stored its answer, `Accepted` or `Rejected`. A meter answered `Suspended` or `Full` is sent the
reading again, a meter answered `NotFound` is created at its first reading, and a reading answered `Reused` stops
the feed. The meter keeps the offset of the last reading applied, and rejects a reading the source gives again, so a
crash before an acknowledgement counts nothing twice, after the reply's keep too. A first version of the meter dies
on a meter replaced, and the feed waits at that reading until a fix applies it.

- [`meter.ts`](meter.ts): the meter.
- [`feed.ts`](feed.ts): the boundary between the source and the runtime.
- [`feed.test.ts`](feed.test.ts): the feed on the runtime, with a source that gives its readings again until each
  is acknowledged.
