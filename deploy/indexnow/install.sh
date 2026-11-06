#!/usr/bin/env bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
sudo install -d -m 755 /opt/apps/tasuki-keifu/indexnow
sudo install -m 644 "$source_dir/poll.py" /opt/apps/tasuki-keifu/indexnow/poll.py
sudo install -m 644 "$source_dir/tasuki-keifu-indexnow.service" /etc/systemd/system/tasuki-keifu-indexnow.service
sudo install -m 644 "$source_dir/tasuki-keifu-indexnow.timer" /etc/systemd/system/tasuki-keifu-indexnow.timer
sudo systemctl daemon-reload
sudo systemctl enable --now tasuki-keifu-indexnow.timer
