frappe.pages["three-d-designer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("3D Designer"),
		single_column: true,
	});

	frappe.require("designer_3d.bundle.js", () => {
		wrapper.designer = new frappe_3d_designer.Designer({
			page,
			wrapper: $(wrapper).find(".layout-main-section"),
		});
		wrapper.designer.load_from_route();
	});
};

frappe.pages["three-d-designer"].on_page_show = function (wrapper) {
	wrapper.designer?.load_from_route();
};
