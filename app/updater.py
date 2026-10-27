"""Updates for the shared app (ported from the Nightreign Seed Scanner's updater). On startup it asks GitHub for the
latest release; if you agree, it downloads the update, checks it against the SHA-256 GitHub publishes for it, and a
small helper swaps the app's files once GearCalc has closed, then starts the new one. Your setups live in %APPDATA%
and are never touched.

Each release is tagged vX.YY and carries the whole app as one zip. Small updates come from the "updates" pre-release
(which "latest release" never returns, so nobody downloads them by mistake): "patch-vA-to-vB.zip" holds only the
files that changed from vA to vB, plus "_update_removed.txt" listing files to delete. A copy on vA takes the patch;
any other version, or a patch that fails, takes the whole zip.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from decimal import Decimal, InvalidOperation

REPO = "nlolson739-crypto/gearcalc-releases"
API = f"https://api.github.com/repos/{REPO}/releases/latest"
PATCHES = f"https://api.github.com/repos/{REPO}/releases/tags/updates"
PAGE = f"https://github.com/{REPO}/releases/latest"
EXE = "GearCalc.exe"
REMOVED = "_update_removed.txt"
WORK = os.path.join(tempfile.gettempdir(), "GearCalc_update")
_HEAD = {"User-Agent": "GearCalc-updater", "Accept": "application/vnd.github+json"}


def frozen():
    """Only the built app updates itself (not when run from source)."""
    return bool(getattr(sys, "frozen", False))


def app_dir():
    return os.path.dirname(sys.executable)


def _ver(s):
    """'v1.13' -> Decimal('1.13'). Versions are decimals: 1.2 comes after 1.19."""
    try:
        return Decimal(str(s).strip().lstrip("vV"))
    except InvalidOperation:
        return None


def _get_json(url, timeout):
    with urllib.request.urlopen(urllib.request.Request(url, headers=_HEAD), timeout=timeout) as r:
        return json.load(r)


def _asset(a):
    """{url, sha256, size} for a release asset GitHub has a SHA-256 for, else None."""
    digest = (a or {}).get("digest") or ""
    if not a or not digest.startswith("sha256:"):
        return None                                           # nothing to check the download against
    return {"url": a["browser_download_url"], "sha256": digest.split(":", 1)[1].lower(), "size": int(a.get("size") or 0)}


def patch_name(old, new):
    return f"patch-v{old}-to-v{new}.zip"


class Cancelled(Exception):
    pass


def check(current, timeout=6):
    """The latest release if it's newer than `current`, else None: {"version", "notes", "full", "patch"}, where
    "full" and "patch" (None when there's no patch from `current`) are {url, sha256, size}."""
    rel = _get_json(API, timeout)
    new, cur = _ver(rel.get("tag_name", "")), _ver(current)
    if new is None or cur is None or new <= cur:
        return None
    # The app zip by its exact name; releases also carry a source zip (GPL), which must never be installed.
    assets = rel.get("assets", [])
    want = f"GearCalc-{rel.get('tag_name', '')}.zip"
    full = _asset(next((a for a in assets if a["name"] == want), None)
                  or next((a for a in assets if a["name"].lower().endswith(".zip") and "source" not in a["name"].lower()), None))
    if not full:
        return None
    patch = None
    try:
        name = patch_name(str(current).strip().lstrip("vV"), str(new))
        patch = _asset(next((a for a in _get_json(PATCHES, timeout).get("assets", []) if a["name"] == name), None))
    except Exception:
        pass                                                  # no patches: the whole zip it is
    return {"version": str(new), "notes": (rel.get("body") or "").strip(), "full": full, "patch": patch}


def can_write():
    """Can the app's folder be written to (not e.g. under Program Files without admin)?"""
    try:
        fd, p = tempfile.mkstemp(dir=app_dir(), prefix=".update_test")
        os.close(fd)
        os.remove(p)
        return True
    except OSError:
        return False


def clean():
    """Remove what a previous update left in %TEMP%."""
    shutil.rmtree(WORK, ignore_errors=True)


def _fetch(asset, progress, cancel):
    """Download an asset, check its SHA-256 and unpack it into WORK/new. Returns that folder.
    progress(done_bytes, total_bytes); cancel() returning True stops it (raises Cancelled)."""
    clean()
    os.makedirs(WORK, exist_ok=True)
    zpath = os.path.join(WORK, "update.zip")
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(asset["url"], headers=_HEAD), timeout=30) as r, \
            open(zpath, "wb") as f:
        total = int(r.headers.get("Content-Length") or asset["size"] or 0)
        done = 0
        while True:
            if cancel and cancel():
                raise Cancelled()
            chunk = r.read(1 << 18)
            if not chunk:
                break
            f.write(chunk)
            h.update(chunk)
            done += len(chunk)
            if progress and total:
                progress(done, total)
    if h.hexdigest() != asset["sha256"]:
        raise ValueError("the download didn't match its checksum")
    out = os.path.join(WORK, "new")
    with zipfile.ZipFile(zpath) as z:
        for n in z.namelist():
            parts = n.replace("\\", "/").split("/")
            if n.startswith(("/", "\\")) or ".." in parts or ":" in parts[0]:
                raise ValueError("the update has an unexpected file path")
        z.extractall(out)
    os.remove(zpath)
    return out


