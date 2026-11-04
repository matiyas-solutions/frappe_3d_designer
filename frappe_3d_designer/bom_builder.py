"""Design Project -> Manufacturing BOM.

Rules
- Board parts are converted through Design Material Map:
    Sheet  -> whole sheets from the nesting / cutting plan
    Area   -> L x W (m²) x qty
    Volume -> L x W x T (m³) x qty
    Length -> longest side (m) x qty
    Nos    -> qty
  plus wastage %. Same raw material across parts is consolidated into one BOM row.
- Banded edges add the material's edge banding item in metres.
- Parts with a Hardware Item are added per piece.
- Joints add connector hardware (dowels, cams, screws) and drilling minutes from Connection Rules.
- A draft BOM linked to the design is updated in place. A submitted BOM is never touched:
  a new BOM version is created instead (ERPNext keeps old versions for existing Work Orders).
"""

import hashlib
import json

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

from frappe_3d_designer.geometry import is_board
from frappe_3d_designer.workshop import connector_requirements

HASH_FIELDS = (
	"part_name", "material", "item_code", "length_mm", "width_mm", "thickness_mm",
	"qty", "edge_band_long", "edge_band_short", "shape",
)
REALTIME_EVENT = "design_bom_synced"


# ------------------------------------------------------------------ quantities
def part_quantity(part, basis: str) -> float:
	length, width, thickness = flt(part.length_mm), flt(part.width_mm), flt(part.thickness_mm)
	n = cint(part.qty) or 1
	if basis == "Area":
		return length * width / 1e6 * n
	if basis == "Volume":
		return length * width * thickness / 1e9 * n
	if basis == "Length":
		return max(length, width) / 1000 * n
	return float(n)


def edge_length_m(part) -> float:
	long_side = max(flt(part.length_mm), flt(part.width_mm))
	short_side = min(flt(part.length_mm), flt(part.width_mm))
	n = cint(part.qty) or 1
	return (cint(part.edge_band_long) * long_side + cint(part.edge_band_short) * short_side) / 1000 * n


def parts_hash(doc) -> str:
	payload = [{f: doc_part.get(f) for f in HASH_FIELDS} for doc_part in doc.parts]
	payload.append({"item": doc.item, "company": doc.company})
	payload.append([(j.connection_rule, j.connector_count) for j in doc.get("joints") or []])
	payload.append([(s.material, s.sheet_no) for s in doc.get("sheet_layouts") or []])
	return hashlib.md5(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def collect_materials(doc, settings) -> tuple[dict[str, float], list[str], dict[tuple, float]]:
	totals: dict[str, float] = {}
	errors: list[str] = []
	cache: dict[str, object] = {}

	def add(item_code, qty):
		if item_code and qty > 0:
			totals[item_code] = totals.get(item_code, 0.0) + qty

	for p in doc.parts:
		if p.item_code:
			add(p.item_code, float(cint(p.qty) or 1))
			continue

		material_name = p.material or settings.default_material
		if not material_name:
			label = f" ({p.source_material})" if p.source_material else ""
			errors.append(
				_("Row {0}: {1}{2} has no material. Map it in Design Material Map.").format(
					p.idx, frappe.bold(p.part_name), label
				)
			)
			continue

		if material_name not in cache:
			cache[material_name] = frappe.get_cached_doc("Design Material Map", material_name)
		material = cache[material_name]
		waste = 1 + flt(material.wastage_percent) / 100

		if material.calculation_basis != "Sheet":
			add(material.item_code, part_quantity(p, material.calculation_basis) * waste)
		elif not is_board(p):
			# cylinders cannot be nested on a sheet: buy them by area so they are not lost from the BOM
			add(material.item_code, part_quantity(p, "Area") * waste)
		elif p.material != material_name:
			errors.append(
				_("Row {0}: {1} uses the fallback material, which is sheet based. Set its material so it can be nested.").format(
					p.idx, frappe.bold(p.part_name)
				)
			)
		if material.edge_band_item:
			add(material.edge_band_item, edge_length_m(p) * waste)

	# whole sheets from the cutting plan
	nested = {row.material for row in doc.get("sheet_layouts") or []}
	for p in doc.parts:
		if p.item_code or not p.material or p.material in nested or not is_board(p):
			continue
		if p.material not in cache:
			cache[p.material] = frappe.get_cached_doc("Design Material Map", p.material)
		if cache[p.material].calculation_basis == "Sheet":
			errors.append(
				_("Row {0}: {1} could not be placed on a sheet, so it would be missing from the BOM. Check the cutting plan.").format(
					p.idx, frappe.bold(p.part_name)
				)
			)
	for row in doc.get("sheet_layouts") or []:
		if row.material not in cache:
			cache[row.material] = frappe.get_cached_doc("Design Material Map", row.material)
		add(cache[row.material].item_code, 1.0)

	# connector hardware and drilling time from joints
	items, ops = connector_requirements(doc)
	for code, qty in items.items():
		add(code, qty)

	return totals, errors, ops


# ------------------------------------------------------------------ finished good
def ensure_fg_item(doc, settings) -> str:
	if doc.item:
		return doc.item
	if not cint(settings.auto_create_item):
		frappe.throw(_("Set a Finished Good Item on {0}, or enable item creation in Designer Settings.").format(doc.name))
	if not settings.fg_item_group:
		frappe.throw(_("Set Finished Good Item Group in Designer Settings."))

	item_code = doc.design_name.strip()[:140]
	if frappe.db.exists("Item", item_code):
		item_code = f"{item_code}-{doc.name}"[:140]

	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": doc.design_name[:140],
			"item_group": settings.fg_item_group,
			"stock_uom": "Nos",
			"is_stock_item": 1,
			"include_item_in_manufacturing": 1,
			"description": _("Created from 3D design {0}").format(doc.name),
		}
	).insert(ignore_permissions=True)  # allowed by Designer Settings, not by the user's Item rights
	doc.db_set("item", item.name)
	doc.item = item.name
	return item.name


