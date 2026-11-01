# 3D Designer for ERPNext (frappe_3d_designer)

Parametric 3D furniture designer inside Frappe Desk. Every design is a **Design Project**;
its parts are turned into an ERPNext **Manufacturing BOM** automatically.

## Compatibility

| | Version |
|---|---|
| Frappe / ERPNext | v16 (`>=16.0.0,<17.0.0`, so 16.50+ included) |
| Python | 3.14+ |
| Node | 24 |
| Python deps | `trimesh` (GLB/GLTF/OBJ reading) |
| JS deps | `three@0.160.0` (bundled by `bench build`) |

## Install

```bash
cd ~/frappe-bench
# Option A: from your git repo
bench get-app https://github.com/<org>/frappe_3d_designer --branch main

# Option B: from this folder
cp -r /path/to/frappe_3d_designer apps/
bench pip install -e apps/frappe_3d_designer
grep -qx frappe_3d_designer sites/apps.txt || echo frappe_3d_designer >> sites/apps.txt
(cd apps/frappe_3d_designer && yarn install)

bench build --app frappe_3d_designer
bench --site <site> install-app frappe_3d_designer
bench --site <site> migrate
bench restart
```

## One-time setup

1. **Raw material items**: board items stocked in `Square Meter` (Area basis), `Cubic Meter`
   (Volume), `Meter` (Length, edge banding) or `Nos`.
2. **Design Material Map**: one record per board/material. Link the raw material item, choose the
   calculation basis, wastage %, colour, edge banding item, and the names used in design files
   (aliases, one per line, e.g. `WHITE_18`).
3. **Designer Settings**: company, finished good item group, fallback material, BOM default/submit
   options, unit of uploaded models (GLB is usually metres), optional operations
   (e.g. Cutting, Edge Banding, Assembly with workstation and minutes).

## How the BOM is built

| Basis | Quantity per part |
|---|---|
| Area | L × W / 1,000,000 × qty (m²) |
| Volume | L × W × T / 1,000,000,000 × qty (m³) |
| Length | longest side / 1000 × qty (m) |
| Nos | qty |

Wastage % is added on top. Banded edges add the material's edge banding item in metres.
Rows with a **Hardware Item** (hinges, handles) are added per piece. The same raw material across
parts becomes one BOM row.

On every save, if parts changed (hash check), a background job:
- creates the finished good item if the design has none (from Designer Settings),
- updates the linked **draft** BOM in place, or creates a **new BOM version** if the old one is
  submitted (old versions stay for existing Work Orders),
- links BOM ↔ Design Project (`BOM.design_project` custom field) and notifies the user live.

Errors (e.g. unmapped material) are shown at the top of the Design Project form.

## Design files

Upload on the Design Project form (`Design File`); parts are read on save.

| Format | Notes |
|---|---|
| GLB / GLTF | GLTF must be embedded (single file). Each mesh = one part. Name meshes `Part name__Material`, otherwise the mesh material name is used. Size comes from the oriented bounding box, orientation from the thinnest axis. |
| OBJ | Same naming rule. |
| CSV / XLSX cut list | Header row is detected in the first 10 rows. English and German headers work: Part/Teil, Material/Werkstoff, Length/Länge, Width/Breite, Thickness/Stärke, Qty/Anzahl, Edge long, Edge short, Item code. |
| JSON | Saved from the 3D Designer (menu, Download design JSON). |

**PYTHA, SketchUp, Blender, Fusion**: their native project files are proprietary. Export a GLB/OBJ
model or a parts list (CSV/XLSX) and upload that.

## 3D Designer page

`/app/three-d-designer` (or **Open in 3D Designer** on a Design Project / BOM)

- Start a cabinet: 800 × 720 × 560 carcass with shelf, back and two doors
- Add part presets, duplicate, rotate 90°, delete, drag to move (5 mm snap)
- Edit material, hardware item, size, qty, orientation, edge banding, exact position
- Explode slider, fit view, overlay the uploaded source GLB
- Save design, Generate BOM, download GLB (metres, `Part__Material` node names, re-importable) or JSON

## Files

```
frappe_3d_designer/
├── hooks.py, install.py          BOM custom field, BOM form buttons, cancel hook
├── api.py                        get_design, save_design, generate_bom, get_materials
├── design_parser.py              JSON / CSV / XLSX / GLB / GLTF / OBJ → parts
├── bom_builder.py                parts → consolidated BOM (+ operations), background sync
├── public/js/designer_3d.bundle.js   Three.js editor and form preview
├── public/js/bom_design.js       buttons on BOM
└── designer_3d/
    ├── doctype/ design_project, design_part, design_material_map,
    │            designer_settings, designer_operation
    └── page/three_d_designer
```
