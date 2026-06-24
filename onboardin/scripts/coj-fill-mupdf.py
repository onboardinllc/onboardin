#!/usr/bin/env python3
"""
Fill COJ PDFs by AcroForm field name (like Acrobat) — visible in all viewers.
Usage:
  python scripts/coj-fill-mupdf.py <input.pdf> <output.pdf> [--json '{"NAME 1":"Acme Ltd",...}']
  python scripts/coj-fill-mupdf.py <input.pdf> <output.pdf> --field-values-json path.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

# Logical key → PDF field name (Form 6)
FORM6_MAP = {
    "proposed_company_name": "NAME 1",
    "applicant_name": "REQUESTED BY",
    "applicant_address": "STREET 1",
    "reservation_date": ("DAY", "MONTH", "YEAR"),
}


def split_date(value: str) -> tuple[str, str, str] | None:
    v = (value or "").strip()
    if not v:
        return None
    if len(v) == 10 and v[4] == "-" and v[7] == "-":
        y, m, d = v.split("-")
        return d, m, y[-2:]
    if "/" in v:
        parts = v.split("/")
        if len(parts) == 3:
            d, m, y = parts
            return d.zfill(2), m.zfill(2), y[-2:]
    return None


def logical_to_pdf_names(field_values: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, pdf_name in FORM6_MAP.items():
        if key == "reservation_date":
            parts = split_date(str(field_values.get(key, "")))
            if parts:
                out["DAY"], out["MONTH"], out["YEAR"] = parts
            continue
        if isinstance(pdf_name, str):
            val = str(field_values.get(key, "")).strip()
            if val:
                out[pdf_name] = val
    return out


def fill_pdf(input_path: Path, output_path: Path, pdf_field_values: dict[str, str]) -> int:
    doc = fitz.open(input_path)
    filled = 0
    for page in doc:
        for widget in page.widgets():
            name = widget.field_name
            if name not in pdf_field_values:
                continue
            widget.field_value = pdf_field_values[name]
            widget.update()
            filled += 1
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return filled


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    field_values: dict = {}

    if "--values-file" in sys.argv:
        idx = sys.argv.index("--values-file")
        payload = json.loads(Path(sys.argv[idx + 1]).read_text(encoding="utf-8"))
        if any(k in FORM6_MAP for k in payload):
            field_values = logical_to_pdf_names(payload)
        else:
            field_values = {str(k): str(v) for k, v in payload.items()}
    elif "--json" in sys.argv:
        idx = sys.argv.index("--json")
        raw = sys.argv[idx + 1]
        payload = json.loads(raw)
        if any(k in FORM6_MAP for k in payload):
            field_values = logical_to_pdf_names(payload)
        else:
            field_values = {str(k): str(v) for k, v in payload.items()}
    elif "--field-values-json" in sys.argv:
        idx = sys.argv.index("--field-values-json")
        payload = json.loads(Path(sys.argv[idx + 1]).read_text(encoding="utf-8"))
        field_values = logical_to_pdf_names(payload)
    else:
        print("Provide --json or --field-values-json", file=sys.stderr)
        return 2

    if not field_values:
        print("No field values to fill", file=sys.stderr)
        return 1

    count = fill_pdf(input_path, output_path, field_values)
    result = {"filledCount": count, "output": str(output_path), "fields": field_values}
    print(json.dumps(result))
    return 0 if count > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())