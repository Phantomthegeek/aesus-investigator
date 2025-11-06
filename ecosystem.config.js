/**
 * PM2 Ecosystem Configuration
 * 
 * This file configures PM2 (Process Manager) for running the backend server
 * in production. PM2 provides:
 * - Automatic restarts on crashes
 * - Log management
 * - Process monitoring
 * - Auto-start on server reboot
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup  # Enable auto-start on reboot
 */

module.exports = {
  apps: [{
    // Application name (used in PM2 commands)
    name: 'aesus-backend',
    
    // Path to the main server file
    script: './backend/server.js',
    
    // Working directory
    cwd: process.cwd(),
    
    // Number of instances (1 for small apps, 'max' for cluster mode)
    instances: 1,
    
    // Execution mode: 'fork' for single instance, 'cluster' for multiple
    exec_mode: 'fork',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Development environment (override with --env development)
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    
    // Log file paths
    error_file: './backend/logs/pm2-error.log',
    out_file: './backend/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Auto-restart settings
    autorestart: true,        // Restart on crash
    watch: false,             // Don't watch for file changes (production)
    max_memory_restart: '500M', // Restart if memory exceeds 500MB
    
    // Advanced settings
    min_uptime: '10s',        // Minimum uptime to consider app stable
    max_restarts: 10,         // Max restarts in 1 minute
    restart_delay: 4000,     // Delay between restarts (ms)
    
    // Ignore specific file patterns when watching
    ignore_watch: [
      'node_modules',
      'logs',
      'uploads',
      'data',
      '.git'
    ]
  }]
};

