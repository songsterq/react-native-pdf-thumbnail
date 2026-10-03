#!/usr/bin/env python3
"""Generate byte-stable test PDFs with stdlib and qpdf (tested with 12.4.2).

Run from any directory: python3 scripts/generate-fixtures.py
Override qpdf's location with QPDF=/path/to/qpdf. Encryption uses insecure,
fixed IDs/IVs for reproducible TEST DATA ONLY; never encrypt real files this way.
"""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "fixtures"


def pdf(pages, content_first=False):
    """pages: (width, height, rotation, crop-or-None, label) tuples."""
    objects = []

    def add(data):
        objects.append(data.encode("ascii") if isinstance(data, str) else data)
        return len(objects)

    # A deliberately unfinished first stream after truncation cannot be repaired
    # into a usable page by tolerant PDF readers.
    if content_first:
        padding = b"%" + b"padding " * 1024 + b"\n"
        add(b"<< /Length " + str(len(padding)).encode() + b" >>\nstream\n" + padding + b"endstream")
    catalog = add("")
    tree = add("")
    font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    kids = []
    for width, height, rotation, crop, label in pages:
        # Author in displayed coordinates, counter-rotating the content so labels
        # and the arrow appear upright only when the viewer applies /Rotate.
        # Offset crop pages also contain a magenta mark OUTSIDE the visible box.
        cx, cy, cw, ch = crop or (0, 0, width, height)
        if rotation == 90:
            transform = f"0 1 -1 0 {cx + cw} {cy} cm"
            dw, dh = ch, cw
        elif rotation == 270:
            transform = f"0 -1 1 0 {cx} {cy + ch} cm"
            dw, dh = ch, cw
        else:
            transform = f"1 0 0 1 {cx} {cy} cm"
            dw, dh = cw, ch
        outside = "1 0 1 rg 5 5 40 40 re f\n" if crop else ""
        drawing = (
            outside + f"q {transform}\n"
            f"1 0 0 rg 10 10 45 25 re f\n"
            f"0 0 1 rg {dw - 35} {dh - 65} 25 55 re f\n"
            f"0 0.6 0 rg {dw / 2 - 5} {dh / 2 - 50} 10 80 re f\n"
            f"{dw / 2 - 20} {dh / 2 + 20} m "
            f"{dw / 2} {dh / 2 + 50} l "
            f"{dw / 2 + 20} {dh / 2 + 20} l h f\n"
            f"0 0 0 rg BT /F1 18 Tf 20 {dh - 35} Td ({label}) Tj ET\nQ\n"
        ).encode("ascii")
        stream = add(b"<< /Length " + str(len(drawing)).encode() + b" >>\nstream\n" + drawing + b"endstream")
        crop_entry = ""
        if crop:
            crop_entry = f" /CropBox [{cx} {cy} {cx + cw} {cy + ch}]"
        page = add(
            f"<< /Type /Page /Parent {tree} 0 R /MediaBox [0 0 {width} {height}]"
            f"{crop_entry} /Rotate {rotation} /Resources << /Font << /F1 {font} 0 R >> >>"
            f" /Contents {stream} 0 R >>"
        )
        kids.append(f"{page} 0 R")
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {tree} 0 R >>".encode()
    objects[tree - 1] = f"<< /Type /Pages /Count {len(kids)} /Kids [{' '.join(kids)}] >>".encode()
    # Binary comment also ensures git emits binary diffs for these fixtures.
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\x00\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        f"trailer\n<< /Size {len(offsets)} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(output)


def main():
    qpdf = os.environ.get("QPDF") or shutil.which("qpdf") or "/opt/homebrew/bin/qpdf"
    DEST.mkdir(exist_ok=True)
    normal = [(612, 792, 0, None, f"Normal page {i + 1}") for i in range(3)]
    fixtures = {
        "normal.pdf": normal,
        "cropbox.pdf": [(612, 792, 0, (100, 150, 300, 400), "Crop region")],
        "rotated-90.pdf": [(612, 792, 90, None, "Rotate 90")],
        "rotated-270.pdf": [(612, 792, 270, None, "Rotate 270")],
        "landscape.pdf": [(792, 612, 0, None, "Landscape")],
        "mixed-sizes.pdf": [
            (612, 792, 0, None, "Portrait"),
            (792, 612, 0, None, "Landscape"),
            (612, 792, 90, None, "Rotate 90"),
            (612, 792, 270, (100, 150, 300, 400), "Cropped rotate 270"),
            (200, 300, 0, None, "Small"),
        ],
        "many-pages.pdf": [(612, 792, 0, None, f"Page {i + 1}") for i in range(300)],
        "huge-page.pdf": [(14400, 14400, 0, None, "Huge page")],
    }
    for name, pages in fixtures.items():
        (DEST / name).write_bytes(pdf(pages))
    (DEST / "not-a-pdf.pdf").write_bytes(b"This is text, not a PDF.\n")
    complete = pdf(normal[:1], content_first=True)
    (DEST / "truncated.pdf").write_bytes(complete[:len(complete) // 2])
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "source.pdf"
        source.write_bytes(pdf(normal[:1]))
        for name, password in [("password-user.pdf", "user"), ("password-owner-only.pdf", "")]:
            subprocess.run([
                qpdf, "--static-id", "--static-aes-iv", "--encrypt", password,
                "owner", "128", "--use-aes=y", "--", str(source), str(DEST / name),
            ], check=True)


if __name__ == "__main__":
    main()
