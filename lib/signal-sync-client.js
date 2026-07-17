(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CryptoSignalSyncClient = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function signalSyncClientFactory() {
  'use strict';

  function validSyncId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
  }

  function base64Url(bytes) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var output = '';
    for (var index = 0; index < bytes.length; index += 3) {
      var first = bytes[index];
      var hasSecond = index + 1 < bytes.length;
      var hasThird = index + 2 < bytes.length;
      var second = hasSecond ? bytes[index + 1] : 0;
      var third = hasThird ? bytes[index + 2] : 0;
      var block = (first << 16) | (second << 8) | third;
      output += alphabet[(block >>> 18) & 63];
      output += alphabet[(block >>> 12) & 63];
      output += hasSecond ? alphabet[(block >>> 6) & 63] : '=';
      output += hasThird ? alphabet[block & 63] : '=';
    }
    return output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function generateSyncId(cryptoApi) {
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') throw new Error('secure random generator unavailable');
    var bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function createClient(options) {
    options = options || {};
    var required = ['fetchJSON', 'validRecord', 'compactRecords', 'mergeOutcome', 'readRecords', 'writeRecords', 'readSyncId', 'writeSyncId'];
    required.forEach(function (name) {
      if (typeof options[name] !== 'function') throw new TypeError(name + ' is required');
    });
    var endpoint = options.endpoint || '/api/signals';
    var timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
    var batchSize = Number.isFinite(options.batchSize) && options.batchSize > 0 ? Math.floor(options.batchSize) : 50;
    var scheduleMs = Number.isFinite(options.scheduleMs) && options.scheduleMs >= 0 ? options.scheduleMs : 500;
    var now = typeof options.now === 'function' ? options.now : Date.now;
    var cryptoApi = options.cryptoApi || (typeof crypto !== 'undefined' ? crypto : null);
    var refreshRecordsUnderLock = typeof options.runExclusive === 'function';
    var runExclusive = refreshRecordsUnderLock ? options.runExclusive : function (task) { return task(); };
    var state = {
      configured: null,
      inFlight: false,
      pendingRecords: null,
      timer: null,
      generation: 0,
      idleWaiters: [],
      clearing: false,
      clearPromise: null,
      afterClearRecords: null
    };

    function notify(code, configured, details) {
      // `configured` is a capability learned from the server, not the health of the latest
      // operation. A timeout/503 must not poison that capability: otherwise a later clear skips
      // DELETE entirely and a retry can never remove the durable copy.
      if (configured === true || configured === false) state.configured = configured;
      if (typeof options.onStatus === 'function') options.onStatus({ code: code, configured: state.configured, details: details || {} });
    }

    function syncId() {
      var value = options.readSyncId();
      if (!validSyncId(value)) {
        value = generateSyncId(cryptoApi);
        options.writeSyncId(value);
      }
      return value;
    }

    /**
     * SEMANTICA DE MIGRACAO (decisao de produto, 2026-07-17): inserir um codigo de sync ADOTA os
     * registros locais deste dispositivo no journal do codigo inserido — e assim que o usuario
     * migra dados entre dispositivos proprios. Consequencia deliberada: os registros locais
     * pre-troca sao enviados ao novo namespace, inclusive quando a troca ocorre com um sync em
     * voo (o finally re-dispara com pendingRecords). O codigo e um segredo pessoal ("guarde-o
     * como uma senha"); inserir o codigo de terceiros compartilha o journal com eles — por
     * design. O caminho de clear() tem guarda propria (rollbackCurrentIdentity) porque la a
     * troca de identidade NAO deve ressuscitar registros: limpar e migrar sao operacoes opostas.
     */
    function setSyncId(value) {
      if (!validSyncId(value)) return false;
      if (options.readSyncId() !== value) {
        options.writeSyncId(value);
        state.generation += 1;
        // O sync em voo vai abortar nos checkpoints superseded(); o re-disparo do finally leva
        // os registros locais para o NOVO journal — comportamento de migracao documentado acima.
        if (state.clearing) state.afterClearRecords = options.readRecords();
        else if (state.inFlight) state.pendingRecords = options.readRecords();
      }
      return true;
    }

    function recordKey(record) {
      return [record.modelVersion || '', record.symbol, record.interval, record.signalCloseTime].join(':');
    }

    function merge(localRecords, remoteRecords) {
      var byKey = new Map();
      (Array.isArray(remoteRecords) ? remoteRecords : []).concat(Array.isArray(localRecords) ? localRecords : []).forEach(function (record) {
        if (!options.validRecord(record)) return;
        var key = recordKey(record);
        var existing = byKey.get(key);
        if (!existing) { byKey.set(key, record); return; }
        // The durable store treats the first snapshot persisted for a candle as canonical. Mirror
        // that policy in the browser: otherwise local metadata from another calculation revision
        // can be displayed beside an outcome that the server evaluated for the original snapshot.
        if (existing.inputSnapshotId && record.inputSnapshotId && existing.inputSnapshotId !== record.inputSnapshotId) return;
        var merged = Object.assign({}, existing, record);
        merged.outcome = options.mergeOutcome(existing.outcome, record.outcome);
        var existingEvaluatedAt = Number(existing.evaluatedAt) || 0;
        var incomingEvaluatedAt = Number(record.evaluatedAt) || 0;
        merged.evaluatedAt = Math.max(existingEvaluatedAt, incomingEvaluatedAt) || null;
        byKey.set(key, merged);
      });
      return options.compactRecords(Array.from(byKey.values()), now());
    }

    async function request(method, records, journalId, lock) {
      var requestOptions = { method: method, headers: { Accept: 'application/json', 'X-Journal-Id': journalId } };
      if (lock && lock.signal) requestOptions.signal = lock.signal;
      if (records !== undefined) {
        requestOptions.headers['Content-Type'] = 'application/json';
        requestOptions.body = JSON.stringify({ records: records.slice(-batchSize) });
      }
      return options.fetchJSON(endpoint, timeoutMs, 'Journal duravel', requestOptions);
    }

    function requireConfiguredPayload(payload) {
      if (!payload || payload.configured !== true || !Array.isArray(payload.records)) {
        var invalid = new Error('invalid durable storage response');
        invalid.status = 502;
        throw invalid;
      }
      return payload;
    }

    function superseded(generation) {
      return generation !== state.generation;
    }

    function assertLock(lock) {
      if (lock && typeof lock.assertHeld === 'function') lock.assertHeld();
    }

    function waitUntilIdle() {
      if (!state.inFlight) return Promise.resolve();
      return new Promise(function (resolve) { state.idleWaiters.push(resolve); });
    }

    function resolveIdleWaiters() {
      var waiters = state.idleWaiters.splice(0);
      waiters.forEach(function (resolve) { resolve(); });
    }

    async function sync(records) {
      if (state.clearing) {
        state.afterClearRecords = records || options.readRecords();
        return { ok: false, queued: true, clearing: true };
      }
      if (state.inFlight) {
        state.pendingRecords = records || options.readRecords();
        return { ok: false, queued: true };
      }
      state.inFlight = true;
      var generation = state.generation;
      var journalId = syncId();
      try {
        return await runExclusive(async function performSyncExclusive(lock) {
          assertLock(lock);
          if (superseded(generation)) return { ok: false, superseded: true };
          // A cross-tab lock may have waited behind a clear or another tab's sync. Re-read the
          // shared journal only after acquiring it so a captured pre-clear array cannot resurrect
          // records that were deleted while this operation was queued.
          var localRecords = refreshRecordsUnderLock ? options.readRecords() : (records || options.readRecords());
          notify('syncing', null);
          var remote = await request('GET', undefined, journalId, lock);
          assertLock(lock);
          if (superseded(generation)) return { ok: false, superseded: true };
          if (remote && remote.configured === false) {
            var unconfigured = new Error('durable storage is not provisioned');
            unconfigured.code = 'STORAGE_UNCONFIGURED';
            throw unconfigured;
          }
          requireConfiguredPayload(remote);
          var merged = merge(localRecords, remote && remote.records);
          assertLock(lock);
          options.writeRecords(merged);
          var persisted = remote || {};
          if (!merged.length) {
            persisted = requireConfiguredPayload(await request('POST', [], journalId, lock));
            assertLock(lock);
          }
          for (var offset = 0; offset < merged.length; offset += batchSize) {
            assertLock(lock);
            persisted = requireConfiguredPayload(await request('POST', merged.slice(offset, offset + batchSize), journalId, lock));
            assertLock(lock);
            if (superseded(generation)) return { ok: false, superseded: true };
          }
          if (superseded(generation)) return { ok: false, superseded: true };
          var reconciled = merge(merged, persisted && persisted.records);
          assertLock(lock);
          options.writeRecords(reconciled);
          notify('synced', true, { count: reconciled.length });
          if (typeof options.onRecordsUpdated === 'function') options.onRecordsUpdated(reconciled);
          return { ok: true, records: reconciled };
        });
      } catch (error) {
        if (!superseded(generation)) {
          var statusCode = error && error.code === 'STORAGE_UNCONFIGURED' ? 'unconfigured' : 'sync-failed';
          notify(statusCode, statusCode === 'unconfigured' ? false : null, { error: error });
        }
        return { ok: false, error: error, superseded: superseded(generation) };
      } finally {
        state.inFlight = false;
        resolveIdleWaiters();
        if (state.pendingRecords !== null) {
          var pending = state.pendingRecords;
          state.pendingRecords = null;
          void sync(pending);
        }
      }
    }

    function schedule(records) {
      var nextRecords = Array.isArray(records) ? records : options.readRecords();
      if (state.clearing) {
        state.afterClearRecords = nextRecords;
        return;
      }
      state.pendingRecords = nextRecords;
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(function () {
        state.timer = null;
        var pending = state.pendingRecords;
        state.pendingRecords = null;
        void sync(pending);
      }, scheduleMs);
    }

    function cancelScheduled() {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.pendingRecords = null;
    }

    function clear() {
      if (state.clearPromise) return state.clearPromise;
      var journalId = syncId();
      var rollbackRecords = options.readRecords();
      cancelScheduled();
      // Supersede the active transaction and let any POST already on the wire settle before the
      // DELETE. Issuing DELETE concurrently could let that older POST finish last and resurrect
      // the journal the user had just cleared.
      state.clearing = true;
      state.generation += 1;
      var generation = state.generation;
      var resumeSync = false;
      var rollbackOnFailure = false;
      // Clear this tab immediately so records created after the user's confirmation are routed
      // into afterClearRecords instead of inheriting the old journal snapshot.
      options.writeRecords([]);
      state.clearPromise = (async function performClear() {
        try {
          await waitUntilIdle();
          var unconfiguredClear = false;
          try {
            await runExclusive(async function performClearExclusive(lock) {
              assertLock(lock);
              // A different tab cannot write between this final local commit point and DELETE,
              // nor can a stale queued sync publish a pre-clear array after this operation.
              options.writeRecords([]);
              if (state.configured === false) { unconfiguredClear = true; return; }
              requireConfiguredPayload(await request('DELETE', undefined, journalId, lock));
              assertLock(lock);
              options.writeRecords([]);
            });
            if (unconfiguredClear) {
              notify('clear-unconfigured', false);
              return { ok: false, unconfigured: true };
            }
            resumeSync = true;
            if (!superseded(generation)) notify('cleared', true);
            return { ok: !superseded(generation), superseded: superseded(generation) };
          } catch (error) {
            rollbackOnFailure = true;
            if (!superseded(generation)) notify('clear-failed', null, { error: error });
            return { ok: false, error: error, superseded: superseded(generation) };
          }
        } finally {
          var rollbackCurrentIdentity = rollbackOnFailure && !superseded(generation);
          state.clearing = false;
          state.clearPromise = null;
          if (state.afterClearRecords !== null) {
            var afterClear = state.afterClearRecords;
            state.afterClearRecords = null;
            // A code change supersedes the old journal identity. Restoring rollbackRecords after
            // that point would copy private records from the old code into the new namespace.
            var nextRecords = rollbackCurrentIdentity ? merge(afterClear, rollbackRecords) : afterClear;
            options.writeRecords(nextRecords);
            if (resumeSync) void sync(nextRecords);
          } else if (rollbackCurrentIdentity) {
            // DELETE is the commit point of a durable clear. If it fails, restore the local journal
            // so a reload cannot look like a mysterious resurrection and the user can retry.
            options.writeRecords(rollbackRecords);
          }
        }
      }());
      return state.clearPromise;
    }

    return {
      cancelScheduled: cancelScheduled,
      clear: clear,
      merge: merge,
      schedule: schedule,
      setSyncId: setSyncId,
      state: state,
      sync: sync,
      syncId: syncId,
      validSyncId: validSyncId
    };
  }

  return {
    base64Url: base64Url,
    createClient: createClient,
    generateSyncId: generateSyncId,
    validSyncId: validSyncId
  };
}));
