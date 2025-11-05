"use strict";
const assert = require("assert");
const fs = require("fs").promises;
const path = require("path");

const errorHandler = require("../error-handler");

(async function main() {
  try {
    await errorHandler.ensureErrorLogDir();
    await errorHandler.ensureAdminActivityLogDir();

    const errorsDir = path.join(__dirname, "../logs/errors");
    const adminActivityDir = path.join(__dirname, "../logs/admin-activity");
    const rootLogDir = path.join(__dirname, "../logs");

    // Write a synthetic error and ensure it is logged
    const testMessage = "Synthetic test error";
    const e = new Error(testMessage);
    await errorHandler.logError(e, { testCase: "error-handler.test", tag: "synthetic" });

    const todayFile = path.join(errorsDir, `errors-${new Date().toISOString().split("T")[0]}.log`);
    const content = await fs.readFile(todayFile, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    assert.ok(lines.length > 0, "Error log should have at least one entry");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.error.message, testMessage, "Logged error message should match");

    // Stats should include at least one error within the last day
    const stats = await errorHandler.getErrorStats(1);
    assert.ok(stats.total >= 1, "Stats total should be >= 1");
    assert.ok(stats.recent && Array.isArray(stats.recent), "Stats recent should be an array");

    // Create an old error log and verify cleanup removes it
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const oldDateStr = oldDate.toISOString().split("T")[0];
    const oldErrorFile = path.join(errorsDir, `errors-${oldDateStr}.log`);
    const oldEntry = { timestamp: oldDate.toISOString(), error: { name: "Error", message: "old" }, context: { fromTest: true } };
    await fs.mkdir(errorsDir, { recursive: true });
    await fs.appendFile(oldErrorFile, JSON.stringify(oldEntry) + "\n");
    await fs.utimes(oldErrorFile, oldDate, oldDate);

    const deletedErrors = await errorHandler.cleanOldErrorLogs(1);
    assert.ok(deletedErrors >= 1, "Should delete at least one old error log");
    try { await fs.access(oldErrorFile); throw new Error("Old error log still exists after cleanup"); } catch (_) {}

    // Create old admin activity logs in subfolder and root, ensure cleanup removes both
    const oldAdminFileSub = path.join(adminActivityDir, `admin-activity-${oldDateStr}.log`);
    const oldAdminFileRoot = path.join(rootLogDir, `admin-activity-${oldDateStr}.log`);
    await fs.mkdir(adminActivityDir, { recursive: true });
    await fs.appendFile(oldAdminFileSub, JSON.stringify({ timestamp: oldDate.toISOString(), action: "old", adminEmail: "test@example.com" }) + "\n");
    await fs.utimes(oldAdminFileSub, oldDate, oldDate);

    await fs.appendFile(oldAdminFileRoot, JSON.stringify({ timestamp: oldDate.toISOString(), action: "old", adminEmail: "test@example.com" }) + "\n");
    await fs.utimes(oldAdminFileRoot, oldDate, oldDate);

    const deletedAdmin = await errorHandler.cleanOldAdminActivityLogs(1);
    assert.ok(deletedAdmin >= 2, "Should delete old admin activity logs from both locations");
    try { await fs.access(oldAdminFileSub); throw new Error("Subfolder admin activity log still exists"); } catch (_) {}
    try { await fs.access(oldAdminFileRoot); throw new Error("Root admin activity log still exists"); } catch (_) {}

    console.log("PASS: error-handler tests passed");
  } catch (err) {
    console.error("FAIL: error-handler tests failed:", err.message);
    process.exit(1);
  }
})();