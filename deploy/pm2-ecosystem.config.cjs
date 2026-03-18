// PM2 Ecosystem Config — Variational Grid Bot
// Jalankan: pm2 start deploy/pm2-ecosystem.config.cjs
// PM2 akan otomatis load .env dari root project

const path = require("path");
const ROOT = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "grid-bot-api",
      script: path.join(ROOT, "artifacts/api-server/dist/index.cjs"),
      cwd: ROOT,
      env_file: path.join(ROOT, ".env"),
      env: {
        PORT: "3721",
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
