# Pinned to a digest, not a tag: `node:22-alpine` moves, and a server holding a
# Google credential should not change underneath you on a rebuild.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ARG GWS_VERSION=v0.22.5
ARG TARGETARCH

# The gws binary comes from Google's release with its checksum verified, rather
# than from an npm postinstall. It is the thing that will hold the credential.
RUN apk add --no-cache curl ca-certificates \
 && case "$TARGETARCH" in \
      amd64) A=x86_64-unknown-linux-musl ;; \
      arm64) A=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac \
 && B="https://github.com/googleworkspace/cli/releases/download/${GWS_VERSION}" \
 && curl -fsSL -o /tmp/gws.tar.gz "${B}/google-workspace-cli-${A}.tar.gz" \
 && curl -fsSL -o /tmp/gws.sha256 "${B}/google-workspace-cli-${A}.tar.gz.sha256" \
 && awk '{print $1"  /tmp/gws.tar.gz"}' /tmp/gws.sha256 | sha256sum -c - \
 && tar xzf /tmp/gws.tar.gz -C /tmp \
 && install -m 755 /tmp/gws /usr/local/bin/gws \
 && rm -rf /tmp/* \
 && apk del curl

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# A headless container has no OS keyring, so credentials are encrypted into the
# config directory. Mount it read-write: gws writes cached discovery documents
# and its encryption key there, not just the token.
ENV GOOGLE_WORKSPACE_CLI_CONFIG_DIR=/home/node/.config/gws \
    GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file \
    GWS_BIN=/usr/local/bin/gws

USER node
EXPOSE 8787
# GWS_MCP_TOKEN must be supplied at run time. The server refuses to start in
# HTTP mode without it.
CMD ["node", "dist/index.js", "--http", "--host", "0.0.0.0", "--port", "8787"]
