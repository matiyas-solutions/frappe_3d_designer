frappe.ui.form.on("Design Material Map", {
	setup(frm) {
		frm.set_query("item_code", () => ({ filters: { disabled: 0 } }));
		frm.set_query("edge_band_item", () => ({ filters: { disabled: 0 } }));
	},
});
