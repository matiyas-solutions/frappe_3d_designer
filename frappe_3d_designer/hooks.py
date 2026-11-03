app_name = "frappe_3d_designer"
app_title = "3D Designer"
app_publisher = "Matiyas Solutions"
app_description = "Parametric 3D furniture designer for ERPNext that turns design files into Manufacturing BOMs"
app_email = "dev@example.com"
app_license = "mit"

required_apps = ["erpnext"]

add_to_apps_screen = [
	{
		"name": "frappe_3d_designer",
		"logo": "/assets/frappe_3d_designer/images/logo.svg",
		"title": "3D Designer",
		"route": "/app/three-d-designer",
	}
]

# "Open 3D Design" buttons on the BOM form
doctype_js = {"BOM": "public/js/bom_design.js"}

doc_events = {
	"BOM": {
		"on_cancel": "frappe_3d_designer.bom_builder.on_bom_cancel",
		"on_trash": "frappe_3d_designer.bom_builder.on_bom_cancel",
	}
}

after_install = "frappe_3d_designer.install.after_install"
after_migrate = "frappe_3d_designer.install.after_install"

# helpers available in print formats (labels, drawings, cutting plans)
jinja = {
	"methods": [
		"frappe_3d_designer.labels.design_part_qr",
		"frappe_3d_designer.labels.design_part_labels",
		"frappe_3d_designer.drawings.design_technical_drawing",
		"frappe_3d_designer.drawings.design_cutting_plans",
	]
}
