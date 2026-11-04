import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CUSTOM_FIELDS = {
	"BOM": [
		{
			"fieldname": "design_project",
			"label": "3D Design",
			"fieldtype": "Link",
			"options": "Design Project",
			"insert_after": "item",
			"read_only": 1,
			"no_copy": 1,
			"in_standard_filter": 1,
		}
	],
}

# geometry-only starter rules; add hardware items and operations to them later
DEFAULT_RULES = [
	{"rule_name": "Dowel 8x35", "connection_type": "Dowel", "spacing_mm": 160, "min_per_joint": 2,
	 "edge_offset_mm": 50, "face_diameter_mm": 8, "face_depth_mm": 12, "edge_diameter_mm": 8, "edge_depth_mm": 25},
	{"rule_name": "Cam and Dowel", "connection_type": "Cam and Dowel", "spacing_mm": 256, "min_per_joint": 2,
	 "edge_offset_mm": 37, "face_diameter_mm": 15, "face_depth_mm": 13, "edge_diameter_mm": 8, "edge_depth_mm": 34},
	{"rule_name": "Back Panel Screw", "connection_type": "Screw", "spacing_mm": 200, "min_per_joint": 2,
	 "edge_offset_mm": 40, "face_diameter_mm": 4, "face_depth_mm": 6, "edge_diameter_mm": 3, "edge_depth_mm": 20},
	{"rule_name": "Back Panel Groove", "connection_type": "Groove", "groove_depth_mm": 8, "min_per_joint": 1},
]


# (operation, minutes, per part) - used for BOM operations until Designer Settings lists its own
DEFAULT_OPERATIONS = [
	("Panel Cutting", 3, 1),
	("Edge Banding", 2, 1),
	("Drilling", 2, 1),
	("Assembly", 30, 0),
	("Packing", 10, 0),
]

# (name, category, shape, L, W, T, orientation, default qty, uom)
HARDWARE = [
	("Screw", "Fitting", "Cylinder", 4, 4, 30, "Vertical Back", 16, "Nos"),
	("Gum (Wood Glue)", "Other", "Cylinder", 40, 40, 100, "Vertical Back", 1, "Nos"),
	("Handle", "Fitting", "Box", 128, 20, 30, "Vertical Back", 1, "Nos"),
	("Hinge", "Hinge", "Box", 100, 45, 12, "Vertical Back", 2, "Nos"),
	("Cam Lock", "Connector", "Cylinder", 15, 15, 13, "Horizontal", 4, "Nos"),
	("Wooden Dowel", "Connector", "Cylinder", 8, 8, 35, "Horizontal", 8, "Nos"),
	("Furniture Leg", "Leg", "Cylinder", 50, 50, 100, "Horizontal", 4, "Nos"),
	("Drawer Runner", "Drawer Runner", "Box", 450, 12, 45, "Vertical Side", 2, "Nos"),
	("Edge Band Tape", "Other", "Box", 100, 20, 20, "Horizontal", 1, "Nos"),
	("Nails", "Fitting", "Cylinder", 2, 2, 25, "Vertical Back", 20, "Nos"),
]


def after_install():
	create_custom_fields(CUSTOM_FIELDS, update=True)
	seed_operations()
	seed_connection_rules()
	seed_hardware()
	frappe.clear_cache(doctype="BOM")


def seed_connection_rules():
	if frappe.db.count("Design Connection Rule"):
		return
	for rule in DEFAULT_RULES:
		if rule["connection_type"] != "Groove" and frappe.db.exists("Operation", "Drilling"):
			rule = {**rule, "operation": "Drilling",
				"workstation": frappe.db.get_value("Operation", "Drilling", "workstation"),
				"mins_per_connector": 0.5}
		frappe.get_doc({"doctype": "Design Connection Rule", **rule}).insert(ignore_permissions=True)
	settings = frappe.get_single("Designer Settings")
	settings.default_connection_rule = settings.default_connection_rule or "Dowel 8x35"
	settings.thin_panel_rule = settings.thin_panel_rule or "Back Panel Screw"
	settings.flags.ignore_mandatory = True
	settings.save(ignore_permissions=True)


def _ensure(doctype, docname, **values):
	if frappe.db.exists(doctype, docname):
		return docname
	try:
		frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True)
		return docname
	except Exception:
		frappe.log_error(title=f"3D Designer: could not create {doctype} {docname}")
		return None


def seed_operations():
	"""Operations + workstations so a generated BOM always carries a routing."""
	for name, _mins, _per_part in DEFAULT_OPERATIONS:
		station = _ensure("Workstation", f"{name} Station", workstation_name=f"{name} Station")
		_ensure("Operation", name, name=name, workstation=station)


def seed_hardware():
	"""Screws, glue, handles etc. as ERPNext items and parts-library components (shown in Add part)."""
	_ensure("Item Group", "Hardware", item_group_name="Hardware", parent_item_group="All Item Groups")
	group = "Hardware" if frappe.db.exists("Item Group", "Hardware") else "All Item Groups"
	for name, category, shape, length, width, thickness, orientation, qty, uom in HARDWARE:
		if frappe.db.exists("Design Library Component", name):
			continue
		if not frappe.db.exists("Item", name):
			if not _ensure("Item", name, item_code=name, item_name=name, item_group=group,
					stock_uom=uom, is_stock_item=1, include_item_in_manufacturing=1):
				continue
		_ensure("Design Library Component", name, component_name=name, category=category, item_code=name,
			shape=shape, orientation=orientation, length_mm=length, width_mm=width, thickness_mm=thickness,
			default_qty=qty)
