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


def after_install():
	create_custom_fields(CUSTOM_FIELDS, update=True)
	frappe.clear_cache(doctype="BOM")
