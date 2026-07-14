'use strict';

const crypto = require('node:crypto');
const AnalyticsCore = require('./analytics-core');

const DAY_MS = 86_400_000;
const SIGNAL_HORIZONS = { r1h: 3_600_000, r24h: DAY_MS, r7d: 7 * DAY_MS };
const COMPLETED_CAP = 500;
const COMPLETED_RETENTION_MS = 365 * DAY_MS;
const KEY_TTL_SECONDS = 400 * 24 * 60 * 60;
const DUE_KEY = 'cld:signals:due:v1';
const NAMESPACE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const SYMBOL_PATTERN = /^[A-Z0-9]{1,15}USDT$/;
const INTERVAL_PATTERN = /^(1s|1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/;
const ATOMIC_MERGE_AND_SCHEDULE_LUA = `
local key = KEYS[1]
local dueKey = KEYS[2]
local field = ARGV[1]
local incomingJson = ARGV[2]
local member = ARGV[3]
local asOf = tonumber(ARGV[4])
local retryDelay = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])
local incoming = cjson.decode(incomingJson)
local currentJson = redis.call('HGET', key, field)
local merged = incoming

local validIntervals = {
  ['1s'] = true, ['1m'] = true, ['3m'] = true, ['5m'] = true, ['15m'] = true,
  ['30m'] = true, ['1h'] = true, ['2h'] = true, ['4h'] = true, ['6h'] = true,
  ['8h'] = true, ['12h'] = true, ['1d'] = true, ['3d'] = true, ['1w'] = true, ['1M'] = true
}

local function finiteNumber(value)
  return type(value) == 'number' and value == value
end

local function optionalFinite(value)
  return value == nil or value == cjson.null or finiteNumber(value)
end

local function validCurrentRecord(current)
  if type(current) ~= 'table' then return false end
  if current.id ~= incoming.id or current.id ~= field then return false end
  if type(current.modelVersion) ~= 'string' or current.modelVersion ~= incoming.modelVersion or current.modelVersion == '' or string.len(current.modelVersion) > 80 then return false end
  if type(current.rulesetHash) ~= 'string' or current.rulesetHash == '' or string.len(current.rulesetHash) > 128 then return false end
  if type(current.inputSnapshotId) ~= 'string' or current.inputSnapshotId == '' or string.len(current.inputSnapshotId) > 2048 then return false end
  if type(current.symbol) ~= 'string' or current.symbol ~= incoming.symbol or string.len(current.symbol) > 20 then return false end
  if type(current.interval) ~= 'string' or current.interval ~= incoming.interval or not validIntervals[current.interval] then return false end
  if not finiteNumber(current.signalCloseTime) or current.signalCloseTime ~= incoming.signalCloseTime or current.signalCloseTime < 0 or current.signalCloseTime > asOf + 60000 then return false end
  if not finiteNumber(current.recordedAt) or current.recordedAt < current.signalCloseTime or current.recordedAt > asOf + 60000 then return false end
  if not finiteNumber(current.price) or current.price <= 0 then return false end
  if not finiteNumber(current.setupScore) or current.setupScore < -100 or current.setupScore > 100 then return false end
  if not optionalFinite(current.radarScore) or (finiteNumber(current.radarScore) and (current.radarScore < -100 or current.radarScore > 100)) then return false end
  if not finiteNumber(current.dataConfidence) or current.dataConfidence < 0 or current.dataConfidence > 100 then return false end
  if type(current.outcome) ~= 'table' then return false end
  if not optionalFinite(current.outcome.r1h) or not optionalFinite(current.outcome.r24h) or not optionalFinite(current.outcome.r7d) then return false end
  if not optionalFinite(current.evaluatedAt) then return false end
  return true
end

if currentJson then
  local decoded, current = pcall(cjson.decode, currentJson)
  if decoded and validCurrentRecord(current) then
    merged = current
    if current.id == incoming.id and current.inputSnapshotId == incoming.inputSnapshotId then
      local horizons = { 'r1h', 'r24h', 'r7d' }
      current.outcome = current.outcome or {}
      incoming.outcome = incoming.outcome or {}
      for _, horizon in ipairs(horizons) do
        if (current.outcome[horizon] == nil or current.outcome[horizon] == cjson.null)
          and incoming.outcome[horizon] ~= nil and incoming.outcome[horizon] ~= cjson.null then
          current.outcome[horizon] = incoming.outcome[horizon]
        end
      end
      local currentEvaluated = current.evaluatedAt
      local incomingEvaluated = incoming.evaluatedAt
      if incomingEvaluated ~= nil and incomingEvaluated ~= cjson.null
        and (currentEvaluated == nil or currentEvaluated == cjson.null or incomingEvaluated > currentEvaluated) then
        current.evaluatedAt = incomingEvaluated
      end
      merged = current
    end
  end
end

local mergedJson = cjson.encode(merged)
redis.call('HSET', key, field, mergedJson)
local deadlines = { r1h = 3600000, r24h = 86400000, r7d = 604800000 }
local nextDue = nil
for horizon, offset in pairs(deadlines) do
  local value = merged.outcome and merged.outcome[horizon]
  if value == nil or value == cjson.null then
    local deadline = tonumber(merged.signalCloseTime) + offset
    if deadline <= asOf then deadline = asOf + retryDelay end
    if nextDue == nil or deadline < nextDue then nextDue = deadline end
  end
end
if nextDue == nil then redis.call('ZREM', dueKey, member)
else redis.call('ZADD', dueKey, nextDue, member) end
redis.call('EXPIRE', key, ttl)
return mergedJson
`;
const ATOMIC_CLEAR_LUA = `
local key = KEYS[1]
local dueKey = KEYS[2]
local namespaceHash = ARGV[1]

local function encodeURIComponent(value)
  return (string.gsub(value, '.', function(character)
    local byte = string.byte(character)
    local alphanumeric = (byte >= 48 and byte <= 57) or (byte >= 65 and byte <= 90) or (byte >= 97 and byte <= 122)
    if alphanumeric or string.find("-_.!~*'()", character, 1, true) then return character end
    return string.format('%%%02X', byte)
  end))
end

local fields = redis.call('HKEYS', key)
for _, field in ipairs(fields) do
  redis.call('ZREM', dueKey, namespaceHash .. '|' .. encodeURIComponent(field))
end
redis.call('DEL', key)
return #fields
`;
const ATOMIC_COMPACT_LUA = `
local key = KEYS[1]
local dueKey = KEYS[2]
local namespaceHash = ARGV[1]
local asOf = tonumber(ARGV[2])
local retention = tonumber(ARGV[3])
local completedCap = tonumber(ARGV[4])

local validIntervals = {
  ['1s'] = true, ['1m'] = true, ['3m'] = true, ['5m'] = true, ['15m'] = true,
  ['30m'] = true, ['1h'] = true, ['2h'] = true, ['4h'] = true, ['6h'] = true,
  ['8h'] = true, ['12h'] = true, ['1d'] = true, ['3d'] = true, ['1w'] = true, ['1M'] = true
}

local function encodeURIComponent(value)
  return (string.gsub(value, '.', function(character)
    local byte = string.byte(character)
    local alphanumeric = (byte >= 48 and byte <= 57) or (byte >= 65 and byte <= 90) or (byte >= 97 and byte <= 122)
    if alphanumeric or string.find("-_.!~*'()", character, 1, true) then return character end
    return string.format('%%%02X', byte)
  end))
end

local function finiteNumber(value)
  return type(value) == 'number' and value == value
end

local function optionalFinite(value)
  return value == nil or value == cjson.null or finiteNumber(value)
end

local function validRecord(record, field, serialized)
  if type(record) ~= 'table' or string.len(serialized) > 65536 then return false end
  if record.schemaVersion ~= 3 or record.id ~= field then return false end
  if type(record.modelVersion) ~= 'string' or record.modelVersion == '' or string.len(record.modelVersion) > 80 then return false end
  if type(record.rulesetHash) ~= 'string' or record.rulesetHash == '' or string.len(record.rulesetHash) > 128 then return false end
  if type(record.inputSnapshotId) ~= 'string' or record.inputSnapshotId == '' or string.len(record.inputSnapshotId) > 2048 then return false end
  if type(record.symbol) ~= 'string' or string.len(record.symbol) > 20 or not string.match(record.symbol, '^[A-Z0-9]+USDT$') then return false end
  if type(record.interval) ~= 'string' or not validIntervals[record.interval] then return false end
  if not finiteNumber(record.signalCloseTime) or record.signalCloseTime < 0 or record.signalCloseTime > asOf + 60000 then return false end
  if not finiteNumber(record.recordedAt) or record.recordedAt < record.signalCloseTime or record.recordedAt > asOf + 60000 then return false end
  if not finiteNumber(record.price) or record.price <= 0 then return false end
  if not finiteNumber(record.setupScore) or record.setupScore < -100 or record.setupScore > 100 then return false end
  if not optionalFinite(record.radarScore) or (finiteNumber(record.radarScore) and (record.radarScore < -100 or record.radarScore > 100)) then return false end
  if not finiteNumber(record.dataConfidence) or record.dataConfidence < 0 or record.dataConfidence > 100 then return false end
  if type(record.outcome) ~= 'table' then return false end
  if not optionalFinite(record.outcome.r1h) or not optionalFinite(record.outcome.r24h) or not optionalFinite(record.outcome.r7d) then return false end
  if not optionalFinite(record.evaluatedAt) then return false end
  return true
end

local function removeField(field)
  redis.call('HDEL', key, field)
  redis.call('ZREM', dueKey, namespaceHash .. '|' .. encodeURIComponent(field))
end

local values = redis.call('HGETALL', key)
local completed = {}
for index = 1, #values, 2 do
  local field = values[index]
  local serialized = values[index + 1]
  local decoded, record = pcall(cjson.decode, serialized)
  if not decoded or not validRecord(record, field, serialized) then
    removeField(field)
  else
    local complete = finiteNumber(record.outcome.r1h) and finiteNumber(record.outcome.r24h) and finiteNumber(record.outcome.r7d)
    if complete and record.signalCloseTime < asOf - retention then
      removeField(field)
    elseif complete then
      table.insert(completed, { field = field, signalCloseTime = record.signalCloseTime, recordedAt = record.recordedAt })
    end
  end
end

table.sort(completed, function(left, right)
  if left.signalCloseTime ~= right.signalCloseTime then return left.signalCloseTime < right.signalCloseTime end
  if left.recordedAt ~= right.recordedAt then return left.recordedAt < right.recordedAt end
  return left.field < right.field
end)
for index = 1, math.max(0, #completed - completedCap) do removeField(completed[index].field) end
return redis.call('HVALS', key)
`;

function jsonClone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) return null;
    if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) return null;
    return item;
  }));
}

