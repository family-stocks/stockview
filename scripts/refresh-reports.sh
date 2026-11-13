#!/bin/sh
set -eu

: "${STOCKVIEW_REFRESH_URL:?Set the production HTTPS refresh endpoint}"
: "${STOCKVIEW_REPORT_REFRESH_SECRET:?Set the refresh secret}"
case "$STOCKVIEW_REFRESH_URL" in
  https://*/api/reports/refresh) ;;
  *) echo 'Expected an HTTPS StockView refresh URL' >&2; exit 1 ;;
esac

{
  printf 'header = "Authorization: Bearer %s"\n' "$STOCKVIEW_REPORT_REFRESH_SECRET"
  if [ -n "${STOCKVIEW_VERCEL_BYPASS_SECRET:-}" ]; then
    printf 'header = "x-vercel-protection-bypass: %s"\n' "$STOCKVIEW_VERCEL_BYPASS_SECRET"
  fi
} | /usr/bin/curl --config - --proto '=https' --silent --show-error --fail \
  --connect-timeout 10 --max-time 125 --request POST "$STOCKVIEW_REFRESH_URL"
printf '\n'
