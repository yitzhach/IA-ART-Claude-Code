#!/usr/bin/env python3
"""One-time migration: build the V2 catalogue (src/content/works/<slug>/) from the v1 site.

Reads the v1 images from the `main` branch checkout passed as argv[1] and writes one folder per
artwork with an index.md (front matter) and its best-resolution image(s).

Duplicates in v1 (the same artwork filed under several numbers/collections) are merged into one
work that belongs to several collections. Kept in the repo for traceability; not part of the build.
"""
import os
import shutil
import sys

from PIL import Image

V1 = sys.argv[1]
OUT = sys.argv[2]

# Facts read from v1/available.html (caption + SOLD badge). Captions are width × height.
AVAILABLE = {
    1: ("Green Horizon", 34, 48, "available"),
    2: (None, 34, 48, "sold"),          # v1 caption duplicated No. 001's title — needs confirming
    3: (None, None, None, "available"),  # v1 caption was a placeholder
    4: ("New Horizon", 48, 48, "sold"),
    5: ("Lifted Up", 48, 72, "available"),
    6: ("Dawn", 32, 48, "sold"),
    7: ("Warm Horizon", 44, 68, "sold"),
    8: ("Hope", 32, 48, "sold"),
    9: ("Rising Above", 24, 36, "sold"),
    10: (None, 18, 27, "available"),   # v1 title was just "Abstract"
    11: ("Embedded Brass Bar", 16, 28, "sold"),
    12: ("Embedded Steel Base", 18, 27, "sold"),
}

# Same artwork under several v1 ids (verified visually). The first id is the one kept.
MERGES = [
    ["abstract-1", "available-10", "sculptural-10"],
    ["abstract-4", "available-12", "sculptural-12"],
    ["abstract-8", "figurative-5"],
    ["available-11", "sculptural-11"],
    ["available-2", "sculptural-7"],
    ["available-9", "sculptural-3"],
]

# Works from the v1 "More reference images" strip, collection assigned by eye (flagged for review).
REFS = {1: "abstract", 2: "abstract", 3: "figurative", 4: "abstract", 5: "sculptural", 6: "figurative"}
# Available works had no collection in v1; assigned by eye (flagged for review).
AVAILABLE_COLLECTION = {1: "abstract", 3: "sculptural", 4: "abstract", 5: "abstract", 6: "abstract",
                        7: "abstract", 8: "abstract"}


def best(name):
    """Highest-resolution v1 file for an image id."""
    for suffix in ("-full", "-hi", ""):
        p = os.path.join(V1, "images", f"{name}{suffix}.webp")
        if os.path.exists(p):
            return p
    return None


def slugify(s):
    return "".join(c if c.isalnum() else "-" for c in s.lower()).strip("-").replace("--", "-")


works = {}  # v1 id -> dict


def add(v1id, collection, order, title=None, w=None, h=None, status="inquire"):
    works[v1id] = dict(v1=[v1id], collections=[collection] if collection else [], order=order,
                       title=title, width=w, height=h, status=status)


for c_i, c in enumerate(["abstract", "figurative", "sculptural"]):
    for n in range(1, 13):
        add(f"{c}-{n}", c, (c_i + 1) * 100 + n)
for n, (title, w, h, status) in AVAILABLE.items():
    add(f"available-{n}", AVAILABLE_COLLECTION.get(n), 400 + n, title, w, h, status)
for n, c in REFS.items():
    add(f"ref-{n}", c, 500 + n)

for keep, *rest in MERGES:
    k = works[keep]
    for r in rest:
        o = works.pop(r)
        k["v1"].append(r)
        for c in o["collections"]:
            if c not in k["collections"]:
                k["collections"].append(c)
        for f in ("title", "width", "height"):
            k[f] = k[f] or o[f]
        if o["status"] != "inquire":
            k["status"] = o["status"]

# Name every work; untitled ones get a stable descriptive slug the owner can rename later.
used = set()
counter = {}
for v1id, wk in sorted(works.items(), key=lambda kv: kv[1]["order"]):
    if wk["title"]:
        slug = slugify(wk["title"])
    else:
        c = wk["collections"][0] if wk["collections"] else "work"
        counter[c] = counter.get(c, 0) + 1
        slug = f"untitled-{c}-{counter[c]:02d}"
    while slug in used:
        slug += "-2"
    used.add(slug)
    wk["slug"] = slug

os.makedirs(OUT, exist_ok=True)
report = []
for v1id, wk in sorted(works.items(), key=lambda kv: kv[1]["order"]):
    d = os.path.join(OUT, wk["slug"])
    os.makedirs(d, exist_ok=True)
    srcs = [best(v1id)]
    if v1id == "ref-6":
        srcs = [best("ref-6"), best("ref-7")]
    imgs = []
    for i, s in enumerate(x for x in srcs if x):
        fn = "main.webp" if i == 0 else f"view-{i + 1}.webp"
        shutil.copyfile(s, os.path.join(d, fn))
        imgs.append(fn)
    iw, ih = Image.open(os.path.join(d, imgs[0])).size
    fm = ["---"]
    if wk["title"]:
        fm.append(f"title: {wk['title']}")
    fm.append(f"collections: [{', '.join(wk['collections'])}]")
    fm.append(f"status: {wk['status']}")
    if wk["width"]:
        fm.append(f"width: {wk['width']}")
        fm.append(f"height: {wk['height']}")
    fm.append("images:")
    fm += [f"  - ./{f}" for f in imgs]
    fm.append(f"order: {wk['order']}")
    fm.append(f"v1: [{', '.join(wk['v1'])}]")
    fm.append("---")
    with open(os.path.join(d, "index.md"), "w") as f:
        f.write("\n".join(fm) + "\n")
    # flag size vs photo orientation mismatches
    note = ""
    if wk["width"] and wk["height"] and wk["width"] != wk["height"]:
        if (wk["width"] > wk["height"]) != (iw > ih):
            note = f"photo is {iw}×{ih} but size says {wk['width']}w × {wk['height']}h"
    report.append((wk["slug"], wk["v1"], note))

for r in report:
    print(*r)
print(len(report), "works")