function finite(value) {
  return AnalyticsCore.toFiniteNumber(value);
}

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) : '';
}

function normalizeOutcome(value) {
  const source = value && typeof value === 'object' ? value : {};
  const output = {};
  Object.keys(SIGNAL_HORIZONS).forEach((key) => { output[key] = finite(source[key]); });
  return output;
}

function signalRecordId(record) {
  return [record.modelVersion, record.symbol, record.interval, record.signalCloseTime].join(':');
}

function normalizeDurableSignalRecord(record, asOf = Date.now()) {
  if (!record || typeof record !== 'object') return null;
  const now = finite(asOf);
  const signalCloseTime = finite(record.signalCloseTime);
  const recordedAt = finite(record.recordedAt);
  const price = finite(record.price);
  const setupScore = finite(record.setupScore);
  const radarScore = finite(record.radarScore);
  const dataConfidence = finite(record.dataConfidence);
  const symbol = boundedString(record.symbol, 20).toUpperCase();
  const interval = boundedString(record.interval, 4);
  const modelVersion = boundedString(record.modelVersion, 80);
  const rulesetHash = boundedString(record.rulesetHash, 128);
  const inputSnapshotId = boundedString(record.inputSnapshotId, 2048);
  if (now === null || signalCloseTime === null || signalCloseTime < 0 || signalCloseTime > now + AnalyticsCore.RULESET.clockSkewToleranceMs) return null;
  if (recordedAt === null || recordedAt < signalCloseTime || recordedAt > now + AnalyticsCore.RULESET.clockSkewToleranceMs) return null;
  if (!SYMBOL_PATTERN.test(symbol) || !INTERVAL_PATTERN.test(interval) || !modelVersion || !rulesetHash || !inputSnapshotId) return null;
  if (price === null || price <= 0 || setupScore === null || setupScore < -100 || setupScore > 100) return null;
  if (radarScore !== null && (radarScore < -100 || radarScore > 100)) return null;
  if (dataConfidence === null || dataConfidence < 0 || dataConfidence > 100) return null;
  const normalized = {
    schemaVersion: 3,
    recordedAt,
    inputSnapshotId,
    modelVersion,
    rulesetHash,
    symbol,
    interval,
    signalCloseTime,
    price,
    setupScore,
    radarScore,
    dataConfidence,
    decision: boundedString(record.decision, 120),
    inputComponents: jsonClone(record.inputComponents),
    inputComponentsHash: boundedString(record.inputComponentsHash, 128),
    scoreComponents: Array.isArray(record.scoreComponents) ? jsonClone(record.scoreComponents.slice(0, 32)) : [],
    gates: jsonClone(record.gates),
    outcome: normalizeOutcome(record.outcome),
    evaluatedAt: finite(record.evaluatedAt)
  };
  normalized.id = signalRecordId(normalized);
  const serialized = JSON.stringify(normalized);
  return serialized.length <= 65_536 ? normalized : null;
}

