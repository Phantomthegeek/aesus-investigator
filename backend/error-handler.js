/**
 * Centralized Error Handling and Logging
 * 
 * This module provides centralized error tracking, logging, and monitoring
 * for the Aesus Asset Reclaim application.
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

// Error log directory
const ERROR_LOG_DIR = path.join(__dirname, 'logs', 'errors');
const ADMIN_ACTIVITY_LOG_DIR = path.join(__dirname, 'logs', 'admin-activity');

// Ensure error log directory exists
async function ensureErrorLogDir() {
  try {
    await fs.mkdir(ERROR_LOG_DIR, { recursive: true });
    try { logger.info('Error log directory ready', { dir: ERROR_LOG_DIR }); } catch (_) {}
  } catch (error) {
    logger.error('Failed to create error log directory', { error: error.message });
  }
}

// Initialize on load
ensureErrorLogDir();
async function ensureAdminActivityLogDir() {
  try { await fs.mkdir(ADMIN_ACTIVITY_LOG_DIR, { recursive: true }); } catch (_) {}
}
ensureAdminActivityLogDir();

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
    return JSON.stringify({ message: "Non-serializable payload", error: e.message });
  }
}

const SENSITIVE_KEYS = new Set([
  'password','pass','pwd','token','auth','authorization','cookie','set-cookie','jwt','secret','apiKey','apikey','x-api-key'
]);

function scrubSensitiveKeys(obj, maxStringLen = 256) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  const entries = Object.entries(obj).slice(0, 1000); // cap entries
  for (const [k, v] of entries) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v.length > maxStringLen ? v.slice(0, maxStringLen) + '…' : v;
    } else if (typeof v === 'number' || typeof v === 'boolean' || v == null) {
      out[k] = v;
    } else if (typeof v === 'object') {
      out[k] = '[Object]'; // avoid deep nesting
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

function sanitizePayload(payload, maxLength = 2000) {
  try {
    const json = safeStringify(payload);
    if (json.length > maxLength) {
      const keys = (payload && typeof payload === 'object') ? Object.keys(payload).length : undefined;
      return { type: typeof payload, truncated: true, approxSize: json.length, keys };
    }
    if (payload && typeof payload === 'object') {
      return scrubSensitiveKeys(payload);
    }
    if (typeof payload === 'string') {
      return payload.length > 256 ? payload.slice(0, 256) + '…' : payload;
    }
    return payload;
  } catch (_) {
    return { type: typeof payload, value: '[Unserializable]' };
  }
}

function sanitizeContext(context = {}) {
  const base = {
    nodeVersion: process.version,
    platform: process.platform
  };
  const clean = scrubSensitiveKeys(context);
  // Also sanitize nested common fields if present
  if (clean.body !== undefined) clean.body = sanitizePayload(clean.body);
  if (clean.query !== undefined) clean.query = sanitizePayload(clean.query);
  if (clean.params !== undefined) clean.params = sanitizePayload(clean.params);
  return { ...base, ...clean };
}

function buildRequestContext(req) {
  return sanitizeContext({
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: (typeof req.get === 'function' ? req.get('user-agent') : undefined),
    body: req.body,
    query: req.query,
    params: req.params
  });
}

/**
 * Log error to file
 */
async function logError(error, context = {}) {
  try {
    const logFile = path.join(
      ERROR_LOG_DIR,
      `errors-${new Date().toISOString().split('T')[0]}.log`
    );
    
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack || null,
        name: error.name || 'Error',
        code: error.code || null
      },
      context: sanitizeContext(context)
    };

    await ensureErrorLogDir();
    await fs.appendFile(logFile, safeStringify(errorEntry) + '\n');
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      try { logger.error('Error logged', errorEntry); } catch (_) {}
    }
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
}

/**
 * Get error statistics
 */
