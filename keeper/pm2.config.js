/**
 * PM2 ecosystem config for RWA Vault keeper bots.
 *
 * Usage:
 *   cd keeper
 *   cp .env.example .env && nano .env   # fill in keys/addresses
 *   npm install
 *   pm2 start pm2.config.js
 *   pm2 logs
 *   pm2 save && pm2 startup             # persist across reboots
 */

"use strict";

module.exports = {
  apps: [
    {
      // ── Rebalancer keeper ───────────────────────────────────────────────────
      name: "keeper-rebalance",
      script: "./node_modules/.bin/tsx",
      args: "rebalance.ts",
      cwd: __dirname,

      // Restart on crash, with exponential back-off capped at 30 s
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 5_000,
      exp_backoff_restart_delay: 100,

      // Environment
      env: {
        NODE_ENV: "production",
      },

      // Logging — pm2 rotates these automatically when logrotate plugin is installed
      out_file: "./logs/rebalance-out.log",
      error_file: "./logs/rebalance-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Memory guard — restart if the process leaks above 256 MB
      max_memory_restart: "256M",
    },

    {
      // ── Harvest keeper ──────────────────────────────────────────────────────
      name: "keeper-harvest",
      script: "./node_modules/.bin/tsx",
      args: "harvest.ts",
      cwd: __dirname,

      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 5_000,
      exp_backoff_restart_delay: 100,

      env: {
        NODE_ENV: "production",
      },

      out_file: "./logs/harvest-out.log",
      error_file: "./logs/harvest-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      max_memory_restart: "256M",
    },
  ],
};
