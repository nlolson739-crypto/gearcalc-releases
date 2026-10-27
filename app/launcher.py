"""GearCalc desktop launcher: shows the built web app (web/) in its own window via Edge WebView2, and exposes the
updater to the page (window.pywebview.api) so the update prompt is part of GearCalc's own UI."""
import logging
import os
import socket
import sys
import threading

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


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) != 0


class Api:
    """Called from the page. Each call runs on its own thread, so the slow ones may block."""

    def __init__(self):
        self.window = None
        self._info = None
        self._state = {'stage': 'idle', 'done': 0, 'total': 0, 'error': ''}
        self._cancel = False
        self._result = None

    def version(self):
        return version()

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
        threading.Timer(0.4, self.window.destroy).start()
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
    api = Api()
    api.window = webview.create_window(
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
        storage_path=os.path.join(DATA_DIR, 'webview'),
        icon=resource('gearcalc.ico'),
    )


if __name__ == '__main__':
    main()
