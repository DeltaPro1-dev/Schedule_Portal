#!/usr/bin/env bash
# Daily portal robots (owner, 2026-10-19), one at a time so they never pile up. Same order as the old Windows
# tasks; SupplyPro and Buildertrend on weekdays only. Each robot has 20 minutes; a failure does not stop the others.
# Logs: /opt/delta-robots/integrations/logs/<robot>.log. Debug captures older than 14 days are removed.
set -u
cd /opt/delta-robots/integrations || exit 1
exec 9>/tmp/delta-robots.lock
flock -n 9 || { echo "$(date) another run is still going" >> logs/run-all.log; exit 0; }
mkdir -p logs

weekday=$(date +%u)   # 1 = Monday … 7 = Sunday
robots=()
if [ "$weekday" -le 5 ]; then robots+=("scrape supplypro" "scrape buildertrend"); fi
robots+=("scrape ivory" "scrape oakwood" "scrape arive" "scrape davidweekley" "scrape element" "scrape candlelight" "scrape dai" "scrape concord" "payments oakwood" "pos ivory")

echo "================ $(date) start ================" >> logs/run-all.log
for item in "${robots[@]}"; do
  kind=${item%% *}; name=${item#* }
  case "$kind" in
    scrape) cmd=(node run.js "$name"); log="logs/$name.log" ;;
    payments) cmd=(node payments.js "$name"); log="logs/payments-$name.log" ;;
    pos) cmd=(node pos.js "$name"); log="logs/pos-$name.log" ;;
  esac
  echo "================ $(date) ================" >> "$log"
  timeout 20m "${cmd[@]}" >> "$log" 2>&1
  status=$?
  echo "" >> "$log"
  echo "$(date '+%F %T') $item exit=$status" >> logs/run-all.log
done
echo "================ $(date) end ================" >> logs/run-all.log

find debug -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true
