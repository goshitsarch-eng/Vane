#!/bin/sh
set -e

echo "Starting SearXNG..."

SEARCH_BACKEND="${SEARCH_BACKEND:-searxng}"

if [ "$SEARCH_BACKEND" != "searxng" ]; then
  case "$SEARCH_BACKEND" in
    brave|bing|google|duckduckgo|startpage|yahoo|qwant|wikipedia|wikidata)
      echo "Direct search backend '$SEARCH_BACKEND' is configured — disabling '$SEARCH_BACKEND' engine in SearXNG to avoid double API calls."
      printf '\n  - name: %s\n    disabled: true\n' "$SEARCH_BACKEND" >> /etc/searxng/settings.yml
      ;;
    *)
      echo "Direct search backend '$SEARCH_BACKEND' is configured — not a known SearXNG engine, skipping SearXNG config modification."
      ;;
  esac
fi

sudo -H -u searxng bash -c "cd /usr/local/searxng/searxng-src && export SEARXNG_SETTINGS_PATH='/etc/searxng/settings.yml' && export FLASK_APP=searx/webapp.py && /usr/local/searxng/searx-pyenv/bin/python -m flask run --host=0.0.0.0 --port=8080" &
SEARXNG_PID=$!

echo "Waiting for SearXNG to be ready..."
sleep 5

COUNTER=0
MAX_TRIES=30
until curl -s http://localhost:8080 > /dev/null 2>&1; do
  COUNTER=$((COUNTER+1))
  if [ $COUNTER -ge $MAX_TRIES ]; then
    echo "Warning: SearXNG health check timeout, but continuing..."
    break
  fi
  sleep 1
done

if curl -s http://localhost:8080 > /dev/null 2>&1; then
  echo "SearXNG started successfully (PID: $SEARXNG_PID)"
else
  echo "SearXNG may not be fully ready, but continuing (PID: $SEARXNG_PID)"
fi

cd /home/vane
echo "Starting Vane..."

exec node server.js
