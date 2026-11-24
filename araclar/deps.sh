#!/bin/bash
# Go kabuğunun bağımlılıkları (sabit commit'ler; go.mod → replace ./deps/...). CI ve yerel derleme için.
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)/kaynak/kabuk/deps"
mkdir -p "$D"
al() { # <depo> <klasör> <commit>
  if [ -d "$D/$2/.git" ] && [ "$(git -C "$D/$2" rev-parse --short=12 HEAD)" = "$3" ]; then return; fi
  rm -rf "$D/$2"
  git clone -q "https://github.com/$1" "$D/$2"
  git -C "$D/$2" checkout -q "$3"
}
al jchv/go-webview2 go-webview2 56598839c808
al jchv/go-winloader go-winloader c1995be93bd1
al golang/sys sys beda7e5e158e
echo "deps hazır: $D"
