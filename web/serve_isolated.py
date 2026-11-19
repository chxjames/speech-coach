"""带 COOP/COEP 头的静态服务器，用来量 SharedArrayBuffer 到底快多少。

python serve_isolated.py 8793
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HEADERS = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "cross-origin",
}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in HEADERS.items():
            self.send_header(k, v)
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8793
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
