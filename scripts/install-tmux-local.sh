#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-$HOME/.local}"
LIBEVENT_VERSION="${LIBEVENT_VERSION:-2.1.12-stable}"
TMUX_VERSION="${TMUX_VERSION:-3.5a}"
JOBS="${JOBS:-4}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

need curl
need tar
need make
need gcc

build_libevent() {
  local work
  work="$(mktemp -d)"
  cd "$work"

  curl -L -o libevent.tar.gz \
    "https://github.com/libevent/libevent/releases/download/release-${LIBEVENT_VERSION}/libevent-${LIBEVENT_VERSION}.tar.gz"
  tar -xzf libevent.tar.gz
  cd "libevent-${LIBEVENT_VERSION}"

  ./configure --prefix="$PREFIX" --disable-openssl
  make -j"$JOBS"
  make install
}

build_tmux() {
  local work
  work="$(mktemp -d)"
  cd "$work"

  curl -L -o tmux.tar.gz \
    "https://github.com/tmux/tmux/releases/download/${TMUX_VERSION}/tmux-${TMUX_VERSION}.tar.gz"
  tar -xzf tmux.tar.gz
  cd "tmux-${TMUX_VERSION}"

  CPPFLAGS="-I$PREFIX/include" \
  LDFLAGS="-L$PREFIX/lib" \
  ./configure --prefix="$PREFIX" --disable-utf8proc

  make -j"$JOBS"
  make install
}

build_libevent
build_tmux

if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.zshrc" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
fi

echo "Installed tmux to $PREFIX/bin/tmux"
"$PREFIX/bin/tmux" -V