async function getErrorStats(days = 7) {
  try {
    const errors = [];
    const files = await fs.readdir(ERROR_LOG_DIR);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    for (const file of files) {
      if (file.startsWith('errors-') && file.endsWith('.log')) {
        const filePath = path.join(ERROR_LOG_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        const lines = content.trim().split('\n').filter(l => l);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (new Date(entry.timestamp) >= cutoffDate) {
              errors.push(entry);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
    
    // Analyze errors
    const stats = {
      total: errors.length,
      byType: {},
      byDay: {},
      recent: errors.slice(-10)
    };
    
    errors.forEach(entry => {
      // Count by error type
      const errorType = entry.error.name || 'Unknown';
      stats.byType[errorType] = (stats.byType[errorType] || 0) + 1;
      
      // Count by day
      const day = entry.timestamp.split('T')[0];
      stats.byDay[day] = (stats.byDay[day] || 0) + 1;
    });
    
    return stats;
  } catch (error) {
    console.error('Failed to get error stats:', error);
    return { total: 0, byType: {}, byDay: {}, recent: [] };
  }
}

/**
 * Clean old error logs (retention policy)
 */
async function cleanOldErrorLogs(retentionDays = parseInt(process.env.ERROR_LOG_RETENTION_DAYS) || 30) {
  try {
    const files = await fs.readdir(ERROR_LOG_DIR);
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const file of files) {
      if (file.startsWith('errors-') && file.endsWith('.log')) {
        const filePath = path.join(ERROR_LOG_DIR, file);
        let stats;
        try {
          stats = await fs.stat(filePath);
        } catch (_) {
          continue; // Skip files that can't be stat'ed
        }
        if ((stats.mtimeMs || stats.mtime.getTime()) < cutoffTime) {
          try {
            await fs.unlink(filePath);
            deleted++;
          } catch (e) {
            logger.warn('Failed to delete old error log', { file: filePath, error: e.message });
          }
        }
      }
    }
    if (deleted > 0) {
      logger.info('Cleaned up old error logs', { deleted, retentionDays });
    }
    return deleted;
  } catch (error) {
    logger.error('Failed to clean old error logs', { error: error.message });
    return 0;
  }
}

/**
 * Express error middleware
 */
function errorHandler(err, req, res, next) {
  // Log the error with sanitized request context
  logError(err, buildRequestContext(req));
  
  // Send appropriate response
  if (err.code === 'ENOENT') {
    return res.status(404).json({ 
      success: false, 
      error: 'Resource not found' 
    });
  }
  
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return res.status(403).json({ 
      success: false, 
      error: 'Permission denied' 
    });
  }
  
  // Default error response
  res.status(err.status || 500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
}

async function cleanOldAdminActivityLogs(retentionDays = parseInt(process.env.ADMIN_ACTIVITY_LOG_RETENTION_DAYS) || 90) {
  try {
    await ensureAdminActivityLogDir();
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    // Subfolder admin-activity logs
    try {
      const files = await fs.readdir(ADMIN_ACTIVITY_LOG_DIR);
      for (const file of files) {
        if (file.startsWith('admin-activity-') && file.endsWith('.log')) {
          const filePath = path.join(ADMIN_ACTIVITY_LOG_DIR, file);
          let stats;
          try { stats = await fs.stat(filePath); } catch (_) { continue; }
          if ((stats.mtimeMs || stats.mtime.getTime()) < cutoffTime) {
            try { await fs.unlink(filePath); deleted++; } catch (e) { logger.warn('Failed to delete admin activity log', { file: filePath, error: e.message }); }
          }
        }
      }
    } catch (_) {}

    // Legacy top-level admin-activity logs in backend/logs
    try {
      const rootLogDir = path.join(__dirname, 'logs');
      const rootFiles = await fs.readdir(rootLogDir);
      for (const file of rootFiles) {
        if (file.startsWith('admin-activity-') && file.endsWith('.log')) {
          const filePath = path.join(rootLogDir, file);
          let stats;
          try { stats = await fs.stat(filePath); } catch (_) { continue; }
          if ((stats.mtimeMs || stats.mtime.getTime()) < cutoffTime) {
            try { await fs.unlink(filePath); deleted++; } catch (e) { logger.warn('Failed to delete admin activity log', { file: filePath, error: e.message }); }
          }
        }
      }
    } catch (_) {}

    if (deleted > 0) { logger.info('Cleaned up old admin activity logs', { deleted, retentionDays }); }
    return deleted;
  } catch (error) {
    logger.error('Failed to clean old admin activity logs', { error: error.message });
    return 0;
  }
}

module.exports = {
  logError,
  getErrorStats,
  cleanOldErrorLogs,
  cleanOldAdminActivityLogs,
  errorHandler,
  ensureErrorLogDir,
  ensureAdminActivityLogDir
};

