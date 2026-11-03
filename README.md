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

1. **Raw material items**: boards stocked in `Nos` (Sheet basis, one sheet) or `Square Meter` (Area),
   `Cubic Meter` (Volume), `Meter` (Length, edge banding), hardware in `Nos`.
2. **Design Material Map**: one record per board/material. Link the raw material item, choose the
   calculation basis (Sheet with sheet size, kerf, trim), grain, wastage %, colour, edge banding item,
   and the names used in design files (aliases, one per line, e.g. `WHITE_18`).
3. **Design Connection Rule**: check the starter rules, add hardware items and operations.
4. **Design Library Component**: your hinges, handles, legs, runners and profiles.
5. **Designer Settings**: default and thin-panel connection rules, company, finished good item group, fallback material, BOM default/submit
   options, unit of uploaded models (GLB is usually metres), optional operations
   (e.g. Cutting, Edge Banding, Assembly with workstation and minutes).

## PYTHA-style feature coverage

| Feature | Where in the app |
|---|---|
| 2D and 3D in one system | 3D Designer page with 3D, Front, Top and Side (orthographic) views |
| Free form / smart parametric modelling | Parametric **Cabinet** dialog (size, plinth, shelves, doors, overlay or grooved back), panel presets, exact position and size per part |
| Integrated parts list | Parts table on Design Project, part list on drawings and cutting plans |
| High end presentation | **Presentation** mode: PBR materials, wood grain, environment light, soft shadows; **Save render** stores a PNG on the design |
| Explosion view | Explode slider (designer and form preview) |
| Fast technical drawings | **Technical drawing**: front, side, top views, overall dimensions, part balloons, title block (dialog + print format) |
| Associative sections | Live section plane in 3D (height, width, depth) and Section A-A in the drawing, regenerated from the model on every print |
| Saw optimisation and nesting | MaxRects nesting per sheet material with kerf, trim and grain; cutting diagrams; BOM in whole sheets |
| Grain direction | Grain per part, Has Grain per material; nesting keeps direction; shown on labels and renders |
| Edge banding assignment | Long/short edges per part, edge band item per material, metres in the BOM |
| Workshop: automatic construction methods | Joint detection between touching panels; Connection Rules (dowel, cam and dowel, screw, confirmat, shelf pin, groove, miter) |
| Automatic boreholes | Face and edge holes per connector, shown in 3D with **Drilling**, exported to CNC |
| Own boreholes definition | Machining table: Drill rows with face, X, Y, diameter, depth |
| Routing of parts and edges, miter | Machining table: Route, Pocket, Edge Profile, Miter, Groove |
| Extensive parts library | **Design Library Component** (hinges, handles, legs, runners, profiles), inserted from the designer |
| Label plotting | **Design Part Labels** print format, 100 × 50 mm, QR code per piece |
| CNC connection / data interface | **Export for CNC** zip: cut list CSV, neutral JSON program, one DXF per part with layer-coded machining, sheet diagrams |
| Seamless ERP integration | Automatic BOM with sheets, edge banding, hardware, connectors and operation minutes |

## Workshop: joints and connectors

On every save (if **Detect Joints Automatically** is on) panels whose edge touches another panel's face
become joints. Settings decide which rule is used: the default rule, or the thin-panel rule when one
panel is at or below the thin panel limit (back panels).

Per joint the rule sets: connectors along the joint (`max spacing`, `min per joint`, offset from the ends),
face and edge hole sizes, hardware items per connector, and an operation with minutes per connector.
Groove rules add a groove to the thicker panel instead (inset back panels sitting up to 12 mm deep).

Installing the app creates four starter rules (Dowel 8x35, Cam and Dowel, Back Panel Screw,
Back Panel Groove). Add your hardware items and operations to them.

Face naming for holes and machining (coordinates from the part's min corner, mm):

| Face | X | Y |
|---|---|---|
| Top / Bottom | along Length | along Width |
| Left Edge / Right Edge (Length ends) | along Width | along Thickness |
| Back Edge / Front Edge (Width ends) | along Length | along Thickness |

## CNC export

`Export for CNC` attaches a zip to the design:

- `cutlist.csv`: panel saw / optimiser import
- `program.json`: neutral program per part (holes, grooves, routing per face)
- `dxf/<label>.dxf`: R12 DXF per part. Layers: `OUTLINE`, `DRILL_<FACE>_D<dia>_Z<depth>`,
  `GROOVE_<FACE>_W<width>_Z<depth>`, `ROUTE_…`, `POCKET_…`, `PROFILE_…`, `MITER_…`
- `sheets/*.svg`, `drawing.svg`

Map the layer names to operations once in your CAM software (woodWOP, Alphacam, BiesseWorks, Maestro, etc.).
A machine-specific postprocessor (e.g. MPR, CIX, XXL) can be added in `cnc_export.py` on top of `build_program()`.

## How the BOM is built

| Basis | Quantity per part |
|---|---|
| Sheet | whole sheets from the cutting plan (stock UOM Nos) |
| Area | L × W / 1,000,000 × qty (m²) |
| Volume | L × W × T / 1,000,000,000 × qty (m³) |
| Length | longest side / 1000 × qty (m) |
| Nos | qty |

Wastage % is added on top (not for Sheet, which is already real usage). Banded edges add the material's
edge banding item in metres. Joints add connector hardware and operation minutes.
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

- Cabinet dialog, panel presets, parts library, duplicate, rotate 90°, delete, drag to move (5 mm snap)
- Edit material, hardware item, shape, grain, size, qty, orientation, edge banding, exact position
- 3D / Front / Top / Side views, section plane, explode, drilling overlay, presentation mode, save render
- Menu: technical drawing, cutting plan, part labels, export for CNC, GLB and JSON download
- Save design, Generate BOM

## Files

```
frappe_3d_designer/
├── hooks.py, install.py          BOM custom field, BOM form buttons, cancel hook
├── api.py                        get_design, save_design, generate_bom, get_materials
├── design_parser.py              JSON / CSV / XLSX / GLB / GLTF / OBJ → parts
├── bom_builder.py                parts → consolidated BOM (+ operations), background sync
├── geometry.py                   shared part geometry and face coordinates
├── nesting.py                    MaxRects saw optimisation
├── workshop.py                   joints, connectors, boreholes, grooves
├── drawings.py                   technical drawing and cutting plan SVG
├── labels.py                     part labels with QR codes
├── cnc_export.py                 CSV / JSON / DXF export
├── public/js/designer_3d.bundle.js   Three.js editor and form preview
├── public/js/bom_design.js       buttons on BOM
└── designer_3d/
    ├── doctype/ design_project, design_part, design_material_map, designer_settings,
    │            designer_operation, design_joint, design_machining, design_sheet_layout,
    │            design_connection_rule, design_connection_item, design_library_component
    ├── print_format/ design_part_labels, design_cutting_plan, design_technical_drawing
    └── page/three_d_designer
```

## Limits

- Parts are rectangular panels or cylinders; rotation snaps to 90° steps for joints, drawings and CNC.
- Presentation mode is real-time PBR rendering, not ray tracing.
- Nesting is rectangular (no free-form nesting of curved parts).
- DXF export is generic; machine-native formats need a postprocessor for your CNC.
