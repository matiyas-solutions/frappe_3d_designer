import frappe
from frappe import _
from frappe.utils import cint

from frappe_3d_designer.bom_builder import sync_bom
from frappe_3d_designer.design_parser import PART_KEYS, UNIT_TO_MM, clean_part, resolve_materials

PART_FIELDS = list(PART_KEYS)


@frappe.whitelist()
def get_materials():
	return frappe.get_all(
		"Design Material Map",
		fields=["name", "item_code", "color", "default_thickness_mm", "calculation_basis"],
		order_by="name asc",
	)


@frappe.whitelist()
def get_design(name: str):
	doc = frappe.get_doc("Design Project", name)
	doc.check_permission("read")
	unit = frappe.db.get_single_value("Designer Settings", "model_unit") or "m"
	return {
		"name": doc.name,
		"design_name": doc.design_name,
		"company": doc.company,
		"item": doc.item,
		"status": doc.status,
		"bom": doc.bom,
		"bom_error": doc.bom_error,
		"design_file": doc.design_file,
		"file_format": doc.file_format,
		"model_scale": UNIT_TO_MM.get(unit, 1000.0),
		"can_write": doc.has_permission("write"),
		"parts": [{f: p.get(f) for f in PART_FIELDS} for p in doc.parts],
		"materials": get_materials(),
	}


@frappe.whitelist(methods=["POST"])
def save_design(parts, name: str | None = None, design_name: str | None = None, company: str | None = None):
	parts = frappe.parse_json(parts) or []
	if not isinstance(parts, list):
		frappe.throw(_("Parts must be a list."))

	if name:
		doc = frappe.get_doc("Design Project", name)
		doc.check_permission("write")
	else:
		doc = frappe.new_doc("Design Project")
		doc.design_name = design_name or _("Untitled design")
		doc.company = (
			company
			or frappe.db.get_single_value("Designer Settings", "default_company")
			or frappe.defaults.get_user_default("Company")
		)

	rows = [clean_part(p) for p in parts if isinstance(p, dict)]
	resolve_materials(rows)
	doc.set("parts", [])
	for row in rows:
		doc.append("parts", row)
	if doc.status == "Draft":
		doc.status = "In Design"
	doc.save()
	return {"name": doc.name, "design_name": doc.design_name, "bom": doc.bom}


@frappe.whitelist(methods=["POST"])
def generate_bom(name: str, force: int | str = 0):
	frappe.get_doc("Design Project", name).check_permission("write")
	return sync_bom(name, force=bool(cint(force)))
