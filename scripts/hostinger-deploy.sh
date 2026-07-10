#!/usr/bin/env bash
# Run on Hostinger Browser SSH (hPanel → Advanced → SSH Access → Open Terminal)
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-$HOME/bmtaxtoolserver}"
WEB_DIR="${WEB_DIR:-$HOME/bmtaxtoolweb}"
WEB_ROOT="${WEB_ROOT:-$HOME/domains/tool.bmtaxopc.com/public_html}"

echo "==> Pulling API..."
cd "$SERVER_DIR"
git pull origin main
npm install --omit=dev
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart bmtaxtoolserver || pm2 restart all
else
  echo "pm2 not found — restart Node.js from Hostinger hPanel if needed"
fi

echo "==> Pulling web app..."
cd "$WEB_DIR"
git pull origin main
npm install
npm run build
rsync -a --delete dist/ "$WEB_ROOT/"

echo "==> Deploy complete"
echo "    App:  https://tool.bmtaxopc.com"
echo "    API:  https://toolserver.bmtaxopc.com/api/health"
