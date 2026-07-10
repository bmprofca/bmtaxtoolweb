#!/usr/bin/env bash
# Run on Hostinger Browser SSH (hPanel → Advanced → SSH Access → Open Terminal)
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-$HOME/domains/toolserver.bmtaxopc.com/nodejs}"
WEB_DIR="${WEB_DIR:-$HOME/bmtaxtoolweb}"
WEB_ROOT="${WEB_ROOT:-$HOME/domains/tool.bmtaxopc.com/public_html}"
WEB_REPO="${WEB_REPO:-https://github.com/bmprofca/bmtaxtoolweb.git}"

echo "==> Pulling API..."
export PATH="/opt/alt/alt-nodejs24/root/usr/bin:$PATH"
cd "$SERVER_DIR"
git pull origin main
npm install --omit=dev
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart bmtaxtoolserver || pm2 restart all || true
else
  echo "pm2 not found — restart Node.js from Hostinger hPanel if needed"
fi

echo "==> Pulling web app..."
if [[ ! -d "$WEB_DIR/.git" ]]; then
  git clone "$WEB_REPO" "$WEB_DIR"
fi
cd "$WEB_DIR"
git pull origin main
npm install
npm run build
rsync -a --delete dist/ "$WEB_ROOT/"

echo "==> Deploy complete"
echo "    App:  https://tool.bmtaxopc.com"
echo "    API:  https://toolserver.bmtaxopc.com/api/health"
