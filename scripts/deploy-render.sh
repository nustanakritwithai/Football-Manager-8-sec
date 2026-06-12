#!/usr/bin/env bash
set -euo pipefail

API_KEY="${RENDER_API_KEY:?Set RENDER_API_KEY (Render Dashboard → Account Settings → API Keys)}"
OWNER_ID="${RENDER_OWNER_ID:?Set RENDER_OWNER_ID (Render Dashboard → Workspace Settings → Workspace ID)}"
SERVICE_ID="${RENDER_SERVICE_ID:-}"
REPO="${RENDER_REPO:-https://github.com/nustanakritwithai/Football-Manager-8-sec}"
BRANCH="${RENDER_BRANCH:-claude/tactic-manager-lab-design-cvyqs9}"
SERVICE_NAME="${RENDER_SERVICE_NAME:-tactic-manager-lab}"

api() {
  curl -fsS "$@" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json"
}

read_field() {
  local json="$1" expr="$2"
  python3 -c "import json,sys; d=json.load(sys.stdin); print(${expr})" <<<"${json}"
}

if [[ -z "${SERVICE_ID}" ]]; then
  echo "Creating Render static site '${SERVICE_NAME}'..."
  response="$(api -X POST "https://api.render.com/v1/services" -d @- <<EOF
{
  "type": "static_site",
  "name": "${SERVICE_NAME}",
  "ownerId": "${OWNER_ID}",
  "repo": "${REPO}",
  "branch": "${BRANCH}",
  "autoDeploy": "yes",
  "serviceDetails": {
    "buildCommand": "echo Static site",
    "publishPath": "."
  }
}
EOF
)"
  SERVICE_ID="$(read_field "${response}" "d.get('id') or d.get('service', {}).get('id', '')")"
  echo "Created service: ${SERVICE_ID}"
else
  echo "Using existing service: ${SERVICE_ID}"
fi

echo "Triggering deploy..."
api -X POST "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
  -d '{"clearCache":"clear"}' >/dev/null

service_json="$(api "https://api.render.com/v1/services/${SERVICE_ID}")"
url="$(read_field "${service_json}" "d.get('serviceDetails', {}).get('url', '')")"

echo ""
echo "Deploy started."
echo "Service ID: ${SERVICE_ID}"
if [[ -n "${url}" ]]; then
  echo "Live URL: ${url}"
else
  echo "Dashboard: https://dashboard.render.com/static/${SERVICE_ID}"
fi
