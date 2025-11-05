"use strict";

// Simple centralized JSON logger with levels and context
// Usage: const logger = require('./logger'); logger.info('message', { key: 'value' })

const ENV = process.env.NODE_ENV || 'development';
const DEFAULT_LEVEL = (process.env.LOG_LEVEL || (ENV === 'production' ? 'info' : 'debug')).toLowerCase();

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel() {
  return LEVELS[DEFAULT_LEVEL] !== undefined ? LEVELS[DEFAULT_LEVEL] : LEVELS.info;
}

function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj, getCircularReplacer());
  } catch (e) {
    return JSON.stringify({ message: "Non-serializable log payload", error: e.message });
  }
}

function format(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    level,
    message: typeof message === 'string' ? message : String(message),
    meta: meta && typeof meta === 'object' ? meta : undefined
  };
  try {
    return safeStringify(entry);
  } catch (_) {
    return JSON.stringify({ timestamp: entry.timestamp, pid: entry.pid, level, message: "[Unserializable message]", meta: "[Unserializable meta]" });
  }
}

function emit(level, message, meta) {
  // Respect log level threshold
  if (LEVELS[level] < currentLevel()) return;
  const line = format(level, message, meta);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
  createLogger: (contextMeta = {}) => ({
    debug: (message, meta = {}) => emit('debug', message, { ...contextMeta, ...meta }),
    info: (message, meta = {}) => emit('info', message, { ...contextMeta, ...meta }),
    warn: (message, meta = {}) => emit('warn', message, { ...contextMeta, ...meta }),
    error: (message, meta = {}) => emit('error', message, { ...contextMeta, ...meta })
  })
};

module.exports = logger;