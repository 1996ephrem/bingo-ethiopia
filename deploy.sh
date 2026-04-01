#!/bin/bash
# Ubuntu VPS deployment script
# Run as: bash deploy.sh yourdomain.com

set -e
DOMAIN=$1

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash deploy.sh yourdomain.com"
  exit 1
fi

echo "==> Installing Docker & Certbot"
apt-get update -y
apt-get install -y docker.io docker-compose certbot

echo "==> Getting SSL certificate"
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN"

echo "==> Replacing domain placeholder in nginx.conf"
sed -i "s/yourdomain.com/$DOMAIN/g" nginx.conf

echo "==> Copying .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Edit .env with your tokens before continuing!"
  exit 1
fi

echo "==> Building and starting containers"
docker-compose up -d --build

echo "==> Setting Telegram webhook"
source .env
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://${DOMAIN}/bot/webhook"

echo ""
echo "✅ Deployed! Bot is live at https://$DOMAIN"
echo "   WebApp URL: https://$DOMAIN"
