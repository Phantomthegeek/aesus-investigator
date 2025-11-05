"use strict";

const logger = require('../logger');
const errorHandler = require('../error-handler');
const retention = require('../data-retention');

function assert(condition, name) {
  if (!condition) {
    console.error('FAIL:', name);
    process.exitCode = 1;
  } else {
    console.log('PASS:', name);
  }
}

(async function main() {
  try {
    logger.info('Test log from basic.test.js', { env: process.env.NODE_ENV || 'development' });

    // error-handler exports
    assert(typeof errorHandler.logError === 'function', 'error-handler: logError exists');
    assert(typeof errorHandler.getErrorStats === 'function', 'error-handler: getErrorStats exists');
    assert(typeof errorHandler.cleanOldErrorLogs === 'function', 'error-handler: cleanOldErrorLogs exists');
    assert(typeof errorHandler.cleanOldAdminActivityLogs === 'function', 'error-handler: cleanOldAdminActivityLogs exists');
    assert(typeof errorHandler.errorHandler === 'function', 'error-handler: middleware exists');

    // data-retention exports
    assert(typeof retention.cleanupOldCases === 'function', 'data-retention: cleanupOldCases exists');
    assert(typeof retention.exportCaseData === 'function', 'data-retention: exportCaseData exists');
    assert(typeof retention.deleteCaseData === 'function', 'data-retention: deleteCaseData exists');
    assert(typeof retention.getRetentionStats === 'function', 'data-retention: getRetentionStats exists');
    assert(typeof retention.scheduleDailyCleanup === 'function', 'data-retention: scheduleDailyCleanup exists');

    console.log('All checks completed.');
    if (!process.exitCode) process.exit(0);
    else process.exit(process.exitCode);
  } catch (e) {
    console.error('Test runner error:', e.message);
    process.exit(1);
  }
})();