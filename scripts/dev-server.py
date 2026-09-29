#!/usr/bin/env python3
# Dev server for the proto pages — strips query strings (?v= cache-bust tags)
# before path resolution. Plain http.server 404s them (caught 2026-08-20:
# every versioned asset silently failed after a bare-server restart).
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        self.path = self.path.split('?', 1)[0]
        return super().send_head()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', 3005), functools.partial(H, directory='.')).serve_forever()
