#!/usr/bin/env python3
"""Submit new/changed sitemap URLs; checkpoint only accepted IndexNow batches."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

SITE = "https://tasukikeifu.com"
KEY = "f7f4f95dfab8450d8fa853a347a68960"
ENDPOINT = "https://api.indexnow.org/indexnow"
SITEMAPS = ("static", "players", "competitions", "organizations")
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
BATCH_SIZE = 500


def database_signature():
    # PostgreSQL cumulative counters are cheap to read and survive ordinary
    # polling. Include reset/restart identity so a counter reset forces a scan.
    query = """SELECT json_build_array(datid, stats_reset, pg_postmaster_start_time(),
               writes.inserted, writes.updated, writes.deleted)::text
               FROM pg_stat_database CROSS JOIN (
                 SELECT coalesce(sum(n_tup_ins), 0) AS inserted,
                        coalesce(sum(n_tup_upd), 0) AS updated,
                        coalesce(sum(n_tup_del), 0) AS deleted
                 FROM pg_stat_user_tables
                 WHERE relname NOT IN ('PlayerRelationCache', 'CacheInvalidation',
                       'AuditLog', 'ImportBatch', '_prisma_migrations')
               ) AS writes WHERE datname = current_database()"""
    result = subprocess.run(
        ["/usr/bin/docker", "exec", "tasuki-keifu-postgres", "psql", "-X", "-w",
         "-U", "tasuki_keifu_user", "-d", "tasuki_keifu", "-At",
         "-v", "ON_ERROR_STOP=1", "-c", query],
        check=True, capture_output=True, text=True, timeout=20,
    )
    signature = json.loads(result.stdout)
    if (not isinstance(signature, list) or len(signature) != 6
            or not all(isinstance(value, int) for value in signature[3:])):
        raise ValueError("Invalid database write counters")
    return signature


def fetch(url, payload=None):
    headers = {"User-Agent": "TasukiKeifu-IndexNow/1.0"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json; charset=utf-8"
    with urlopen(Request(url, data=data, headers=headers), timeout=45) as response:
        return response.status, response.read(16 * 1024 * 1024 + 1)


def read_sitemaps(origin):
    current = {}
    for name in SITEMAPS:
        _, body = fetch(f"{origin}/sitemap/{name}.xml")
        if len(body) > 16 * 1024 * 1024:
            raise ValueError(f"Sitemap too large: {name}")
        root = ET.fromstring(body)
        if root.tag != NS + "urlset":
            raise ValueError(f"Invalid sitemap root: {name}")
        entries = root.findall(NS + "url")
        # The app can return an empty sitemap after a database error.
        if not entries:
            raise ValueError(f"Empty sitemap; preserving checkpoint: {name}")
        for entry in entries:
            url = (entry.findtext(NS + "loc") or "").strip()
            modified = (entry.findtext(NS + "lastmod") or "").strip()
            parsed = urlsplit(url)
            if (parsed.scheme != "https" or parsed.netloc != "tasukikeifu.com"
                    or not (parsed.path == "/ja" or parsed.path.startswith("/ja/"))
                    or parsed.query or parsed.fragment or not modified):
                raise ValueError(f"Invalid URL or missing lastmod in {name}: {url}")
            current[url] = modified
    return current


def load_state(path):
    if not path.exists():
        return {}
    state = json.loads(path.read_text())
    if state.get("version") != 1 or not isinstance(state.get("urls"), dict):
        raise ValueError("Invalid checkpoint; refusing to resubmit everything")
    urls = state["urls"]
    if not all(isinstance(k, str) and isinstance(v, str) for k, v in urls.items()):
        raise ValueError("Invalid checkpoint entries")
    return urls


def save_json(path, value):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as handle:
        json.dump(value, handle, ensure_ascii=False, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def save_state(path, urls):
    save_json(path, {"version": 1, "urls": urls})


def submit_changes(current, acknowledged, path, dry_run=False):
    pending = sorted(url for url, modified in current.items() if acknowledged.get(url) != modified)
    print(f"sitemap_urls={len(current)} pending_urls={len(pending)} dry_run={dry_run}", flush=True)
    if dry_run:
        return
    for offset in range(0, len(pending), BATCH_SIZE):
        batch = pending[offset:offset + BATCH_SIZE]
        status, _ = fetch(ENDPOINT, {
            "host": "tasukikeifu.com", "key": KEY,
            "keyLocation": f"{SITE}/{KEY}.txt", "urlList": batch,
        })
        if status not in (200, 202):
            raise ValueError(f"Unexpected IndexNow status: {status}")
        acknowledged.update({url: current[url] for url in batch})
        save_state(path, acknowledged)
        print(f"indexnow_status={status} accepted_urls={len(batch)}", flush=True)
    # Forget absent entries only after the entire scan/submission succeeds, so a
    # URL that later reappears gets submitted again. Absence alone is not a deletion signal.
    if acknowledged != current:
        save_state(path, current)
    print(f"complete accepted_urls={len(pending)}", flush=True)


def poll_once(origin, state_dir, dry_run=False, force=False):
    path = state_dir / "state.json"
    acknowledged = load_state(path)
    signature_path = state_dir / "db-signature.json"
    signature = database_signature()
    if not force and path.exists() and signature_path.exists():
        previous = json.loads(signature_path.read_text())
        if previous == signature:
            print("database_writes=unchanged; skipped sitemaps and IndexNow", flush=True)
            return
    print("database_writes=changed_or_unchecked; checking sitemaps", flush=True)
    current = read_sitemaps(origin)
    submit_changes(current, acknowledged, path, dry_run)
    # Advance the database cursor only after ALL batches succeed. Sampling before
    # the sitemap read ensures concurrent writes are seen again on the next poll.
    if not dry_run:
        save_json(signature_path, signature)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:3020")
    parser.add_argument("--state-dir", type=Path, default=Path("/var/lib/tasuki-keifu-indexnow"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Scan even if database counters are unchanged")
    args = parser.parse_args()
    args.state_dir.mkdir(parents=True, exist_ok=True)
    with (args.state_dir / "poll.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another poll is running; skipped", flush=True)
            return
        poll_once(args.origin.rstrip("/"), args.state_dir, args.dry_run, args.force)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, ET.ParseError, HTTPError, subprocess.SubprocessError) as error:
        print(f"IndexNow poll failed: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
