#!/usr/bin/env python3
"""Compare every pg_dump COPY row with a restored, isolated local database."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

backup, database = sys.argv[1:]
if not re.fullmatch(r"tasuki_dev_[a-z0-9_]{1,52}", database):
    raise SystemExit("Expected an offline tasuki_dev_ database")
root = Path(os.environ.get("TASUKI_OFFLINE_ROOT", Path.home() / ".local/share/tasuki-keifu/offline-postgres"))
port = os.environ.get("TASUKI_OFFLINE_PORT", "25432")
pg_bin = Path(os.environ.get("PG_BIN", "/usr/local/opt/postgresql@17/bin"))
env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
env["PGOPTIONS"] = "-c timezone=UTC -c datestyle=ISO,MDY -c intervalstyle=postgres -c extra_float_digits=3"
command = [str(pg_bin / "psql"), "-X", "-h", str(root / "socket"), "-p", port,
           "-U", "offline_admin", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"]


def query(sql):
    return subprocess.check_output(command + ["-c", sql], env=env, text=True).strip()


if query("SHOW data_directory") != str(root / "data"):
    raise SystemExit("Unexpected PostgreSQL instance")

# Addition of row hashes preserves duplicates and ignores physical row order.
modulus = 1 << 256
expected = {}
current = None
complete = False
sequences = []
with gzip.open(backup, "rb") as stream:
    for line in stream:
        if current is not None:
            if line == b"\\.\n":
                current = None
            else:
                expected[current]["rows"] += 1
                expected[current]["sum"] = (expected[current]["sum"] + int.from_bytes(hashlib.sha256(line).digest(), "big")) % modulus
            continue
        match = re.fullmatch(rb"COPY (.+) FROM stdin;\n", line)
        if match:
            current = match[1].decode("utf-8")
            expected[current] = {"rows": 0, "sum": 0}
        if line.startswith(b"SELECT pg_catalog.setval("):
            sequences.append(line.decode("utf-8").strip())
        if line == b"-- PostgreSQL database dump complete\n":
            complete = True
if not complete or current is not None or not expected:
    raise SystemExit("Incomplete or unsupported pg_dump input")

results = []
for table, fingerprint in expected.items():
    process = subprocess.Popen(command + ["-c", f"COPY {table} TO STDOUT"], env=env, stdout=subprocess.PIPE)
    rows = total = 0
    for line in process.stdout:
        rows += 1
        total = (total + int.from_bytes(hashlib.sha256(line).digest(), "big")) % modulus
    if process.wait() or rows != fingerprint["rows"] or total != fingerprint["sum"]:
        raise SystemExit(f"Content mismatch: {table.split(' (')[0]}")
    results.append({"table": table.split(" (")[0], "rows": rows, "content_sha256_sum": f"{total:064x}"})

actual_tables = int(query("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"))
if actual_tables != len(expected):
    raise SystemExit("Restored table inventory differs from dump COPY inventory")
unvalidated = int(query("SELECT count(*) FROM pg_constraint WHERE NOT convalidated"))
if unvalidated:
    raise SystemExit(f"Unvalidated constraints: {unvalidated}")
# Current Tasuki dumps use string IDs and have no sequences. Refuse a false pass if that changes.
if sequences or int(query("SELECT count(*) FROM pg_sequences")):
    raise SystemExit("Sequence state requires additional verification")
print(json.dumps({"backup": str(Path(backup).resolve()), "database": database,
                  "server_version": query("SHOW server_version"), "tables": results,
                  "locale": query("SELECT datcollate || ' / ' || datctype FROM pg_database WHERE datname=current_database()"),
                  "table_count": len(results), "total_rows": sum(t["rows"] for t in results),
                  "foreign_keys": int(query("SELECT count(*) FROM pg_constraint WHERE contype='f'")),
                  "unvalidated_constraints": unvalidated, "sequences": 0,
                  "verification": "all COPY rows and table inventories match"}, indent=2))
