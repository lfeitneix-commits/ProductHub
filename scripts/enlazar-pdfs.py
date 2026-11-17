"""Agrega links clickeables a los one pagers en PDF: mails (mailto), webs (https), celulares (WhatsApp) y el fijo (llamada).
Uso:  python3 scripts/enlazar-pdfs.py public/onepagers/*.pdf
Requiere PyMuPDF (pip install pymupdf). Reescribe cada archivo solo si le faltaban links.
Los one pagers que se suben desde Gestión se enlazan en el navegador antes de subirlos (enlazarPDF en public/index.html)."""
import re, sys
import pymupdf

PATRONES = [
    ("mail", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("web", re.compile(r"(?:https?://|www\.)[^\s,;)]+")),
    ("cel", re.compile(r"\+54\s?9\s?\d{2,4}\s?\d{3,4}[\s-]?\d{4}")),
    ("fijo", re.compile(r"\(0?\d{2,4}\)\s?\d{3,4}[\s-]?\d{4}")),
]

def destino(tipo, t):
    if tipo == "mail": return "mailto:" + t
    if tipo == "web": return t if t.startswith("http") else "https://" + t.rstrip(".")
    d = re.sub(r"\D", "", t)
    if tipo == "cel": return "https://wa.me/" + d
    if d.startswith("0"): d = d[1:]
    return "tel:+54" + d

def enlazar(ruta):
    doc = pymupdf.open(ruta)
    hechos = 0
    for page in doc:
        ya = {(round(l["from"].x0), round(l["from"].y0)) for l in page.get_links()}
        texto = page.get_text()
        vistos = set()
        for tipo, pat in PATRONES:
            for m in pat.finditer(texto):
                t = m.group(0).strip().rstrip(".")
                if t in vistos: continue
                vistos.add(t)
                for r in page.search_for(t):
                    if (round(r.x0), round(r.y0)) in ya: continue
                    page.insert_link({"kind": pymupdf.LINK_URI, "from": r, "uri": destino(tipo, t)})
                    hechos += 1
    if hechos:
        doc.save(ruta + ".tmp", garbage=3, deflate=True)
        doc.close()
        import os; os.replace(ruta + ".tmp", ruta)
    else:
        doc.close()
    return hechos

if __name__ == "__main__":
    for f in sys.argv[1:]:
        print(f, enlazar(f), "links")
