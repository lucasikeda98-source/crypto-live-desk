'use strict';

// Executa os scripts Lua de producao (durable-signals) numa VM Lua real (fengari),
// com shims fieis de `redis.call` e `cjson` sobre um armazenamento em memoria.
// Motivacao: REV-CC-01/ANL-027 — o fake anterior reimplementava o merge em JS e
// nao detectaria divergencia de semantica do Lua real.

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const NULL_SENTINEL_KEY = 'cld_cjson_null_sentinel';

function pushNullSentinel(L) {
  lua.lua_getfield(L, lua.LUA_REGISTRYINDEX, to_luastring(NULL_SENTINEL_KEY));
}

function pushJsonValue(L, value) {
  if (value === null || value === undefined) { pushNullSentinel(L); return; }
  if (typeof value === 'number') { lua.lua_pushnumber(L, value); return; }
  if (typeof value === 'string') { lua.lua_pushstring(L, to_luastring(value)); return; }
  if (typeof value === 'boolean') { lua.lua_pushboolean(L, value); return; }
  if (Array.isArray(value)) {
    lua.lua_createtable(L, value.length, 0);
    value.forEach((item, index) => {
      pushJsonValue(L, item);
      lua.lua_rawseti(L, -2, index + 1);
    });
    return;
  }
  const entries = Object.entries(value);
  lua.lua_createtable(L, 0, entries.length);
  entries.forEach(([key, item]) => {
    lua.lua_pushstring(L, to_luastring(key));
    pushJsonValue(L, item);
    lua.lua_settable(L, -3);
  });
}

function readLuaValue(L, index) {
  const absolute = lua.lua_absindex(L, index);
  const type = lua.lua_type(L, absolute);
  if (type === lua.LUA_TNIL || type === lua.LUA_TNONE) return null;
  if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, absolute);
  if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(L, absolute);
  if (type === lua.LUA_TSTRING) return to_jsstring(lua.lua_tostring(L, absolute));
  if (type !== lua.LUA_TTABLE) throw new TypeError(`unsupported lua type ${type}`);
  pushNullSentinel(L);
  const isNullSentinel = lua.lua_rawequal(L, absolute, -1);
  lua.lua_pop(L, 1);
  if (isNullSentinel) return null;
  const sequenceLength = lua.lua_rawlen(L, absolute);
  const byKey = {};
  let entryCount = 0;
  let isSequence = sequenceLength > 0;
  lua.lua_pushnil(L);
  while (lua.lua_next(L, absolute) !== 0) {
    const keyType = lua.lua_type(L, -2);
    let key;
    if (keyType === lua.LUA_TNUMBER) {
      key = lua.lua_tonumber(L, -2);
      if (!Number.isInteger(key) || key < 1 || key > sequenceLength) isSequence = false;
    } else {
      key = to_jsstring(lua.lua_tostring(L, -2));
      isSequence = false;
    }
    byKey[key] = readLuaValue(L, -1);
    entryCount += 1;
    lua.lua_pop(L, 1);
  }
  if (isSequence && entryCount === sequenceLength) {
    return Array.from({ length: sequenceLength }, (_unused, position) => byKey[position + 1]);
  }
  return byKey;
}

function pushStringList(L, values) {
  lua.lua_createtable(L, values.length, 0);
  values.forEach((value, index) => {
    lua.lua_pushstring(L, to_luastring(String(value)));
    lua.lua_rawseti(L, -2, index + 1);
  });
}

