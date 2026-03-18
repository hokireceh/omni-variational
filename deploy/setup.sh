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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

echo "===== 1. Install dependencies ====="
pnpm install --frozen-lockfile

echo "===== 2. Build libs ====="
pnpm run typecheck:libs 2>/dev/null || true

echo "===== 3. Build frontend ====="
BASE_PATH=/ pnpm --filter @workspace/grid-panel run build
echo "Frontend berhasil di-build ke: artifacts/grid-panel/dist/public/"

echo "===== 4. Build API server ====="
pnpm --filter @workspace/api-server run build
echo "API server berhasil di-build ke: artifacts/api-server/dist/index.cjs"

echo "===== 5. Pastikan .env ada ====="
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo ""
  echo "⚠️  File .env dibuat dari template."
  echo "    Edit .env dan isi WALLET_PRIVATE_KEY dan VR_TOKEN sebelum lanjut!"
  echo ""
  read -p "Tekan Enter setelah .env diisi..." _
fi

echo "===== 6. Start API server dengan PM2 ====="
pm2 delete grid-bot-api 2>/dev/null || true
pm2 start deploy/pm2-ecosystem.config.cjs
pm2 save
pm2 startup

echo ""
echo "===== ✅ Selesai! ====="
echo "  API Server  : http://localhost:3721/api/healthz"
echo "  Frontend    : artifacts/grid-panel/dist/public/"
echo "  PM2 Status  : pm2 status"
echo "  API Logs    : pm2 logs grid-bot-api"
echo ""
echo "  Arahkan Document Root website di aaPanel ke:"
echo "  $ROOT/artifacts/grid-panel/dist/public"
echo ""
echo "  Pastikan Reverse Proxy di aaPanel sudah diset:"
echo "  /api/ → http://127.0.0.1:3721/api/"
