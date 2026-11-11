"""Subida a R2 por su API compatible con S3 (bucket público yvy-tiles)."""

from __future__ import annotations

import os
from pathlib import Path


def upload_tiles(local: Path, key: str) -> None:
    import boto3  # importación diferida: los tests no la necesitan

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    s3.upload_file(
        str(local),
        os.environ.get("R2_TILES_BUCKET", "yvy-tiles"),
        key,
        ExtraArgs={"ContentType": "application/vnd.pmtiles", "CacheControl": "public, max-age=31536000, immutable"},
    )


def upload_report(local: Path, key: str) -> None:
    """PDF del parte semanal al bucket privado de fotos y reportes (yvy-media): el Worker lo firma al mandar el email."""
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    s3.upload_file(str(local), os.environ.get("R2_MEDIA_BUCKET", "yvy-media"), key, ExtraArgs={"ContentType": "application/pdf"})
