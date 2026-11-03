# 3D Designer: Step-by-Step Usage Flow

This guide walks through the full workflow, from installing the app to producing a BOM, drawings, labels and CNC files.

## Overview

```
PHASE 1  Install
PHASE 2  One-time setup (Items → Material Map → Rules → Library → Settings)
PHASE 3  Create a Design Project
PHASE 4  Get parts in (design in browser OR upload file)
PHASE 5  Edit and review the model
PHASE 6  Save (auto: joints → holes → nesting → BOM job)
PHASE 7  Review the BOM
PHASE 8  Outputs (drawing, cutting plan, labels, CNC, render)
PHASE 9  Revise (change parts → save → new BOM version)
```

Roles: Phases 1 and 2 are done once by an admin. Phases 3 to 9 are done by designers for each job.

---

## Phase 1: Install (admin, once)

| Step | Action | Result |
|---|---|---|
| 1.1 | `cd ~/frappe-bench` | |
| 1.2 | `bench get-app <repo-url> --branch main` | App downloaded |
| 1.3 | `bench build --app frappe_3d_designer` | Three.js bundle built |
| 1.4 | `bench --site <site> install-app frappe_3d_designer` | DocTypes, custom field `BOM.design_project`, 4 starter connection rules created |
| 1.5 | `bench --site <site> migrate` then `bench restart` | App live |

Requires Frappe/ERPNext v16, Python 3.14+, Node 24.

---

## Phase 2: One-time setup (admin)

Do these in order, because each step depends on the one before.

### Step 2.1: Raw material Items
Create Items in ERPNext:
- Boards: stock UOM `Nos` (sheet basis) or `Square Meter` (area basis).
- Solid or volume materials: `Cubic Meter`.
- Edge banding: `Meter`.
- Hardware (hinges, handles, dowels, cams, screws): `Nos`.

### Step 2.2: Design Material Map
Create one record per board or material.

| Field | What to enter |
|---|---|
| Raw material item | The Item from 2.1 |
| Calculation basis | Sheet / Area / Volume / Length / Nos |
| Sheet size, kerf, trim | Only for Sheet basis (used by nesting) |
| Has Grain | Tick if the material has a grain direction |
| Wastage % | Added to the BOM quantity (not for Sheet) |
| Colour | Used in 3D and renders |
| Edge banding item | Item used for banded edges |
| Aliases | One per line, e.g. `WHITE_18`, `MDF18` |

### Step 2.3: Design Connection Rules
Open the 4 starter rules (Dowel 8x35, Cam and Dowel, Back Panel Screw, Back Panel Groove). For each:
- Set the max spacing, min connectors per joint and offset from the ends.
- Set the face and edge hole diameters and depths.
- Add hardware items per connector (Design Connection Item rows).
- Set the operation and minutes per connector.

### Step 2.4: Design Library Components
Add reusable parts (hinges, handles, legs, runners, profiles) so designers can insert them from the designer page.

### Step 2.5: Designer Settings
- Default connection rule and thin-panel rule, plus the thin-panel limit (for back panels).
- Company and finished-good item group.
- Fallback material, used when a part's material is not found.
- BOM options: make it default, submit automatically.
- Unit of uploaded models (GLB is usually metres).
- Detect Joints Automatically (tick to enable).
- Optional operations (Cutting, Edge Banding, Assembly) with workstation and minutes.

**Setup is complete when:** every material you will use has a Material Map, and the rules point to real hardware Items.

---

## Phase 3: Create a Design Project (designer)

| Step | Action |
|---|---|
| 3.1 | Go to **Design Project → New**. |
| 3.2 | Enter the title and customer or reference. |
| 3.3 | Save. The form shows the parts table, a 3D preview and the BOM link. |
| 3.4 | Click **Open in 3D Designer**, or go to `/app/three-d-designer`. |

---

## Phase 4: Get parts in (choose A or B)

### Route A: Design in the browser

| Step | Action |
|---|---|
| A.1 | Click **Cabinet**. Enter the size, plinth, shelves, doors and back type (overlay or grooved). |
| A.2 | Choose the material for carcass, doors and back. |
| A.3 | Confirm. The parts are generated. |
| A.4 | Add extra panels from the **panel presets**, or hardware from the **parts library**. |

### Route B: Upload a file

| Step | Action |
|---|---|
| B.1 | Prepare the file (see formats below). |
| B.2 | Attach it in the **Design File** field on the Design Project. |
| B.3 | Save. The parts are read into the parts table. |

| Format | Preparation |
|---|---|
| GLB / GLTF | Single embedded file. One mesh = one part. Name meshes `Part name__Material`. |
| OBJ | Same naming rule. |
| CSV / XLSX | Header row within the first 10 rows. Columns: Part, Material, Length, Width, Thickness, Qty, Edge long, Edge short, Item code. German headers also work. |
| JSON | Download from the 3D Designer menu. |

PYTHA, SketchUp, Blender and Fusion native files are not supported. Export GLB, OBJ or a parts list from them.

