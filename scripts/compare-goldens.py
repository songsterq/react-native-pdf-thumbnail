#!/usr/bin/env python3
"""Compare exported self-test JPEGs, or adopt reviewed device outputs as goldens.

Dependency: python3 -m pip install pillow
Usage: python3 scripts/compare-goldens.py android /tmp/selftest
The case selection lives only in fixtures/golden-cases.json. --update is used by
update-goldens.sh; review every changed image before committing the new goldens.
"""

import argparse
import json
from pathlib import Path
import shutil
import sys

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
MEAN_LIMIT = 2.0
MAX_LIMIT = 64


def selected_images():
    cases = json.loads((ROOT / "fixtures/expectations.json").read_text())
    selected = json.loads((ROOT / "fixtures/golden-cases.json").read_text())
    by_name = {case["name"]: case for case in cases}
    if not selected or len(set(selected)) != len(selected):
        raise ValueError("golden-cases.json must contain unique case names")
    images = []
    for name in selected:
        case = by_name[name]
        for index, size in enumerate(case["expected"]["sizes"]):
            filename = f"{name}-{index}.jpg" if case.get("all") else f"{name}.jpg"
            images.append((name, filename, tuple(size)))
    return cases, images


def load_rgb(filename, expected_size):
    with Image.open(filename) as image:
        if image.format != "JPEG":
            raise ValueError(f"expected JPEG, got {image.format}")
        if image.size != expected_size:
            raise ValueError(f"size {image.size}, expected {expected_size}")
        return image.convert("RGB")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("actual", type=Path, help="pulled selftest directory")
    parser.add_argument("--golden-root", type=Path, default=ROOT / "fixtures/golden")
    parser.add_argument("--update", action="store_true", help="adopt outputs as goldens")
    args = parser.parse_args()
    try:
        cases, images = selected_images()
        results = json.loads((args.actual / "selftest-results.json").read_text())
        if set(results) != {case["name"] for case in cases}:
            raise ValueError("results do not contain exactly the expectation cases")
        failed = [name for name, row in results.items() if row.get("pass") is not True]
        if failed:
            raise ValueError(f"self-test failed: {', '.join(failed)}")
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"FAIL: invalid self-test export: {error}", file=sys.stderr)
        return 1

    golden_directory = args.golden_root / args.platform
    failures = 0
    validated = []
    for name, filename, size in images:
        try:
            row = results[name]
            case = next(case for case in cases if case["name"] == name)
            sizes = case["expected"]["sizes"]
            expected_width = [s[0] for s in sizes] if case.get("all") else sizes[0][0]
            expected_height = [s[1] for s in sizes] if case.get("all") else sizes[0][1]
            if row.get("width") != expected_width or row.get("height") != expected_height:
                raise ValueError("exported result dimensions disagree with expectations")
            actual = load_rgb(args.actual / filename, size)
            if args.update:
                validated.append(filename)
                print(f"READY {filename}: {size[0]}x{size[1]}")
                continue
            golden = load_rgb(golden_directory / filename, size)
            difference = ImageChops.difference(actual, golden)
            means = ImageStat.Stat(difference).mean
            maxima = [extrema[1] for extrema in difference.getextrema()]
            passed = all(mean <= MEAN_LIMIT for mean in means) and all(value <= MAX_LIMIT for value in maxima)
            print(f"{'PASS' if passed else 'FAIL'} {filename}: "
                  f"mean RGB={[round(mean, 4) for mean in means]} (<= {MEAN_LIMIT}), "
                  f"max RGB={maxima} (<= {MAX_LIMIT})")
            failures += not passed
        except (OSError, ValueError, KeyError, TypeError) as error:
            print(f"FAIL {filename}: {error}")
            failures += 1
    if args.update and not failures:
        # Validate the entire selection before replacing any reference image.
        golden_directory.mkdir(parents=True, exist_ok=True)
        for filename in validated:
            shutil.copyfile(args.actual / filename, golden_directory / filename)
        print(f"Updated {len(validated)} goldens in {golden_directory}; review before committing.")
    print(f"{len(images) - failures}/{len(images)} images {'validated' if args.update else 'matched'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
