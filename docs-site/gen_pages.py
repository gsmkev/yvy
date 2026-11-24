"""Genera con mkdocs-gen-files una página por módulo de ``yvy_workers`` y los índices de navegación.

Las páginas de TypeScript ya las escribió TypeDoc en ``docs/ts``; acá solo se arma su índice.
"""

from pathlib import Path

import mkdocs_gen_files

PKG = "yvy_workers"
SRC = Path(__file__).resolve().parent.parent / "workers-py" / PKG
TS_DIR = Path(__file__).resolve().parent / "docs" / "ts"

# Python: una página por módulo (los __init__ y __main__ cuelgan del paquete).
py_nav = mkdocs_gen_files.Nav()
for path in sorted(SRC.rglob("*.py")):
    rel = path.relative_to(SRC.parent).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
        if not parts[1:]:
            parts = [PKG]
        doc = Path("python", *parts, "index.md")
    else:
        doc = Path("python", *parts).with_suffix(".md")
    ident = ".".join(parts)
    py_nav[tuple(parts)] = doc.relative_to("python").as_posix()
    with mkdocs_gen_files.open(doc, "w") as f:
        f.write(f"# `{ident}`\n\n::: {ident}\n")
    mkdocs_gen_files.set_edit_path(doc, path)

with mkdocs_gen_files.open("python/SUMMARY.md", "w") as f:
    f.writelines(py_nav.build_literate_nav())

# TypeScript: un índice por paquete con sus módulos.
ts_nav = mkdocs_gen_files.Nav()


def label(part: str) -> str:
    """Las rutas dinámicas (``[id]``) llevan corchetes, que Markdown toma por un enlace: se muestran como ``:id``."""
    return part.replace("[", ":").replace("]", "")


for pkg_dir in sorted(p for p in TS_DIR.iterdir() if p.is_dir()):
    for page in sorted(pkg_dir.rglob("*.md")):
        rel = page.relative_to(TS_DIR)
        if rel.name == "index.md" and rel.parent == Path(pkg_dir.name):
            ts_nav[(label(pkg_dir.name),)] = f"<{rel.as_posix()}>"
        else:
            ts_nav[(label(pkg_dir.name), *map(label, rel.relative_to(pkg_dir.name).with_suffix("").parts))] = f"<{rel.as_posix()}>"

with mkdocs_gen_files.open("ts/SUMMARY.md", "w") as f:
    f.writelines(ts_nav.build_literate_nav())
