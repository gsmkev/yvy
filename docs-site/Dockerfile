# Imagen para generar y servir la documentación sin instalar Node, pnpm ni uv en la máquina.
FROM node:22.23.5-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_PYTHON_INSTALL_DIR=/opt/python CI=true
RUN corepack enable
WORKDIR /repo

# Dependencias primero, para que la capa quede en caché mientras no cambien los manifiestos.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/geo/package.json packages/geo/
COPY packages/sync/package.json packages/sync/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY docs-site/pyproject.toml docs-site/uv.lock docs-site/
RUN uv sync --frozen --project docs-site --group docs

COPY . .
EXPOSE 8000
# Construye con --strict y sirve el sitio estático: los enlaces quedan relativos y no dependen del host.
CMD ["sh", "-c", "node docs-site/build.mjs && cd docs-site/site && exec uv run --project /repo/docs-site --group docs --frozen python -m http.server 8000"]
