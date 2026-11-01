"""Turn an uploaded design file into Design Part rows.

Supported inputs
- Native JSON  : saved/downloaded from the 3D Designer page
- CSV / XLSX   : cut lists / parts lists (PYTHA, CutList Plus, Excel ...)
- GLB / GLTF   : mesh exports (PYTHA, SketchUp, Blender, Fusion ...). GLTF must be embedded.
- OBJ          : mesh export

Mesh naming convention (recommended):  "<Part name>__<Material name>"
e.g. "Left side__Melamine White 18". If no "__" is present the mesh material name is used.
"""

import io
import json
import os

import frappe
from frappe import _
from frappe.utils import cint, flt

FORMATS = {
	".json": "Native JSON",
	".csv": "CSV Cut List",
	".xlsx": "XLSX Cut List",
	".glb": "GLB",
	".gltf": "GLTF",
	".obj": "OBJ",
}

UNIT_TO_MM = {"m": 1000.0, "cm": 10.0, "mm": 1.0}

# header aliases for cut lists (lower-case, stripped)
HEADER_ALIASES = {
	"part_name": ("part", "part name", "part_name", "name", "description", "component", "bezeichnung", "teil"),
	"material": ("material", "board", "panel material", "werkstoff", "material name"),
	"item_code": ("item", "item code", "item_code", "article", "artikel", "sku"),
	"length_mm": ("length", "l", "length (mm)", "length mm", "länge", "laenge", "len"),
	"width_mm": ("width", "w", "width (mm)", "width mm", "breite", "wid"),
	"thickness_mm": ("thickness", "t", "thk", "thickness (mm)", "thickness mm", "stärke", "staerke", "dicke"),
	"qty": ("qty", "quantity", "count", "pcs", "nos", "anzahl", "stück", "stk"),
	"edge_band_long": ("edge long", "edge_long", "eb long", "edge l", "long edges", "kante lang"),
	"edge_band_short": ("edge short", "edge_short", "eb short", "edge w", "short edges", "kante kurz"),
	"orientation": ("orientation",),
}

PART_KEYS = (
	"part_name", "material", "item_code", "source_material", "orientation",
	"length_mm", "width_mm", "thickness_mm", "qty", "edge_band_long", "edge_band_short",
	"pos_x", "pos_y", "pos_z", "rot_y", "mesh_id",
)
ORIENTATIONS = ("Horizontal", "Vertical Side", "Vertical Back")


# ------------------------------------------------------------------ entry point
def detect_format(file_url: str) -> str:
	ext = os.path.splitext((file_url or "").split("?")[0])[1].lower()
	if ext not in FORMATS:
		frappe.throw(
			_("Unsupported design file {0}. Use GLB, GLTF, OBJ, CSV, XLSX or a 3D Designer JSON.").format(
				frappe.bold(os.path.basename(file_url or ""))
			)
		)
	return ext


def parse_design_file(file_url: str) -> tuple[str, list[dict]]:
	"""Return (file_format, parts) for an attached file."""
	ext = detect_format(file_url)
	content = _read_file(file_url)

	if ext == ".json":
		parts = parse_native(json.loads(content))
	elif ext == ".csv":
		from frappe.utils.csvutils import read_csv_content

		parts = rows_to_parts(read_csv_content(content))
	elif ext == ".xlsx":
		from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

		parts = rows_to_parts(read_xlsx_file_from_attached_file(fcontent=content))
	else:
		unit = frappe.db.get_single_value("Designer Settings", "model_unit") or "m"
		parts = parse_mesh(content, ext, UNIT_TO_MM.get(unit, 1000.0))

	if not parts:
		frappe.throw(_("No parts found in {0}.").format(os.path.basename(file_url)))

	resolve_materials(parts)
	return FORMATS[ext], parts


def _read_file(file_url: str) -> bytes:
	file_doc = frappe.get_doc("File", {"file_url": file_url})
	content = file_doc.get_content()
	return content.encode() if isinstance(content, str) else content


# ------------------------------------------------------------------ native JSON
def parse_native(data) -> list[dict]:
	rows = data.get("parts") if isinstance(data, dict) else data
	if not isinstance(rows, list):
		frappe.throw(_("Design JSON must contain a list called parts."))
	return [clean_part(r) for r in rows if isinstance(r, dict)]


# ------------------------------------------------------------------ cut lists
def _normalise_header(value) -> str:
	return " ".join(str(value or "").replace("_", " ").strip().lower().split())


def map_headers(header_row) -> dict[int, str]:
	lookup = {}
	for field, names in HEADER_ALIASES.items():
		for n in names:
			lookup[_normalise_header(n)] = field
	mapping = {}
	for idx, cell in enumerate(header_row):
		field = lookup.get(_normalise_header(cell))
		if field and field not in mapping.values():
			mapping[idx] = field
	return mapping


