#!/usr/bin/env bash
# Install google-workspace-mcp as a systemd service on a Linux server.
#
# Deliberately isolated so it cannot collide with anything already on the box:
#
#   own user      gwsmcp, no login shell, no sudo
#   own directory /var/lib/google-workspace-mcp, mode 700, owned by that user
#   own port      8787 by default, bound to 127.0.0.1 only
#   own service   google-workspace-mcp.service
#
# It binds to loopback, so this script exposes nothing to the internet. Put it
# behind your existing reverse proxy, which is also where TLS belongs.
#
# Usage:  sudo bash install.sh [--port 8787]

set -euo pipefail

PORT=8787
while [[ $# -gt 0 ]]; do
  case $1 in
    --port) PORT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

USER_NAME=gwsmcp
DATA_DIR=/var/lib/google-workspace-mcp
GWS_BIN=/usr/local/bin/gws
GWS_VERSION=v0.22.5

[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }

if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "port ${PORT} is already in use. Pick another with --port." >&2
  exit 1
fi

command -v node >/dev/null || { echo "node 20 or newer is required" >&2; exit 1; }

# ── the gws CLI ───────────────────────────────────────────────────────────────
# Downloaded straight from Google's release, with its published checksum
# verified. Not through npm: a postinstall script is a worse place to fetch a
# binary that will hold a credential.
if [[ ! -x "$GWS_BIN" ]]; then
  case "$(uname -m)" in
    x86_64)  ARCH=x86_64-unknown-linux-gnu ;;
    aarch64) ARCH=aarch64-unknown-linux-gnu ;;
    *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  BASE="https://github.com/googleworkspace/cli/releases/download/${GWS_VERSION}"
  TMP=$(mktemp -d)
  echo "==> downloading gws ${GWS_VERSION} (${ARCH})"
  curl -fsSL -o "$TMP/gws.tar.gz"        "${BASE}/google-workspace-cli-${ARCH}.tar.gz"
  curl -fsSL -o "$TMP/gws.tar.gz.sha256" "${BASE}/google-workspace-cli-${ARCH}.tar.gz.sha256"
  ( cd "$TMP" && awk '{print $1"  gws.tar.gz"}' gws.tar.gz.sha256 | sha256sum -c - )
  tar xzf "$TMP/gws.tar.gz" -C "$TMP"
  install -m 755 "$TMP/gws" "$GWS_BIN"
  rm -rf "$TMP"
fi
echo "==> gws $("$GWS_BIN" --version | head -1)"

# ── the server ────────────────────────────────────────────────────────────────
echo "==> installing google-workspace-mcp"
npm install -g @thenavidm/google-workspace-mcp >/dev/null

id -u "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$USER_NAME"
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "$DATA_DIR"

# The bearer token protects a process that can read the whole mailbox, so it is
# generated here rather than left to a default, and kept out of the unit file
# where `systemctl cat` would print it.
ENV_FILE="$DATA_DIR/env"
if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<ENVEOF
GWS_MCP_TOKEN=${TOKEN}
GWS_BIN=${GWS_BIN}
GOOGLE_WORKSPACE_CLI_CONFIG_DIR=${DATA_DIR}/gws
# The OS keyring does not exist on a headless server, so credentials are
# encrypted into the config directory instead.
GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file
ENVEOF
  chown "$USER_NAME:$USER_NAME" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

cat > /etc/systemd/system/google-workspace-mcp.service <<UNITEOF
[Unit]
Description=Google Workspace MCP server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
EnvironmentFile=${ENV_FILE}
ExecStart=$(command -v google-workspace-mcp) --http --host 127.0.0.1 --port ${PORT}
Restart=on-failure
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable --now google-workspace-mcp

echo
echo "Installed and running on 127.0.0.1:${PORT}"
echo
echo "One thing left, and only you can do it: authenticate."
echo
echo "  sudo -u ${USER_NAME} env \$(cat ${ENV_FILE} | xargs) ${GWS_BIN} auth login"
echo
echo "That prints a URL. Open it on your laptop, approve, and paste the code back."
echo "Then check it:"
echo
echo "  sudo -u ${USER_NAME} env \$(cat ${ENV_FILE} | xargs) google-workspace-mcp doctor"
echo
echo "Your bearer token, needed by whatever connects to this server:"
echo
echo "  sudo grep GWS_MCP_TOKEN ${ENV_FILE}"
echo
echo "Point your reverse proxy at 127.0.0.1:${PORT} and give it a TLS hostname."
