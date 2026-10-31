# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

The bugs of the third audit are fixed: a creation and a message under one request id are answered apart
([decision 0050](decisions/0050-a-creation-is-answered-apart-from-a-message.md)), and a deploy that fails
leaves nothing running ([decision 0051](decisions/0051-a-deploy-that-fails-leaves-nothing-running.md)). What it
found to make the project purer and more rigid was planned in steps, and all of them are done. The first two:
the machine gives what an event writes, and the storage decides nothing
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)), and work is compared by what is stored
([decision 0058](decisions/0058-work-is-compared-by-what-is-stored.md)); so are the next three: a request is a
value ([decision 0059](decisions/0059-a-request-is-a-value.md)), `send` and `create` take no key
([decision 0060](decisions/0060-send-and-create-take-no-key.md)), and only what the program does is its defect
([decision 0061](decisions/0061-only-what-the-program-does-is-its-defect.md)); and so are two more: a row is read
through a schema ([decision 0062](decisions/0062-a-row-is-read-through-a-schema.md)), and the runtime polls nothing
([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)); and so is the next: the program is
not the machine's state, and a fix is a deploy
([decision 0064](decisions/0064-the-program-is-not-the-machines-state.md)); and so is the one after it: the
machine holds no replies, and only a step changes it
([decision 0065](decisions/0065-the-machine-holds-no-replies.md)); and so is the last: the runtime's tests move
time instead of waiting for it ([decision 0066](decisions/0066-the-runtimes-tests-move-time.md)). Each step is
decided in a note before it is made.

The open questions that bear on cost are decided next. The first is: each entity is held by a lock of its own,
not by one permit for the process ([decision 0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)). The
one left is [a mailbox under a burst](open-questions.md#storage-and-reading): a machine holds only its state, its
keys and its mailbox ([decision 0065](decisions/0065-the-machine-holds-no-replies.md)), and an event writes only
what it changed ([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)).

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
