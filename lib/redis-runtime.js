'use strict';

const { Redis } = require('@upstash/redis');

let redisClient = null;
let redisIdentity = null;

function redisConfig(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  return { configured: /^https:\/\//.test(url) && token.length >= 16, url, token };
}

function getRedis(env = process.env) {
  const config = redisConfig(env);
  if (!config.configured) return null;
  const identity = `${config.url}|${config.token}`;
  if (!redisClient || redisIdentity !== identity) {
    redisClient = new Redis({ url: config.url, token: config.token, enableTelemetry: false });
    redisIdentity = identity;
  }
  return redisClient;
}

function resetRedisForTests() {
  redisClient = null;
  redisIdentity = null;
}

module.exports = { getRedis, redisConfig, resetRedisForTests };