function createRedisCall(store) {
  return function redisCall(L) {
    const argumentCount = lua.lua_gettop(L);
    const parts = [];
    for (let index = 1; index <= argumentCount; index += 1) {
      const type = lua.lua_type(L, index);
      if (type === lua.LUA_TNUMBER) parts.push(String(lua.lua_tonumber(L, index)));
      else parts.push(to_jsstring(lua.lua_tostring(L, index)));
    }
    const [command, key, ...rest] = parts;
    switch (String(command).toUpperCase()) {
      case 'HGET': {
        const value = store.hashes.get(key)?.get(rest[0]);
        if (value === undefined) lua.lua_pushboolean(L, false);
        else lua.lua_pushstring(L, to_luastring(value));
        return 1;
      }
      case 'HSET': {
        if (!store.hashes.has(key)) store.hashes.set(key, new Map());
        let added = 0;
        for (let index = 0; index < rest.length; index += 2) {
          if (!store.hashes.get(key).has(rest[index])) added += 1;
          store.hashes.get(key).set(rest[index], rest[index + 1]);
        }
        lua.lua_pushnumber(L, added);
        return 1;
      }
      case 'HDEL': {
        const removed = store.hashes.get(key)?.delete(rest[0]) ? 1 : 0;
        lua.lua_pushnumber(L, removed);
        return 1;
      }
      case 'HKEYS': {
        pushStringList(L, Array.from(store.hashes.get(key)?.keys() || []));
        return 1;
      }
      case 'HVALS': {
        pushStringList(L, Array.from(store.hashes.get(key)?.values() || []));
        return 1;
      }
      case 'HGETALL': {
        const flat = [];
        (store.hashes.get(key) || new Map()).forEach((value, field) => { flat.push(field, value); });
        pushStringList(L, flat);
        return 1;
      }
      case 'DEL': {
        const removed = store.hashes.delete(key) ? 1 : 0;
        store.expiries.delete(key);
        lua.lua_pushnumber(L, removed);
        return 1;
      }
      case 'EXPIRE': {
        store.expiries.set(key, Number(rest[0]));
        lua.lua_pushnumber(L, 1);
        return 1;
      }
      case 'ZADD': {
        if (!store.sorted.has(key)) store.sorted.set(key, new Map());
        const added = store.sorted.get(key).has(rest[1]) ? 0 : 1;
        store.sorted.get(key).set(rest[1], Number(rest[0]));
        lua.lua_pushnumber(L, added);
        return 1;
      }
      case 'ZREM': {
        const removed = store.sorted.get(key)?.delete(rest[0]) ? 1 : 0;
        lua.lua_pushnumber(L, removed);
        return 1;
      }
      default:
        return lauxlib.luaL_error(L, to_luastring(`unsupported redis command ${command}`));
    }
  };
}

function evalLuaScript(store, script, keys, args) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  lua.lua_newtable(L);
  lua.lua_setfield(L, lua.LUA_REGISTRYINDEX, to_luastring(NULL_SENTINEL_KEY));

  // cjson
  lua.lua_createtable(L, 0, 3);
  lua.lua_pushcfunction(L, (state) => {
    const value = readLuaValue(state, 1);
    lua.lua_pushstring(state, to_luastring(JSON.stringify(value)));
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('encode'));
  lua.lua_pushcfunction(L, (state) => {
    const raw = to_jsstring(lua.lua_tostring(state, 1));
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return lauxlib.luaL_error(state, to_luastring('invalid json text'));
    }
    pushJsonValue(state, parsed);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('decode'));
  pushNullSentinel(L);
  lua.lua_setfield(L, -2, to_luastring('null'));
  lua.lua_setglobal(L, to_luastring('cjson'));

  // redis
  lua.lua_createtable(L, 0, 1);
  lua.lua_pushcfunction(L, createRedisCall(store));
  lua.lua_setfield(L, -2, to_luastring('call'));
  lua.lua_setglobal(L, to_luastring('redis'));

  pushStringList(L, keys.map(String));
  lua.lua_setglobal(L, to_luastring('KEYS'));
  pushStringList(L, args.map(String));
  lua.lua_setglobal(L, to_luastring('ARGV'));

  if (lauxlib.luaL_loadstring(L, to_luastring(script)) !== lua.LUA_OK) {
    throw new Error(`lua compile error: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(`lua runtime error: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  return readLuaValue(L, -1);
}

// Cliente Redis em memoria cujo `eval` executa o script Lua REAL numa VM Lua.
class LuaRedis {
  constructor() {
    this.hashes = new Map();
    this.sorted = new Map();
    this.expiries = new Map();
  }
  async eval(script, keys, args) {
    return evalLuaScript(this, script, keys, args);
  }
  async hget(key, field) { return this.hashes.get(key)?.get(field) ?? null; }
  async hset(key, values) {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    Object.entries(values).forEach(([field, value]) => this.hashes.get(key).set(field, value));
  }
  async hvals(key) { return Array.from(this.hashes.get(key)?.values() || []); }
  async hdel(key, field) { this.hashes.get(key)?.delete(field); }
  async expire(key, seconds) { this.expiries.set(key, seconds); }
  async del(key) { this.hashes.delete(key); }
  async zadd(key, entry) {
    if (!this.sorted.has(key)) this.sorted.set(key, new Map());
    this.sorted.get(key).set(entry.member, entry.score);
  }
  async zrem(key, member) { this.sorted.get(key)?.delete(member); }
  async zrange(key, min, max, options) {
    const rows = Array.from(this.sorted.get(key)?.entries() || [])
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1]);
    const offset = options?.offset || 0;
    const count = options?.count ?? rows.length;
    return rows.slice(offset, offset + count).map(([member]) => member);
  }
}

module.exports = { LuaRedis, evalLuaScript };