function mergeDurableSignalRecord(existing, incoming, asOf = Date.now()) {
  const current = normalizeDurableSignalRecord(existing, asOf);
  const fresh = normalizeDurableSignalRecord(incoming, asOf);
  if (!current) return fresh;
  if (!fresh || current.id !== fresh.id || current.inputSnapshotId !== fresh.inputSnapshotId) return current;
  current.outcome = AnalyticsCore.mergeSignalOutcome(current.outcome, fresh.outcome);
  const evaluatedAt = [finite(current.evaluatedAt), finite(fresh.evaluatedAt)].filter((value) => value !== null);
  current.evaluatedAt = evaluatedAt.length ? Math.max(...evaluatedAt) : null;
  return current;
}

function signalOutcomeState(record, asOf) {
  return AnalyticsCore.signalOutcomeState(record, asOf);
}

function nextSignalDueAt(record, asOf = Date.now(), retryDelayMs = 15 * 60_000) {
  const now = finite(asOf);
  const base = finite(record && record.signalCloseTime);
  if (now === null || base === null) return null;
  const outcome = record.outcome || {};
  const missingDeadlines = Object.keys(SIGNAL_HORIZONS)
    .filter((key) => finite(outcome[key]) === null)
    .map((key) => base + SIGNAL_HORIZONS[key]);
  if (!missingDeadlines.length) return null;
  const earliest = Math.min(...missingDeadlines);
  return earliest <= now ? now + Math.max(60_000, retryDelayMs) : earliest;
}

