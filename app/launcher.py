"""GearCalc desktop launcher: shows the built web app (web/) in its own window via Edge WebView2, and exposes the
updater to the page (window.pywebview.api) so the update prompt is part of GearCalc's own UI."""
import logging
import os
import shutil
import socket
import sys
import threading

import bottle
import webview

import updater

APP_NAME = 'GearCalc'
# Saved setups live in the page's local storage, which is tied to the address, so the port must stay the same.
PORT = 47317
DATA_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), APP_NAME)


def resource(path: str) -> str:
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, path)


def version() -> str:
    try:
        with open(resource('VERSION'), encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return 'dev'


# pywebview's server means to send "no-cache", but bottle.static_file returns its own response, which drops those
# headers. Without them WebView2 may keep showing the previous version's page after an update, so add the header to
# every file it serves (WebView2 still revalidates cheaply with Last-Modified).
_static_file = bottle.static_file


def _static_file_no_cache(*args, **kwargs):
    r = _static_file(*args, **kwargs)
    r.set_header('Cache-Control', 'no-cache')
    return r


bottle.static_file = _static_file_no_cache


def clear_stale_cache(storage: str) -> None:
    """After an update, drop WebView2's cached copy of the old page. The page is served without cache headers, so
    WebView2 can keep showing the previous version's index.html. Saved setups (Local Storage) are kept."""
    marker = os.path.join(DATA_DIR, 'web_version.txt')
    try:
        with open(marker, encoding='utf-8') as f:
            if f.read().strip() == version():
                return
    except OSError:
        pass
    profile = os.path.join(storage, 'EBWebView', 'Default')
    errors = []
    for name in ('Cache', 'Code Cache', 'GPUCache', 'Service Worker'):
        path = os.path.join(profile, name)
        if os.path.isdir(path):
            shutil.rmtree(path, onexc=lambda _f, p, e: errors.append(f'{p}: {e}'))
    if errors:
        logging.info('could not clear all of the web cache: %s', '; '.join(errors[:3]))
    try:
        with open(marker, 'w', encoding='utf-8') as f:
            f.write(version())
    except OSError:
        pass
    logging.info('cleared web cache for v%s', version())


def read_clipboard_text() -> str | None:
    import ctypes
    from ctypes import wintypes
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    kernel32.GlobalLock.restype = wintypes.LPVOID
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    CF_UNICODETEXT = 13
    for _ in range(5):  # another program may have the clipboard open for a moment
        if user32.OpenClipboard(None):
            break
        threading.Event().wait(0.05)
    else:
        return None
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ''
        ptr = kernel32.GlobalLock(handle)
        if not ptr:
            return None
        try:
            return ctypes.wstring_at(ptr)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) != 0


class Api:
    """Called from the page. Each call runs on its own thread, so the slow ones may block."""

    def __init__(self):
        # Private (underscore) attributes only: pywebview walks every public attribute of the js_api object, and
        # walking the Window object sends it into endless recursion (a blank window that never loads).
        self._window = None
        self._info = None
        self._state = {'stage': 'idle', 'done': 0, 'total': 0, 'error': ''}
        self._cancel = False
        self._result = None

    def version(self):
        return version()

    def log_error(self, msg):
        """Errors from the page, so they end up in gearcalc.log."""
        logging.error('page error: %s', str(msg)[:4000])
        return True

    def read_clipboard(self):
        """The clipboard's text, for the bank import's Paste button. The page can't read it itself: WebView2 asks for
        permission first, and pywebview has no handler for that request, so navigator.clipboard.readText fails."""
        return read_clipboard_text()

    def check_update(self):
        """The newer release, or None. Only the built app updates itself."""
        if not updater.frozen():
            return None
        try:
            info = updater.check(version())
        except Exception as e:  # offline, GitHub down, repo missing: just carry on
            logging.info('update check failed: %s', e)
            return None
        self._info = info
        if not info:
            return None
        size = (info['patch'] or info['full'])['size']
        return {'version': info['version'], 'current': version(), 'mb': round(max(size / 1e6, 0.1), 1),
                'patch': bool(info['patch']), 'canWrite': updater.can_write(), 'page': updater.PAGE}

    def start_update(self):
        if not self._info or self._state['stage'] == 'downloading':
            return False
        self._cancel = False
        self._state = {'stage': 'downloading', 'done': 0, 'total': 0, 'error': ''}

        def run():
            def progress(done, total):
                self._state.update(done=done, total=total)
            try:
                self._result = updater.download(self._info, progress, log=logging.info, cancel=lambda: self._cancel)
                self._state['stage'] = 'ready'
            except updater.Cancelled:
                self._state['stage'] = 'idle'
            except Exception as e:
                logging.exception('update download failed')
                self._state.update(stage='failed', error=str(e))
        threading.Thread(target=run, daemon=True).start()
        return True

    def update_progress(self):
        return dict(self._state)

    def cancel_update(self):
        self._cancel = True
        return True

    def install_update(self):
        """Hand over to the helper, which swaps the files once GearCalc closes and starts it again."""
        if self._state['stage'] != 'ready' or not self._result:
            return False
        new_dir, removed, full = self._result
        updater.apply(new_dir, os.path.join(DATA_DIR, 'update.log'), full=full, removed=removed)
        threading.Timer(0.4, self._window.destroy).start()
        return True


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    logging.basicConfig(filename=os.path.join(DATA_DIR, 'gearcalc.log'), level=logging.INFO,
                        format='%(asctime)s %(message)s')
    if not port_free(PORT):
        # Another GearCalc is already open: a second copy would get a different port and lose saved setups.
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, 'GearCalc is already open.', APP_NAME, 0x40)
        return
    if updater.frozen():
        updater.clean()
    storage = os.path.join(DATA_DIR, 'webview')
    clear_stale_cache(storage)
    api = Api()
    api._window = webview.create_window(
        f'{APP_NAME} v{version()}',
        resource(os.path.join('web', 'index.html')),
        js_api=api,
        width=1560,
        height=960,
        min_size=(1024, 680),
        background_color='#111317',
    )
    webview.start(
        http_server=True,
        http_port=PORT,
        private_mode=False,
        storage_path=storage,
        icon=resource('gearcalc.ico'),
    )


if __name__ == '__main__':
    main()