# ------------------------------------------------------------------ BOM
def _editable_bom(doc):
	if doc.bom and frappe.db.get_value("BOM", doc.bom, "docstatus") == 0:
		bom = frappe.get_doc("BOM", doc.bom)
		bom.set("items", [])
		bom.set("operations", [])
		return bom
	return None


def _fill_bom(bom, doc, item_code, totals, settings, joint_ops=None):
	bom.item = item_code
	bom.company = doc.company
	bom.quantity = 1
	bom.is_active = 1
	bom.is_default = cint(settings.set_bom_as_default)
	bom.design_project = doc.name
	bom.rm_cost_as_per = bom.rm_cost_as_per or "Valuation Rate"

	for code, qty in totals.items():
		uom = frappe.db.get_value("Item", code, "stock_uom")
		bom.append(
			"items",
			{"item_code": code, "qty": flt(qty, 4), "uom": uom, "stock_uom": uom, "conversion_factor": 1},
		)

	bom.with_operations = 0
	if not cint(settings.with_operations):
		return
	minutes: dict[tuple, float] = {}
	operations = settings.operations or default_operations()
	part_count = sum(cint(p.qty) or 1 for p in doc.parts if not p.item_code)
	for op in operations:
		key = (op.operation, op.workstation)
		minutes[key] = minutes.get(key, 0.0) + flt(op.time_in_mins) * (part_count if cint(op.per_part) else 1)
	for key, mins in (joint_ops or {}).items():
		minutes[key] = minutes.get(key, 0.0) + mins
	if minutes:
		bom.with_operations = 1
	for (operation, workstation), mins in minutes.items():
		bom.append(
			"operations",
			{"operation": operation, "workstation": workstation, "time_in_mins": flt(mins, 2) or 1},
		)


def default_operations() -> list:
	"""Starter routing used when Designer Settings has no operations configured."""
	from frappe_3d_designer.install import DEFAULT_OPERATIONS

	rows = []
	for name, mins, per_part in DEFAULT_OPERATIONS:
		if frappe.db.exists("Operation", name):
			rows.append(frappe._dict(operation=name, workstation=frappe.db.get_value("Operation", name, "workstation"),
				time_in_mins=mins, per_part=per_part))
	return rows


def sync_bom(design: str, force: bool = False) -> str:
	"""Create or update the BOM for a Design Project. Returns the BOM name."""
	# row lock: the background job and a manual "Generate BOM" click never build twice
	frappe.db.get_value("Design Project", design, "name", for_update=True)
	doc = frappe.get_doc("Design Project", design)
	settings = frappe.get_cached_doc("Designer Settings")

	if not doc.parts:
		frappe.throw(_("Add parts to {0} before generating a BOM.").format(design))

	item_code = ensure_fg_item(doc, settings)
	new_hash = parts_hash(doc)
	if not force and doc.bom and doc.design_hash == new_hash and frappe.db.exists("BOM", doc.bom):
		return doc.bom

	totals, errors, joint_ops = collect_materials(doc, settings)
	if errors:
		frappe.throw("<br>".join(errors), title=_("BOM not generated"))
	if not totals:
		frappe.throw(_("No raw materials could be calculated. Check part sizes and material mapping."))

	bom = _editable_bom(doc) or frappe.new_doc("BOM")
	_fill_bom(bom, doc, item_code, totals, settings, joint_ops)
	bom.save()
	if cint(settings.auto_submit_bom):
		bom.submit()

	values = {
		"bom": bom.name,
		"design_hash": new_hash,
		"last_bom_sync": now_datetime(),
		"bom_error": None,
	}
	if doc.status in ("Draft", "In Design"):
		values["status"] = "BOM Created"
	doc.db_set(values)
	return bom.name


# ------------------------------------------------------------------ background job
def enqueue_sync(design: str):
	frappe.enqueue(
		"frappe_3d_designer.bom_builder.run_sync_job",
		queue="short",
		design=design,
		job_id=f"design_bom::{design}",
		deduplicate=True,
		enqueue_after_commit=True,
	)


def run_sync_job(design: str):
	user = frappe.session.user
	try:
		bom = sync_bom(design)
	except Exception as e:
		frappe.db.rollback()
		message = frappe.utils.strip_html(str(e))[:1000]
		frappe.log_error(title=f"3D Design BOM failed: {design}")
		frappe.db.set_value("Design Project", design, "bom_error", message, update_modified=False)
		frappe.db.commit()
		frappe.publish_realtime(REALTIME_EVENT, {"design": design, "error": message}, user=user)
		return
	frappe.db.commit()
	frappe.publish_realtime(REALTIME_EVENT, {"design": design, "bom": bom}, user=user)


# ------------------------------------------------------------------ hooks
def on_bom_cancel(doc, method=None):
	design = doc.get("design_project")
	if design and frappe.db.get_value("Design Project", design, "bom") == doc.name:
		frappe.db.set_value("Design Project", design, {"bom": None, "design_hash": None}, update_modified=False)