function namespaceHash(namespace) {
  const value = boundedString(namespace, 128);
  if (!NAMESPACE_PATTERN.test(value)) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashKey(hash) { return `cld:signals:records:v1:${hash}`; }

function dueMember(hash, recordId) {
  return `${hash}|${encodeURIComponent(recordId)}`;
}

function parseDueMember(member) {
  const value = String(member || '');
  const separator = value.indexOf('|');
  if (separator !== 64 || !/^[a-f0-9]{64}$/.test(value.slice(0, separator))) return null;
  try {
    return { namespaceHash: value.slice(0, separator), recordId: decodeURIComponent(value.slice(separator + 1)) };
  } catch (error) {
    return null;
  }
}

function parseStoredRecord(value, asOf) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return normalizeDurableSignalRecord(parsed, asOf);
  } catch (error) {
    return null;
  }
}

function compactDurableSignals(records, asOf = Date.now()) {
  const now = finite(asOf) ?? Date.now();
  const byId = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const normalized = normalizeDurableSignalRecord(record, now);
    if (normalized) byId.set(normalized.id, normalized);
  });
  const ordered = Array.from(byId.values()).sort((a, b) => a.signalCloseTime - b.signalCloseTime || a.recordedAt - b.recordedAt);
  const incomplete = ordered.filter((record) => signalOutcomeState(record, now) !== 'complete');
  const complete = ordered.filter((record) => signalOutcomeState(record, now) === 'complete' && record.signalCloseTime >= now - COMPLETED_RETENTION_MS);
  return complete.slice(Math.max(0, complete.length - COMPLETED_CAP)).concat(incomplete)
    .sort((a, b) => a.signalCloseTime - b.signalCloseTime || a.recordedAt - b.recordedAt);
}