def rows_to_parts(rows) -> list[dict]:
	rows = [r for r in (rows or []) if r and any(str(c or "").strip() for c in r)]
	if not rows:
		return []

	# header can be in one of the first 10 rows (exports often have a title block)
	header_idx, mapping = 0, {}
	for i, row in enumerate(rows[:10]):
		m = map_headers(row)
		if "part_name" in m.values() and ("length_mm" in m.values() or "item_code" in m.values()):
			header_idx, mapping = i, m
			break
	if not mapping:
		frappe.throw(
			_("Could not find cut list headers. Expected columns like Part, Material, Length, Width, Thickness, Qty.")
		)

	parts = []
	for row in rows[header_idx + 1 :]:
		raw = {field: row[idx] if idx < len(row) else None for idx, field in mapping.items()}
		if not str(raw.get("part_name") or "").strip():
			continue
		raw["source_material"] = raw.pop("material", None)
		parts.append(clean_part(raw))
	return parts


# ------------------------------------------------------------------ meshes
def parse_mesh(content: bytes, ext: str, to_mm: float = 1000.0) -> list[dict]:
	try:
		import numpy as np
		import trimesh
	except ImportError:
		frappe.throw(_("Python package trimesh is missing. Run: bench pip install trimesh"))

	scene = trimesh.load(io.BytesIO(content), file_type=ext.lstrip("."), force="scene")
	axis_to_orientation = {0: "Vertical Side", 1: "Horizontal", 2: "Vertical Back"}

	parts = []
	for node_name in scene.graph.nodes_geometry:
		transform, geom_name = scene.graph[node_name]
		mesh = scene.geometry.get(geom_name)
		if mesh is None or not hasattr(mesh, "vertices") or len(mesh.vertices) == 0:
			continue

		world = mesh.copy()
		world.apply_transform(transform)

		try:
			extents = world.bounding_box_oriented.extents * to_mm
		except Exception:
			extents = world.bounding_box.extents * to_mm
		length, width, thickness = sorted((float(e) for e in extents), reverse=True)

		aabb = world.bounding_box.extents
		centre = world.bounding_box.centroid * to_mm
		part_name, material = split_mesh_name(node_name, mesh)

		parts.append(
			clean_part(
				{
					"part_name": part_name,
					"source_material": material,
					"orientation": axis_to_orientation[int(np.argmin(aabb))],
					"length_mm": round(length, 1),
					"width_mm": round(width, 1),
					"thickness_mm": round(thickness, 1),
					"qty": 1,
					"pos_x": round(float(centre[0]), 1),
					"pos_y": round(float(centre[1]), 1),
					"pos_z": round(float(centre[2]), 1),
					"mesh_id": str(node_name)[:140],
				}
			)
		)
	return parts


def split_mesh_name(node_name: str, mesh=None) -> tuple[str, str | None]:
	name = str(node_name or "Part")
	material = None
	if "__" in name:
		name, material = name.split("__", 1)
	if not material and mesh is not None:
		visual_material = getattr(getattr(mesh, "visual", None), "material", None)
		material = getattr(visual_material, "name", None)
	clean = lambda s: " ".join(str(s).replace("_", " ").split()) if s else None  # noqa: E731
	# strip exporter suffixes like ".001"
	name = clean(name.rsplit(".", 1)[0] if name.rsplit(".", 1)[-1].isdigit() else name)
	return name or "Part", clean(material)


# ------------------------------------------------------------------ helpers
def clean_part(raw: dict) -> dict:
	part = {k: raw.get(k) for k in PART_KEYS if raw.get(k) not in (None, "")}
	part["part_name"] = str(part.get("part_name") or "Part").strip()[:140]
	for key in ("length_mm", "width_mm", "thickness_mm", "pos_x", "pos_y", "pos_z", "rot_y"):
		part[key] = abs(flt(part.get(key))) if key.endswith("_mm") else flt(part.get(key))
	part["qty"] = max(cint(part.get("qty")) or 1, 1)
	for key in ("edge_band_long", "edge_band_short"):
		part[key] = min(max(cint(part.get(key)), 0), 2)
	if part.get("orientation") not in ORIENTATIONS:
		part["orientation"] = "Horizontal"
	return part


def material_key(value) -> str:
	"""'WHITE_18', 'White  18' and 'white 18' all match each other."""
	return " ".join(str(value or "").replace("_", " ").lower().split())


def material_lookup() -> dict[str, str]:
	"""normalised name/alias -> Design Material Map name"""
	lookup = {}
	for m in frappe.get_all("Design Material Map", fields=["name", "aliases"]):
		lookup[material_key(m.name)] = m.name
		for alias in (m.aliases or "").splitlines():
			if alias.strip():
				lookup.setdefault(material_key(alias), m.name)
	return lookup


def resolve_materials(parts: list[dict]) -> None:
	"""Fill `material` from `source_material` using names and aliases. Unknown names stay in source_material."""
	lookup = material_lookup()
	for p in parts:
		if p.get("material") and p["material"] in lookup.values():
			continue
		candidate = p.get("material") or p.get("source_material")
		p["material"] = lookup.get(material_key(candidate))
		if candidate and not p["material"]:
			p["source_material"] = candidate