**Check:** if the form shows "unmapped material", add that name as an alias in a Design Material Map (Step 2.2) and save again.

---

## Phase 5: Edit and review the model

### Step 5.1: Edit parts
Select a part and change:
- Material, grain, shape (panel or cylinder)
- Length, width, thickness, qty
- Orientation, exact X/Y/Z position
- Edge banding (long and short edges)
- Hardware item (added per piece)
- Machining rows: Drill (face, X, Y, diameter, depth), Route, Pocket, Edge Profile, Miter, Groove

Also available: **duplicate**, **rotate 90°**, **delete**, and **drag to move** (5 mm snap).

### Step 5.2: Inspect
| Tool | Use |
|---|---|
| 3D / Front / Top / Side | Check dimensions from every angle |
| Section plane | Cut through the model (height, width, depth) |
| Explode slider | See how the parts fit together |
| Drilling overlay | Check auto-generated and manual boreholes |
| Presentation mode | PBR materials, wood grain, soft shadows, for client views |

---

## Phase 6: Save (what happens automatically)

Click **Save design**. Then:

```
Save
 ├─ 1. Parts hash checked (changed? continue)
 ├─ 2. Joints detected between touching panels
 │     └─ rule chosen: default, or thin-panel rule for back panels
 ├─ 3. Connectors placed along each joint
 │     └─ boreholes generated (face and edge holes)
 ├─ 4. Nesting (MaxRects) per sheet material
 │     └─ uses kerf, trim, grain → sheet layouts
 └─ 5. Background job: BOM sync (Phase 7)
```

Errors appear at the top of the Design Project form.

---

## Phase 7: Review the BOM

| Step | Action |
|---|---|
| 7.1 | Wait for the live notification, or click **Generate BOM** to run it now. |
| 7.2 | Open the linked BOM from the Design Project. |
| 7.3 | Check the rows. |

How the BOM is built:
- Sheet materials: whole sheets from the cutting plan.
- Area, volume and length materials: calculated from the part sizes, plus wastage %.
- Banded edges: edge banding item, in metres.
- Joints: connector hardware and operation minutes.
- Parts with a Hardware Item: added per piece.
- The same raw material across parts is merged into one BOM row.

Behaviour:
- If a draft BOM is linked, it is updated in place.
- If the linked BOM is submitted, a new BOM version is created and the old one stays for existing Work Orders.
- If there is no finished good item, one is created from Designer Settings.

**Next in ERPNext:** create a Work Order from the BOM as usual.

---

## Phase 8: Outputs

| Output | Steps | What you get |
|---|---|---|
| Technical drawing | Menu → Technical drawing, or the print format *Design Technical Drawing* | Front, side and top views, overall dimensions, part balloons, title block, Section A-A |
| Cutting plan | Menu → Cutting plan, or print format *Design Cutting Plan* | Sheet diagrams and part list |
| Part labels | Print format *Design Part Labels* | 100 × 50 mm labels, QR code per piece, grain and edge info |
| CNC export | Menu → Export for CNC | Zip attached to the design (see below) |
| Render | Presentation mode → Save render | PNG attached to the design |
| Model files | Menu → Download GLB / JSON | For sharing or re-import |

CNC zip contents:
- `cutlist.csv`: for a panel saw or optimiser
- `program.json`: neutral program per part
- `dxf/<label>.dxf`: one per part, with layers `OUTLINE`, `DRILL_…`, `GROOVE_…`, `ROUTE_…`, `POCKET_…`, `PROFILE_…`, `MITER_…`
- `sheets/*.svg` and `drawing.svg`

Map the DXF layer names to operations once in your CAM software.

---

## Phase 9: Revise a design

| Step | Action |
|---|---|
| 9.1 | Open the Design Project, then the 3D Designer. |
| 9.2 | Change parts, materials or sizes. |
| 9.3 | Save. Joints, holes and nesting are recalculated. |
| 9.4 | The BOM is updated (draft) or a new version is created (submitted). |
| 9.5 | Re-print drawings, labels and the CNC export. |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Unmapped material" error | Name is not in any Material Map | Add the name as an alias, or set a fallback material in Designer Settings |
| GLB model is the wrong size | Wrong unit | Set the model unit in Designer Settings |
| No joints or holes | Joint detection is off, or the rule has no connectors | Tick *Detect Joints Automatically*, check the rule values |
| No hardware in the BOM | Rule has no connection items | Add hardware Items to the Connection Rule |
| BOM not updated | Background job still running or failed | Check the form error banner and the background jobs list |
| Edge banding missing in the BOM | No edge banding item on the material | Set it in the Material Map |
| Nesting looks wrong | Wrong sheet size, kerf or trim | Fix them in the Material Map |

## Limits
- Parts are rectangular panels or cylinders, with rotation in 90° steps.
- Nesting is rectangular only.
- Presentation mode is real-time rendering, not ray tracing.
- The DXF export is generic. Machine-native formats (MPR, CIX and so on) need a postprocessor in `cnc_export.py`.
