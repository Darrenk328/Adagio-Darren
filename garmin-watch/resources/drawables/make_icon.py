#!/usr/bin/env python3
"""One-off helper: writes a plain solid-color 40x40 PNG launcher icon.
No dependencies (pure stdlib: zlib + struct) since PIL/ImageMagick aren't
installed. This is a throwaway placeholder icon for this prototype."""
import struct
import zlib

WIDTH, HEIGHT = 40, 40
RGB = (40, 130, 220)  # a plain blue square


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))


raw = bytearray()
for _ in range(HEIGHT):
    raw.append(0)  # filter type: none
    for _ in range(WIDTH):
        raw.extend(RGB)

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += chunk(b"IEND", b"")

with open("launcher_icon.png", "wb") as f:
    f.write(png)
print("wrote launcher_icon.png")
