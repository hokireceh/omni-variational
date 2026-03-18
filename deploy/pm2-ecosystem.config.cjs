// PM2 Ecosystem Config — Variational Grid Bot
// Jalankan: pm2 start deploy/pm2-ecosystem.config.cjs
// PM2 akan otomatis load .env dari root project

const path = require("path");
const ROOT = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "grid-bot-api",
      script: "tsx",
      args: "artifacts/api-server/src/index.ts",
      cwd: ROOT,
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      env_file: ".env",
      env: {
        PORT: "8080",
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "grid-bot-script",
      script: "tsx",
      args: "scripts/src/grid-bot.ts",
      cwd: ROOT,
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      env_file: ".env",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 5000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
