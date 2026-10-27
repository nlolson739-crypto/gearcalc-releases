"""GearCalc desktop launcher: shows the built web app (web/) in its own window via Edge WebView2."""
import os
import socket
import sys

import webview

APP_NAME = 'GearCalc'
# Saved setups live in the page's local storage, which is tied to the address, so the port must stay the same.
PORT = 47317


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


def main() -> None:
    data_dir = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), APP_NAME)
    os.makedirs(data_dir, exist_ok=True)
    if not port_free(PORT):
        # Another GearCalc is already open: a second copy would get a different port and lose saved setups.
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, 'GearCalc is already open.', APP_NAME, 0x40)
        return
    webview.create_window(
        f'{APP_NAME} v{version()}',
        resource(os.path.join('web', 'index.html')),
        width=1560,
        height=960,
        min_size=(1024, 680),
        background_color='#111317',
    )
    webview.start(
        http_server=True,
        http_port=PORT,
        private_mode=False,
        storage_path=os.path.join(data_dir, 'webview'),
        icon=resource('gearcalc.ico'),
    )


if __name__ == '__main__':
    main()
