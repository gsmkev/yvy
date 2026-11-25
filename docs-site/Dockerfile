# Imagen para generar y servir la documentación sin instalar Node, pnpm ni uv en la máquina.
FROM node:22.23.5-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb
COPY --from=ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_PYTHON_INSTALL_DIR=/opt/python CI=true
RUN corepack enable && mkdir -p /repo /opt/python && chown node:node /repo /opt/python
WORKDIR /repo
# Sin root: la construcción y el servidor corren con el usuario sin privilegios de la imagen.
USER node

# Dependencias primero, para que la capa quede en caché mientras no cambien los manifiestos.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node apps/mobile/package.json apps/mobile/
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --chown=node:node packages/geo/package.json packages/geo/
COPY --chown=node:node packages/sync/package.json packages/sync/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --chown=node:node docs-site/pyproject.toml docs-site/uv.lock docs-site/
RUN uv sync --frozen --project docs-site --group docs

COPY --chown=node:node . .
EXPOSE 8000
# Construye con --strict y sirve el sitio estático: los enlaces quedan relativos y no dependen del host.
CMD ["sh", "-c", "node docs-site/build.mjs && cd docs-site/site && exec uv run --project /repo/docs-site --group docs --frozen python -m http.server 8000"]
