#!/usr/bin/env bash
# Delta portal robots server (owner, 2026-10-19): Node 22, Google Chrome, Utah time zone, the robots in
# /opt/delta-robots/integrations and the daily run at 09:00 (America/Denver), one robot at a time.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

timedatectl set-timezone America/Denver
apt-get update -y
apt-get install -y curl ca-certificates gnupg git xvfb unzip fonts-liberation

if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v google-chrome >/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y /tmp/chrome.deb
  rm -f /tmp/chrome.deb
fi

id robots >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/delta-robots --shell /bin/bash robots
mkdir -p /opt/delta-robots
tar -xzf /tmp/integrations.tgz -C /opt/delta-robots
install -m 0755 /tmp/run-all.sh /opt/delta-robots/run-all.sh
chown -R robots:robots /opt/delta-robots
chmod 600 /opt/delta-robots/integrations/.env

cd /opt/delta-robots/integrations
sudo -u robots npm ci --no-audit --no-fund
npx --yes playwright install-deps chromium

# Daily at 09:00 Utah time; the run itself goes through the robots one by one.
echo '0 9 * * * robots /opt/delta-robots/run-all.sh' > /etc/cron.d/delta-robots
chmod 644 /etc/cron.d/delta-robots

node -v; google-chrome --version; echo "setup ok"
