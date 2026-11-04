#!/usr/bin/env python3
"""Descarga fotos reales de cada vehículo/moto (Wikipedia/Wikimedia) y regenera las miniaturas del PDF.

Uso (en tu PC, con internet; requiere Python 3.8+ y Pillow):
    pip install pillow
    python descargar_imagenes.py            # descarga todas
    python descargar_imagenes.py --missing  # solo las que aún no se descargaron

Guarda cada foto en la ruta "imagen" del JSON (assets/img_XXXX.png) y reescribe js/pdf_thumbnails.js.
Las que no se encuentren conservan su imagen de relleno; se listan al final para que las cambies a mano.
"""
import urllib.error, argparse, base64, io, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
API = "https://en.wikipedia.org/w/api.php"
UA = "LuxuryMotorsStudentProject/1.0 (proyecto academico)"
DONE = os.path.join(ROOT, "assets", ".descargadas.json")

def get(url, binary=False, tries=7):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
                d = r.read(); return d if binary else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < tries - 1:  # límite de peticiones: esperar y reintentar
                espera = int(e.headers.get("Retry-After") or 0) or 20 * (i + 1)
                print(f"    límite de Wikimedia (HTTP {e.code}); esperando {espera}s...", flush=True); time.sleep(espera); continue
            if i == tries - 1: raise
            time.sleep(2 * (i + 1))
        except Exception:
            if i == tries - 1: raise
            time.sleep(2 * (i + 1))

def find_photo_url(query):
    p = {"action": "query", "format": "json", "generator": "search", "gsrsearch": query, "gsrlimit": 3,
         "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 960}
    pages = (get(API + "?" + urllib.parse.urlencode(p)).get("query") or {}).get("pages", {})
    for pg in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        t = (pg.get("thumbnail") or {}).get("source")
        if t and not t.lower().endswith(".svg") and "logo" not in t.lower():
            return t
    return None

def make_query(it):
    modelo = it["modelo"].replace("Bugatti Bugatti", "Bugatti")
    if it["marca"].lower() not in modelo.lower():
        modelo = f'{it["marca"]} {modelo}'
    return modelo + (" motorcycle" if it.get("coleccion") == "motos" else "")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--missing", action="store_true"); a = ap.parse_args()
    from PIL import Image
    data = json.load(open(os.path.join(ROOT, "vehiculo.json"), encoding="utf-8"))
    done = set(json.load(open(DONE))) if os.path.exists(DONE) else set()
    items = [dict(i, coleccion=c) for c in ("vehiculos", "motos") for i in data[c]]
    failed = []
    for n, it in enumerate(items, 1):
        out = os.path.join(ROOT, it["imagen"])
        if a.missing and it["codigo"] in done: continue
        q = make_query(it)
        try:
            url = find_photo_url(q)
            if not url: raise RuntimeError("sin resultados")
            im = Image.open(io.BytesIO(get(url, binary=True))).convert("RGB")
            im.thumbnail((900, 900)); im.save(out, "PNG", optimize=True)
            done.add(it["codigo"]); print(f"[{n}/{len(items)}] OK   {q}")
        except Exception as e:
            failed.append((it["codigo"], q)); print(f"[{n}/{len(items)}] FALLÓ {q}: {e}")
        json.dump(sorted(done), open(DONE, 'w')); time.sleep(1.2)
    json.dump(sorted(done), open(DONE, "w"))
    # Miniaturas Base64 para los PDF (claves = rutas del JSON)
    thumbs = {}
    for it in items:
        p = os.path.join(ROOT, it["imagen"])
        if os.path.exists(p):
            im = Image.open(p).convert("RGB"); im.thumbnail((220, 150))
            b = io.BytesIO(); im.save(b, "JPEG", quality=82)
            thumbs[it["imagen"]] = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    logo = os.path.join(ROOT, "assets", "logo_pagina.png")
    if os.path.exists(logo):
        im = Image.open(logo).convert("RGBA"); bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3])
        bg.thumbnail((260, 75)); b = io.BytesIO(); bg.save(b, "PNG")
        thumbs["assets/logo_pagina.png"] = "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()
    with open(os.path.join(ROOT, "js", "pdf_thumbnails.js"), "w") as f:
        f.write("window.PDF_THUMBNAILS = " + json.dumps(thumbs) + ";\n")
    print(f"\nListo: {len(done)} fotos reales, {len(thumbs)} miniaturas.")
    if failed:
        print("Sin foto (cámbialas a mano en assets/):"); [print(f"  img_{c}.png  <- {q}") for c, q in failed]

if __name__ == "__main__":
    sys.exit(main())
