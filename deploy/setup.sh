#!/bin/bash
# ============================================================
# Setup script — Variational Grid Bot
# Jalankan sekali di server aaPanel kamu
#
# Kebutuhan:
#   - Node.js 20+ (install via aaPanel → App Store → Node.js)
#   - pnpm  (npm install -g pnpm)
#   - pm2   (npm install -g pm2)
# ============================================================

set -e

DEPLOY_DIR="/www/wwwroot/grid-bot"
FRONTEND_DIR="$DEPLOY_DIR/frontend"

echo "===== 1. Install dependencies ====="
pnpm install --frozen-lockfile

echo "===== 2. Build libs ====="
pnpm run typecheck:libs 2>/dev/null || true

echo "===== 3. Build frontend ====="
pnpm --filter @workspace/grid-panel run build
mkdir -p "$FRONTEND_DIR"
cp -r artifacts/grid-panel/dist/public/. "$FRONTEND_DIR/"
echo "Frontend di-copy ke $FRONTEND_DIR"

echo "===== 4. Pastikan .env ada ====="
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  File .env dibuat dari template."
  echo "    Edit .env dan isi WALLET_PRIVATE_KEY dan VR_TOKEN sebelum lanjut!"
  echo ""
  read -p "Tekan Enter setelah .env diisi..." _
fi

echo "===== 5. Start services dengan PM2 ====="

# API Server
pm2 delete grid-bot-api 2>/dev/null || true
pm2 start --name grid-bot-api \
  --interpreter node \
  npx -- tsx artifacts/api-server/src/index.ts \
  --env-file .env \
  -- PORT=8080

# Grid Bot Script
pm2 delete grid-bot-script 2>/dev/null || true
pm2 start --name grid-bot-script \
  --interpreter node \
  npx -- tsx scripts/src/grid-bot.ts

pm2 save
pm2 startup

echo ""
echo "===== ✅ Selesai! ====="
echo "  API Server  : http://localhost:8080/api/healthz"
echo "  PM2 Status  : pm2 status"
echo "  API Logs    : pm2 logs grid-bot-api"
echo "  Bot Logs    : pm2 logs grid-bot-script"
echo ""
echo "  Aktifkan Apache vhost dari: deploy/apache-vhost.conf"
echo "  Lalu akses panel di: http://yourdomain.com/"