function createDurableSignalStore(redis) {
  if (!redis) throw new TypeError('redis client is required');

  async function listByHash(hash, asOf = Date.now()) {
    const values = await redis.hvals(hashKey(hash));
    return compactDurableSignals((Array.isArray(values) ? values : []).map((value) => parseStoredRecord(value, asOf)).filter(Boolean), asOf);
  }

  async function list(namespace, asOf = Date.now()) {
    const hash = namespaceHash(namespace);
    if (!hash) throw new TypeError('invalid journal namespace');
    return listByHash(hash, asOf);
  }

  async function schedule(hash, record, asOf, retryDelayMs) {
    const member = dueMember(hash, record.id);
    const dueAt = nextSignalDueAt(record, asOf, retryDelayMs);
    if (dueAt === null) await redis.zrem(DUE_KEY, member);
    else await redis.zadd(DUE_KEY, { score: dueAt, member });
  }

  async function upsertByHash(hash, records, asOf = Date.now(), retryDelayMs) {
    const key = hashKey(hash);
    const normalized = (Array.isArray(records) ? records : []).map((record) => normalizeDurableSignalRecord(record, asOf)).filter(Boolean);
    if (!normalized.length) return listByHash(hash, asOf);
    // Collapse duplicate IDs in request order before the Redis round-trip. The first snapshot for
    // a candle remains canonical, while later copies may only fill missing outcomes.
    const incomingById = new Map();
    normalized.forEach((incoming) => {
      const existing = incomingById.get(incoming.id);
      incomingById.set(incoming.id, existing ? mergeDurableSignalRecord(existing, incoming, asOf) : incoming);
    });
    const unique = Array.from(incomingById.values());
    const retry = Number.isFinite(retryDelayMs) ? Math.max(60_000, retryDelayMs) : 15 * 60_000;
    let mergedRows;
    if (typeof redis.eval === 'function') {
      const argumentsFor = (incoming) => [
        incoming.id,
        JSON.stringify(incoming),
        dueMember(hash, incoming.id),
        String(asOf),
        String(retry),
        String(KEY_TTL_SECONDS)
      ];
      if (typeof redis.pipeline === 'function') {
        const pipeline = redis.pipeline();
        unique.forEach((incoming) => pipeline.eval(ATOMIC_MERGE_AND_SCHEDULE_LUA, [key, DUE_KEY], argumentsFor(incoming)));
        const values = await pipeline.exec();
        mergedRows = values.map((value) => parseStoredRecord(value, asOf)).filter(Boolean);
      } else {
        const values = await Promise.all(unique.map((incoming) => redis.eval(
          ATOMIC_MERGE_AND_SCHEDULE_LUA,
          [key, DUE_KEY],
          argumentsFor(incoming)
        )));
        mergedRows = values.map((value) => parseStoredRecord(value, asOf)).filter(Boolean);
      }
    } else {
      // Deterministic in-memory adapters used by local tests do not expose Lua. Production Upstash
      // always follows the atomic branch above.
      mergedRows = [];
      for (const incoming of unique) {
        const existing = parseStoredRecord(await redis.hget(key, incoming.id), asOf);
        // A different normalized identity under the requested hash field is corrupted storage,
        // not a competing canonical snapshot. Let the valid incoming row repair that field.
        const merged = existing && existing.id === incoming.id
          ? mergeDurableSignalRecord(existing, incoming, asOf)
          : incoming;
        await redis.hset(key, { [merged.id]: JSON.stringify(merged) });
        await schedule(hash, merged, asOf, retryDelayMs);
        mergedRows.push(merged);
      }
      await redis.expire(key, KEY_TTL_SECONDS);
    }
    if (mergedRows.length !== unique.length) throw new Error('Atomic durable merge returned an invalid record');
    if (typeof redis.eval === 'function') {
      // Retention and due-index cleanup share the same Redis serialization point as every merge.
      // A record written after this snapshot is therefore never mistaken for an old candidate.
      const values = await redis.eval(ATOMIC_COMPACT_LUA, [key, DUE_KEY], [
        hash,
        String(asOf),
        String(COMPLETED_RETENTION_MS),
        String(COMPLETED_CAP)
      ]);
      return compactDurableSignals((Array.isArray(values) ? values : []).map((value) => parseStoredRecord(value, asOf)).filter(Boolean), asOf);
    }
    const all = await listByHash(hash, asOf);
    const keep = new Set(all.map((record) => record.id));
    const storedValues = await redis.hvals(key);
    const removed = (Array.isArray(storedValues) ? storedValues : []).map((value) => parseStoredRecord(value, asOf)).filter(Boolean).filter((record) => !keep.has(record.id));
    for (const record of removed) {
      await redis.hdel(key, record.id);
      await redis.zrem(DUE_KEY, dueMember(hash, record.id));
    }
    return all;
  }

  async function upsert(namespace, records, asOf = Date.now()) {
    const hash = namespaceHash(namespace);
    if (!hash) throw new TypeError('invalid journal namespace');
    return upsertByHash(hash, records, asOf);
  }

  async function clear(namespace) {
    const hash = namespaceHash(namespace);
    if (!hash) throw new TypeError('invalid journal namespace');
    if (typeof redis.eval === 'function') {
      // The hash deletion and every due-index removal must share one Redis serialization point.
      // Otherwise a concurrent device can write between list/zrem/del and have its fresh record
      // erased, or have the new due member removed after the record survived.
      await redis.eval(ATOMIC_CLEAR_LUA, [hashKey(hash), DUE_KEY], [hash]);
      return;
    }
    const records = await listByHash(hash, Date.now());
    for (const record of records) await redis.zrem(DUE_KEY, dueMember(hash, record.id));
    await redis.del(hashKey(hash));
  }

  async function due(asOf = Date.now(), limit = 20) {
    const members = await redis.zrange(DUE_KEY, 0, asOf, { byScore: true, offset: 0, count: Math.max(1, Math.min(100, limit)) });
    const parsedRows = [];
    const staleMembers = [];
    for (const member of Array.isArray(members) ? members : []) {
      const parsed = parseDueMember(member);
      if (!parsed) staleMembers.push(member);
      else parsedRows.push({ member, ...parsed });
    }
    let values;
    if (parsedRows.length && typeof redis.pipeline === 'function') {
      const pipeline = redis.pipeline();
      parsedRows.forEach((row) => pipeline.hget(hashKey(row.namespaceHash), row.recordId));
      values = await pipeline.exec();
    } else {
      values = await Promise.all(parsedRows.map((row) => redis.hget(hashKey(row.namespaceHash), row.recordId)));
    }
    const output = [];
    parsedRows.forEach((row, index) => {
      const record = parseStoredRecord(values[index], asOf);
      if (!record) staleMembers.push(row.member);
      else output.push({ member: row.member, namespaceHash: row.namespaceHash, record });
    });
    await Promise.all(staleMembers.map((member) => redis.zrem(DUE_KEY, member)));
    return output;
  }

  async function saveWorkerResult(namespaceHashValue, record, asOf = Date.now(), retryDelayMs) {
    if (!/^[a-f0-9]{64}$/.test(String(namespaceHashValue || ''))) throw new TypeError('invalid namespace hash');
    return upsertByHash(namespaceHashValue, [record], asOf, retryDelayMs);
  }

  async function saveWorkerResults(items, asOf = Date.now(), retryDelayMs) {
    const grouped = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const namespaceHashValue = String(item && item.namespaceHash || '');
      if (!/^[a-f0-9]{64}$/.test(namespaceHashValue)) throw new TypeError('invalid namespace hash');
      if (!grouped.has(namespaceHashValue)) grouped.set(namespaceHashValue, []);
      grouped.get(namespaceHashValue).push(item.record);
    });
    return Promise.all(Array.from(grouped, ([namespaceHashValue, groupedRecords]) => (
      upsertByHash(namespaceHashValue, groupedRecords, asOf, retryDelayMs)
    )));
  }

  return { clear, due, list, saveWorkerResult, saveWorkerResults, upsert };
}

module.exports = {
  LUA_SCRIPTS: {
    merge: ATOMIC_MERGE_AND_SCHEDULE_LUA,
    clear: ATOMIC_CLEAR_LUA,
    compact: ATOMIC_COMPACT_LUA
  },
  COMPLETED_CAP,
  COMPLETED_RETENTION_MS,
  DUE_KEY,
  SIGNAL_HORIZONS,
  compactDurableSignals,
  createDurableSignalStore,
  dueMember,
  mergeDurableSignalRecord,
  namespaceHash,
  nextSignalDueAt,
  normalizeDurableSignalRecord,
  parseDueMember,
  signalRecordId
};
