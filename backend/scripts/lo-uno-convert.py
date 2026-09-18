# -*- coding: utf-8 -*-
"""Connect to a headless LibreOffice listener and convert docx -> pdf via UNO."""
from __future__ import annotations

import sys
import time


def to_file_url(path: str) -> str:
    p = path.replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        return "file:///" + p
    if not p.startswith("/"):
        p = "/" + p
    return "file://" + p


def connect(host: str, port: int, retries: int = 20):
    import uno
    from com.sun.star.connection import NoConnectException

    local_ctx = uno.getComponentContext()
    resolver = local_ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_ctx
    )
    url = f"uno:socket,host={host},port={port};urp;StarOffice.ComponentContext"
    last = None
    for _ in range(retries):
        try:
            return resolver.resolve(url)
        except NoConnectException as e:
            last = e
            time.sleep(0.25)
        except Exception as e:
            last = e
            time.sleep(0.25)
    raise RuntimeError(f"Cannot connect to LibreOffice listener: {last}")


def convert(input_path: str, output_path: str, host: str, port: int) -> None:
    import uno
    from com.sun.star.beans import PropertyValue

    ctx = connect(host, port)
    desktop = ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", ctx
    )

    in_props = (PropertyValue(Name="Hidden", Value=True),)
    doc = desktop.loadComponentFromURL(to_file_url(input_path), "_blank", 0, in_props)
    if doc is None:
        raise RuntimeError("Failed to load document")

    try:
        out_props = (
            PropertyValue(Name="FilterName", Value="writer_pdf_Export"),
            PropertyValue(Name="Overwrite", Value=True),
        )
        doc.storeToURL(to_file_url(output_path), out_props)
    finally:
        try:
            doc.close(True)
        except Exception:
            pass


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: lo-uno-convert.py <input.docx> <output.pdf> [host] [port]", file=sys.stderr)
        return 2
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    host = sys.argv[3] if len(sys.argv) > 3 else "127.0.0.1"
    port = int(sys.argv[4]) if len(sys.argv) > 4 else 2002
    convert(input_path, output_path, host, port)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(1)
