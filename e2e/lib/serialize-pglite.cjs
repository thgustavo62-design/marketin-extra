// PGlite multiplexes one PostgreSQL session. Serialize pool acquisitions in this
// optional local browser harness so transactions cannot interleave on that session.
// This preload is never used by the application or its deployments.
const pg = require("pg");
const connect = pg.Pool.prototype.connect;
let tail = Promise.resolve();
pg.Pool.prototype.connect = function (callback) {
  let unlock;
  const gate = new Promise((resolve) => {
    unlock = resolve;
  });
  const previous = tail;
  tail = previous.then(() => gate);
  const pending = previous.then(
    () =>
      new Promise((resolve, reject) => {
        connect.call(this, (error, client, release) => {
          if (error) {
            unlock();
            reject(error);
            return;
          }
          let released = false;
          client.release = (error) => {
            if (released) return;
            released = true;
            try {
              release(error);
            } finally {
              unlock();
            }
          };
          resolve(client);
        });
      }),
  );
  if (callback) {
    pending.then(
      (client) => callback(null, client, client.release),
      (error) => callback(error),
    );
    return;
  }
  return pending;
};
