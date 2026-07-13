(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CryptoCrossTabLock = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function crossTabLockFactory() {
  'use strict';

  function defaultDelay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function randomParticipantId(cryptoApi, now) {
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    var suffix = Math.random().toString(36).slice(2);
    return String(now()).toString(36) + '-' + suffix;
  }

  function createCoordinator(options) {
    options = options || {};
    var locks = options.locks || null;
    var storage = options.storage || null;
    var now = typeof options.now === 'function' ? options.now : Date.now;
    var wait = typeof options.delay === 'function' ? options.delay : defaultDelay;
    var scheduleHeartbeat = typeof options.setInterval === 'function' ? options.setInterval : setInterval;
    var cancelHeartbeat = typeof options.clearInterval === 'function' ? options.clearInterval : clearInterval;
    var leaseMs = Number.isFinite(options.leaseMs) ? Math.max(5000, options.leaseMs) : 120000;
    var pollMs = Number.isFinite(options.pollMs) ? Math.max(1, options.pollMs) : 20;
    var participantId = String(options.participantId || randomParticipantId(options.cryptoApi, now)).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
    var localQueues = new Map();
    var degradedReported = false;

    function reportDegraded(reason) {
      if (degradedReported) return;
      degradedReported = true;
      if (typeof options.onDegraded === 'function') options.onDegraded(reason);
    }

    function prefixFor(name) { return 'cld-cross-tab-lock:v1:' + encodeURIComponent(name) + ':'; }

    function storageKeys(prefix) {
      var keys = [];
      for (var index = 0; index < storage.length; index += 1) {
        var key = storage.key(index);
        if (key && key.indexOf(prefix) === 0) keys.push(key);
      }
      return keys;
    }

    function contenders(prefix) {
      var currentTime = now();
      var rows = [];
      storageKeys(prefix).forEach(function (key) {
        var parsed = null;
        try { parsed = JSON.parse(storage.getItem(key) || 'null'); }
        catch (error) { /* removed below */ }
        var valid = parsed && typeof parsed.id === 'string'
          && key === prefix + parsed.id
          && typeof parsed.choosing === 'boolean'
          && Number.isFinite(parsed.number) && parsed.number >= 0
          && Number.isFinite(parsed.expiresAt) && parsed.expiresAt > currentTime
          && parsed.expiresAt <= currentTime + leaseMs + Math.max(1000, pollMs * 2);
        if (!valid) {
          try { storage.removeItem(key); } catch (error) { /* cleanup is best effort */ }
          return;
        }
        rows.push({ key: key, id: parsed.id, choosing: parsed.choosing, number: parsed.number, expiresAt: parsed.expiresAt });
      });
      return rows;
    }

    function writeTicket(key, choosing, number) {
      storage.setItem(key, JSON.stringify({ id: participantId, choosing: choosing, number: number, expiresAt: now() + leaseMs }));
    }

    async function acquireStorageLock(name) {
      var prefix = prefixFor(name);
      var ownKey = prefix + participantId;
      writeTicket(ownKey, true, 0);
      var ticket = contenders(prefix).reduce(function (maximum, row) { return Math.max(maximum, row.number); }, 0) + 1;
      writeTicket(ownKey, false, ticket);
      var heartbeat = scheduleHeartbeat(function () {
        try { writeTicket(ownKey, false, ticket); } catch (error) { /* expiry remains the fail-safe */ }
      }, Math.max(1000, Math.floor(leaseMs / 3)));
      try {
        while (true) {
          var blocked = contenders(prefix).some(function (row) {
            if (row.id === participantId) return false;
            if (row.choosing) return true;
            return row.number < ticket || (row.number === ticket && row.id < participantId);
          });
          if (!blocked) break;
          await wait(pollMs);
        }
      } catch (error) {
        cancelHeartbeat(heartbeat);
        try { storage.removeItem(ownKey); } catch (cleanupError) { /* ignore */ }
        throw error;
      }
      return function release() {
        cancelHeartbeat(heartbeat);
        try {
          var current = JSON.parse(storage.getItem(ownKey) || 'null');
          if (current && current.id === participantId) storage.removeItem(ownKey);
        } catch (error) { /* the lease eventually expires */ }
      };
    }

    function runLocallySerialized(name, task, useStorage) {
      var previous = localQueues.get(name) || Promise.resolve();
      var result = previous.catch(function () { /* preserve the queue after a failed task */ }).then(async function () {
        var release = null;
        if (useStorage) {
          try { release = await acquireStorageLock(name); }
          catch (error) { reportDegraded('storage-lock-unavailable'); }
        }
        try { return await task(); }
        finally { if (release) release(); }
      });
      localQueues.set(name, result.then(function () {}, function () {}));
      return result;
    }

    function run(name, task) {
      if (typeof task !== 'function') return Promise.reject(new TypeError('lock task is required'));
      if (locks && typeof locks.request === 'function') {
        var taskStarted = false;
        return Promise.resolve().then(function () {
          return locks.request(name, { mode: 'exclusive' }, function nativeLockedTask() {
            taskStarted = true;
            return task();
          });
        }).catch(function (error) {
          if (taskStarted) throw error;
          reportDegraded('web-lock-unavailable');
          return runLocallySerialized(name, task, !!storage);
        });
      }
      if (storage) {
        try { return runLocallySerialized(name, task, true); }
        catch (error) { reportDegraded('storage-lock-unavailable'); }
      }
      reportDegraded('cross-tab-lock-unavailable');
      return runLocallySerialized(name, task, false);
    }

    return { participantId: participantId, run: run };
  }

  return { createCoordinator: createCoordinator };
}));
