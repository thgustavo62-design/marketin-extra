import test from "node:test";
import assert from "node:assert/strict";
import { StudioSaveQueue } from "../src/lib/domain/studio-save-queue.ts";
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
test("autosave coalesces pending edits and confirms the latest revision", async () => {
  const sent: string[] = [],
    q = new StudioSaveQueue(
      3,
      async (json, revision) => {
        sent.push(json);
        return { ok: true, revision: revision + 1 };
      },
      () => {},
    );
  q.enqueue("first");
  q.enqueue("latest");
  assert.equal(await q.flush(), true);
  assert.deepEqual(sent, ["latest"]);
  assert.equal(q.snapshot.revision, 4);
  assert.equal(q.snapshot.status, "Salvo");
  assert.equal(q.dirty, false);
});
test("simultaneous flushes share one writer and drain newer in-flight changes", async () => {
  const gate = deferred<{ ok: true; revision: number }>(),
    calls: [string, number][] = [];
  const q = new StudioSaveQueue(
    8,
    (json, revision) => {
      calls.push([json, revision]);
      return calls.length === 1
        ? gate.promise
        : Promise.resolve({ ok: true, revision: revision + 1 });
    },
    () => {},
  );
  q.enqueue("A");
  const one = q.flush();
  await Promise.resolve();
  q.enqueue("B");
  q.enqueue("C");
  const two = q.flush();
  assert.equal(one, two);
  gate.resolve({ ok: true, revision: 9 });
  assert.equal(await two, true);
  assert.deepEqual(calls, [
    ["A", 8],
    ["C", 9],
  ]);
  assert.equal(q.snapshot.revision, 10);
});
test("a network failure retains the newest pending scene and retries at the same revision", async () => {
  const gate = deferred<never>(),
    calls: [string, number][] = [];
  let fail = true;
  const q = new StudioSaveQueue(
    2,
    async (json, revision) => {
      calls.push([json, revision]);
      if (fail) {
        fail = false;
        throw Error("network");
      }
      return { ok: true, revision: revision + 1 };
    },
    () => {},
  );
  q.enqueue("latest");
  assert.equal(await q.flush(), false);
  assert.equal(q.snapshot.pending, "latest");
  assert.equal(q.snapshot.status, "Não salvo");
  assert.equal(q.snapshot.retryable, true);
  assert.equal(await q.flush(), true);
  assert.deepEqual(calls, [
    ["latest", 2],
    ["latest", 2],
  ]);
});
test("a failed in-flight request never restores its old scene over newer edits", async () => {
  const gate = deferred<{ ok: false; error: string; retryable: true }>();
  const q = new StudioSaveQueue(
    0,
    () => gate.promise,
    () => {},
  );
  q.enqueue("old");
  const job = q.flush();
  await Promise.resolve();
  q.enqueue("new");
  gate.resolve({ ok: false, error: "offline", retryable: true });
  await job;
  assert.equal(q.snapshot.pending, "new");
});
test("a revision conflict blocks automatic and manual overwrite while retaining edits", async () => {
  let calls = 0;
  const q = new StudioSaveQueue(
    1,
    async () => {
      calls++;
      return { ok: false, conflict: true, error: "other tab" };
    },
    () => {},
  );
  q.enqueue("draft");
  assert.equal(await q.flush(), false);
  q.enqueue("latest draft");
  assert.equal(await q.flush(), false);
  assert.equal(calls, 1);
  assert.equal(q.snapshot.pending, "latest draft");
  assert.equal(q.snapshot.conflict, true);
});
test("returning to the confirmed scene clears pending work without a new request", async () => {
  let calls = 0;
  const q = new StudioSaveQueue(
    0,
    async (_json, revision) => {
      calls++;
      return { ok: true, revision: revision + 1 };
    },
    () => {},
  );
  q.enqueue("saved");
  await q.flush();
  q.enqueue("different");
  q.enqueue("saved");
  assert.equal(await q.flush(), true);
  assert.equal(calls, 1);
  assert.equal(q.snapshot.pending, null);
});
test("validation failures remain recoverable by editing the document", async () => {
  const q = new StudioSaveQueue(
    0,
    async (json, revision) =>
      json === "invalid"
        ? { ok: false, error: "too large" }
        : { ok: true, revision: revision + 1 },
    () => {},
  );
  q.enqueue("invalid");
  assert.equal(await q.flush(), false);
  assert.equal(q.snapshot.retryable, false);
  q.enqueue("valid");
  assert.equal(await q.flush(), true);
});

test("a lost acknowledgement is retried before newer edits to recover the committed revision", async () => {
  let transportCalls = 0,
    remoteRevision = 0;
  const sent: [string, number][] = [];
  const q = new StudioSaveQueue(
    0,
    async (json, revision) => {
      sent.push([json, revision]);
      transportCalls++;
      if (transportCalls === 1) {
        remoteRevision = 1;
        throw Error("response lost after commit");
      }
      if (json === "A" && revision === 0 && remoteRevision === 1)
        return { ok: true, revision: 1 };
      assert.equal(revision, remoteRevision);
      remoteRevision++;
      return { ok: true, revision: remoteRevision };
    },
    () => {},
  );
  q.enqueue("A");
  assert.equal(await q.flush(), false);
  q.enqueue("B");
  assert.equal(await q.flush(), true);
  assert.deepEqual(sent, [
    ["A", 0],
    ["A", 0],
    ["B", 1],
  ]);
  assert.equal(q.snapshot.revision, 2);
});
