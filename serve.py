#!/usr/bin/env python3
"""Zero-cache static server for the Governing ESG app.

Usage:  python3 serve.py [port]     (default 8080)
Sends no-store headers so browser refreshes always show the latest files.
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("", PORT), Handler) as httpd:
        print("Governing ESG  ->  http://localhost:%d" % PORT)
        httpd.serve_forever()
