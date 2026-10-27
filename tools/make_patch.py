"""Make an update patch: just the files that changed between two release zips, for the "updates" pre-release.

Run: python tools/make_patch.py OLD.zip NEW.zip OLD_VERSION NEW_VERSION OUT_DIR
Writes OUT_DIR/patch-vOLD-to-vNEW.zip: the new zip's top folder with only the changed and added files, plus
_update_removed.txt (files the new version no longer has). The updater (updater.py) applies it.
"""
import hashlib
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app"))
from updater import REMOVED, patch_name  # noqa: E402


def contents(path):
    """{path inside the app folder: sha256}, and the zip's top folder name."""
    out, top = {}, None
    with zipfile.ZipFile(path) as z:
        for i in z.infolist():
            if i.is_dir():
                continue
            t, rel = i.filename.split("/", 1)
            top = top or t
            out[rel] = hashlib.sha256(z.read(i)).hexdigest()
    return out, top


def main(old_zip, new_zip, old_ver, new_ver, out_dir):
    old, _ = contents(old_zip)
    new, top = contents(new_zip)
    changed = [p for p in new if old.get(p) != new[p]]
    removed = sorted(p for p in old if p not in new)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, patch_name(old_ver, new_ver))
    with zipfile.ZipFile(new_zip) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in changed:
            z.writestr(f"{top}/{p}", src.read(f"{top}/{p}"))
        z.writestr(f"{top}/{REMOVED}", "\n".join(removed) + ("\n" if removed else ""))
    print(f"{os.path.basename(out)}: {len(changed)} changed or new, {len(removed)} removed, "
          f"{os.path.getsize(out) / 1e6:.2f} MB (whole app {os.path.getsize(new_zip) / 1e6:.0f} MB)")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    main(*sys.argv[1:])
