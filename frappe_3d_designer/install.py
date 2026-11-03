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


def after_install():
	create_custom_fields(CUSTOM_FIELDS, update=True)
	seed_connection_rules()
	frappe.clear_cache(doctype="BOM")


def seed_connection_rules():
	if frappe.db.count("Design Connection Rule"):
		return
	for rule in DEFAULT_RULES:
		frappe.get_doc({"doctype": "Design Connection Rule", **rule}).insert(ignore_permissions=True)
	settings = frappe.get_single("Designer Settings")
	settings.default_connection_rule = settings.default_connection_rule or "Dowel 8x35"
	settings.thin_panel_rule = settings.thin_panel_rule or "Back Panel Screw"
	settings.flags.ignore_mandatory = True
	settings.save(ignore_permissions=True)
