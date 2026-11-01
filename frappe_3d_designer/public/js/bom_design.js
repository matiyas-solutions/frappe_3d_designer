frappe.ui.form.on("BOM", {
	refresh(frm) {
		if (!frm.doc.design_project) return;
		frm.add_custom_button(
			__("Design Project"),
			() => frappe.set_route("Form", "Design Project", frm.doc.design_project),
			__("3D Design")
		);
		frm.add_custom_button(
			__("Open in 3D Designer"),
			() => frappe.set_route("three-d-designer", frm.doc.design_project),
			__("3D Design")
		);
	},
});
