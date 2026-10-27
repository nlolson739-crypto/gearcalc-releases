"""Make the source zip attached to each release (GPL-3.0: the app includes the OSRS Wiki DPS engine, so its full
source goes with every binary). Contains GearCalc's tracked files plus the vendored engine at its pinned commit.

Run: python tools/make_source_zip.py VERSION OUT_DIR
"""
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def tracked(repo):
    out = subprocess.run(['git', '-C', repo, 'ls-files'], capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p]


def main(version, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'GearCalc-v{version}-source.zip')
    top = f'GearCalc-v{version}-source'
    vendor = os.path.join(ROOT, 'vendor', 'osrs-dps-calc')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in tracked(ROOT):
            full = os.path.join(ROOT, p)
            if os.path.isfile(full):
                z.write(full, f'{top}/{p}')
        for p in tracked(vendor):
            full = os.path.join(vendor, p)
            if os.path.isfile(full):
                z.write(full, f'{top}/vendor/osrs-dps-calc/{p}')
    print(f'{os.path.basename(out)}: {os.path.getsize(out) / 1e6:.1f} MB')
    return out


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
