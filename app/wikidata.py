"""Keeps GearCalc's monster, gear and spell data up to date with the OSRS Wiki.

The wiki's own DPS calculator loads three data files from the wiki's file server (tools.runescape.wiki). GearCalc
fetches the same files at most once a day. Each request sends back the version stamp (ETag) of the copy it already
has, so when nothing changed the server answers "304 Not Modified" and nothing is downloaded. These are plain file
downloads, not MediaWiki API calls; the wiki asks only for a descriptive User-Agent and no sustained heavy traffic.

The files are saved in %APPDATA%/GearCalc/wikidata and served to the page as ./wikidata/<name>.json. The page checks
them before use and falls back to the data built into the app.
"""
import gzip
import json
import os
import time
import urllib.error
import urllib.request
from email.utils import parsedate_to_datetime

BASE = 'https://tools.runescape.wiki/osrs-dps/cdn/json/'
FILES = ('monsters', 'equipment', 'spells')
CHECK_EVERY = 20 * 3600  # "once a day", a little under so a daily habit doesn't skip a day
RETRY_AFTER = 3600       # after a failed check (offline, server down)


def _iso(http_date: str | None) -> str | None:
    try:
        return parsedate_to_datetime(http_date).isoformat() if http_date else None
    except (TypeError, ValueError):
        return None


class WikiData:
    def __init__(self, data_dir: str, user_agent: str, log=print):
        self.dir = os.path.join(data_dir, 'wikidata')
        self.ua = user_agent
        self.log = log
        self.info_path = os.path.join(self.dir, 'info.json')

    def info(self) -> dict:
        try:
            with open(self.info_path, encoding='utf-8') as f:
                info = json.load(f)
            if isinstance(info, dict) and isinstance(info.get('files'), dict):
                return info
        except (OSError, ValueError):
            pass
        return {'files': {}}

    def _save_info(self, info: dict) -> None:
        tmp = self.info_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(info, f, indent=1)
        os.replace(tmp, self.info_path)

    def _get(self, name: str, have: dict | None):
        """(status, body, headers). body is None for 304."""
        headers = {'User-Agent': self.ua, 'Accept-Encoding': 'gzip'}
        path = os.path.join(self.dir, f'{name}.json')
        if have and os.path.isfile(path):
            if have.get('etag'):
                headers['If-None-Match'] = have['etag']
            if have.get('lastModified'):
                headers['If-Modified-Since'] = have['lastModified']
        req = urllib.request.Request(BASE + f'{name}.json', headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                return r.status, body, r.headers
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return 304, None, e.headers
            raise

    def refresh(self, force: bool = False) -> dict:
        """Checks the wiki for newer files (at most once a day unless forced). Returns
        {'checked': iso, 'changed': [names], 'error': str|None}."""
        os.makedirs(self.dir, exist_ok=True)
        info = self.info()
        now = time.time()
        wait = RETRY_AFTER if info.get('lastError') else CHECK_EVERY
        if not force and now - info.get('checkedAt', 0) < wait:
            return {'checked': info.get('checked'), 'changed': [], 'error': None, 'skipped': True}

        changed, fresh = [], {}
        try:
            for name in FILES:
                have = info['files'].get(name)
                status, body, headers = self._get(name, have)
                if status == 304:
                    continue
                data = json.loads(body.decode('utf-8'))
                if not isinstance(data, list) or not data:
                    raise ValueError(f'{name}.json is not a list of entries')
                fresh[name] = (body, {
                    'etag': headers.get('ETag'),
                    'lastModified': headers.get('Last-Modified'),
                    'modified': _iso(headers.get('Last-Modified')),
                    'entries': len(data),
                    'bytes': len(body),
                })
        except Exception as e:  # offline, server error, broken file: keep what we have and try again later
            info.update(checkedAt=now, lastError=f'{type(e).__name__}: {e}'[:300])
            self._save_info(info)
            self.log(f'wiki data check failed: {e}')
            return {'checked': info.get('checked'), 'changed': [], 'error': info['lastError']}

        # Only replace files once every download has succeeded, so a half-finished check never mixes versions.
        for name, (body, meta) in fresh.items():
            path = os.path.join(self.dir, f'{name}.json')
            with open(path + '.tmp', 'wb') as f:
                f.write(body)
            os.replace(path + '.tmp', path)
            info['files'][name] = meta
            changed.append(name)
        info.update(checkedAt=now, checked=time.strftime('%Y-%m-%dT%H:%M:%S%z', time.localtime(now)), lastError=None)
        self._save_info(info)
        self.log(f'wiki data checked: {", ".join(changed) + " updated" if changed else "no changes"}')
        return {'checked': info['checked'], 'changed': changed, 'error': None}