def _safe_rel(p):
    parts = p.replace("\\", "/").split("/")
    return p and not p.startswith(("/", "\\")) and ".." not in parts and ":" not in parts[0]


def download(info, progress=None, log=None, cancel=None):
    """Download the update: the patch when there is one, else (or if the patch fails) the whole zip.
    Returns (folder with the new files, files to delete, whole app?)."""
    if info.get("patch"):
        try:
            out = _fetch(info["patch"], progress, cancel)
            tops = [d for d in os.listdir(out) if os.path.isdir(os.path.join(out, d))]
            if len(tops) != 1:
                raise ValueError("the patch has an unexpected layout")
            root = os.path.join(out, tops[0])
            removed = []
            rp = os.path.join(root, REMOVED)
            if os.path.exists(rp):
                with open(rp, encoding="utf-8") as f:
                    removed = [ln.strip() for ln in f if ln.strip()]
                os.remove(rp)
            if not all(_safe_rel(p) for p in removed):
                raise ValueError("the patch lists an unexpected file to remove")
            return root, removed, False
        except Cancelled:
            raise
        except Exception as e:
            if log:
                log(f"patch failed ({e}); downloading the whole app")
    out = _fetch(info["full"], progress, cancel)
    for root, _, files in os.walk(out):
        if EXE in files and os.path.isdir(os.path.join(root, "_internal")):
            return root, [], True
    raise ValueError("the update doesn't contain GearCalc")


def apply(new_dir, log_path, full=True, removed=()):
    """Start the helper: it waits for this app to close, copies the new files over it (the whole app replaces
    `_internal` outright; a patch adds and replaces files and deletes `removed`), and starts it again.
    Call this, then close the app."""
    dst, pid = app_dir(), os.getpid()
    q = lambda p: p.replace("%", "%%")                         # paths inside a .bat
    copy = ("/R:10 /W:1 /NFL /NDL /NJH /NJS /NP", f' >> "{q(log_path)}"')
    lines = [
        "@echo off",
        'set "W=%SystemRoot%\\System32"',                     # Windows' own tools, whatever else is on PATH
        '"%W%\\chcp.com" 65001 >nul',
        ":wait",
        f'"%W%\\tasklist.exe" /FI "PID eq {pid}" /NH 2>nul | "%W%\\find.exe" "{pid}" >nul'
        ' && ("%W%\\ping.exe" -n 2 127.0.0.1 >nul & goto wait)',
        f'echo %date% %time% updating "{q(dst)}" ({"whole app" if full else "patch"}) >> "{q(log_path)}"',
    ]
    if full:
        lines += [
            f'"%W%\\robocopy.exe" "{q(new_dir)}\\_internal" "{q(dst)}\\_internal" /MIR {copy[0]}{copy[1]}',
            "if errorlevel 8 goto failed",
            f'"%W%\\robocopy.exe" "{q(new_dir)}" "{q(dst)}" /XD _internal {copy[0]}{copy[1]}',
            "if errorlevel 8 goto failed",
        ]
    else:
        lines += [f'"%W%\\robocopy.exe" "{q(new_dir)}" "{q(dst)}" /E {copy[0]}{copy[1]}',
                  "if errorlevel 8 goto failed"]
        lines += [f'del /f /q "{q(os.path.join(dst, p.replace("/", os.sep)))}" 2>nul' for p in removed]
    lines += [
        f'echo %date% %time% done >> "{q(log_path)}"',
        f'start "" "{q(dst)}\\{EXE}"',
        "exit /b 0",
        ":failed",
        f'echo %date% %time% FAILED (robocopy error %errorlevel%) >> "{q(log_path)}"',
        f'start "" "{q(dst)}\\{EXE}"',
    ]
    bat = os.path.join(WORK, "apply_update.bat")
    with open(bat, "w", encoding="utf-8", newline="\r\n") as f:
        f.write("\n".join(lines) + "\n")
    # A hidden console for the helper (and the robocopy it runs); it outlives this app.
    cmd = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "cmd.exe")
    subprocess.Popen([cmd, "/c", bat], cwd=WORK, close_fds=True,
                     creationflags=0x08000000 | 0x00000200)   # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
