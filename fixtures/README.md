# Behaviour fixtures

Regenerate from the repository root with `python3 scripts/generate-fixtures.py`.
Only Python's standard library and qpdf are needed; qpdf 12.4.2 was used for the
committed bytes. `QPDF` can override its executable path. The encrypted PDFs use
fixed IDs and AES IVs solely to make test data reproducible. Their user/owner
passwords are `user`/`owner`; the owner-only file has an empty user password.

Dimensions are PDF points before rotation. Normal and many-pages pages are
612×792; landscape is 792×612; huge is 14400×14400. Cropbox has media box
[0, 0, 612, 792] and crop box [100, 150, 400, 550], so it displays at 300×400.
The rotated fixtures have a 612×792 media box and `/Rotate` 90 or 270, displaying
at 792×612.

Mixed-sizes displays, in order: **612×792, 792×612, 792×612, 400×300, 200×300**.
Its fourth page combines an offset crop box with rotation 270.

Each valid page has a red rectangle at the displayed bottom-left, a tall blue
rectangle at the displayed top-right, a green upward arrow, and an upright label.
The rotated pages' content is counter-rotated when authored: labels and arrows
appear upright only when the renderer correctly applies `/Rotate`. Compare them
against Preview. Crop pages also contain a magenta rectangle outside the crop
region, which must not appear in the thumbnail.
Truncated is exactly the first half of a valid PDF with a long initial content
stream; no page objects survive, so readers cannot repair it into a usable PDF.

These files are repository test data and are excluded from the npm package by
the package's explicit `files` allowlist.
