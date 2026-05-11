#!/usr/bin/env bash
# Genera los PNG del scanner PWA a partir de los SVG fuente.
# Requiere `rsvg-convert` (brew install librsvg) o `magick` (brew install imagemagick).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICONS="$ROOT/public/assets/icons"
SRC_ANY="$ICONS/scanner-icon.svg"
SRC_MASK="$ICONS/scanner-icon-maskable.svg"

if [ ! -f "$SRC_ANY" ] || [ ! -f "$SRC_MASK" ]; then
  echo "ERROR: faltan SVGs fuente en $ICONS"
  exit 1
fi

echo "→ Generando PNGs en $ICONS"

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 192 -h 192 "$SRC_ANY"  -o "$ICONS/scanner-192.png"
  rsvg-convert -w 512 -h 512 "$SRC_ANY"  -o "$ICONS/scanner-512.png"
  rsvg-convert -w 512 -h 512 "$SRC_MASK" -o "$ICONS/scanner-maskable.png"
elif command -v magick >/dev/null 2>&1; then
  magick -background none "$SRC_ANY"  -resize 192x192 "$ICONS/scanner-192.png"
  magick -background none "$SRC_ANY"  -resize 512x512 "$ICONS/scanner-512.png"
  magick -background none "$SRC_MASK" -resize 512x512 "$ICONS/scanner-maskable.png"
else
  echo "ERROR: instalá rsvg-convert (brew install librsvg) o ImageMagick (brew install imagemagick)"
  exit 1
fi

echo "→ Listo. Iconos:"
ls -la "$ICONS"/scanner-*.png
