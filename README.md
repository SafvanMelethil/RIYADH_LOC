# UPC Material Scanner (Scanner Device Input)

## What it does
- Works with barcode/QR scanning devices that behave like a keyboard.
- Always-active scan input.
- Supports GS1 long strings like: 010...17... (extracts GTIN-14 automatically).
- If code not found: search material name and pick from dropdown (instant show).

## Run
Recommended:
- VS Code -> Live Server -> open index.html

OR:
- python -m http.server 8000
- open http://localhost:8000

Note: No JSON export UI is provided.
