frappe.ui.form.on("Design Project", {
	setup(frm) {
		frm.set_query("item", () => ({ filters: { is_stock_item: 1, disabled: 0 } }));
	},

	onload(frm) {
		frappe.realtime.off("design_bom_synced");
		frappe.realtime.on("design_bom_synced", (data) => {
			if (!cur_frm || cur_frm.doc.name !== data.design) return;
			if (data.error) {
				frappe.show_alert({ message: __("BOM not updated: {0}", [data.error]), indicator: "red" }, 8);
			} else {
				frappe.show_alert({ message: __("BOM {0} updated", [data.bom]), indicator: "green" });
			}
			cur_frm.reload_doc();
		});
	},

	refresh(frm) {
		if (frm.doc.bom_error) {
			frm.set_intro(__("Last BOM update failed: {0}", [frm.doc.bom_error]), "red");
		}

		if (!frm.is_new()) {
			frm.add_custom_button(__("Open in 3D Designer"), () =>
				frappe.set_route("three-d-designer", frm.doc.name)
			);
			frm.add_custom_button(
				frm.doc.bom ? __("Rebuild BOM") : __("Generate BOM"),
				() =>
					frappe
						.call({
							method: "frappe_3d_designer.api.generate_bom",
							args: { name: frm.doc.name, force: frm.doc.bom ? 1 : 0 },
							freeze: true,
							freeze_message: __("Building BOM from parts"),
						})
						.then((r) => {
							frappe.show_alert({ message: __("BOM {0} is ready", [r.message]), indicator: "green" });
							frm.reload_doc();
						}),
				__("Manufacturing")
			);
			if (frm.doc.bom) {
				frm.add_custom_button(__("View BOM"), () => frappe.set_route("Form", "BOM", frm.doc.bom), __("Manufacturing"));
			}
			const printView = (format) => {
				if (frm.is_dirty()) return frappe.show_alert(__("Save the design first"));
				const q = new URLSearchParams({ doctype: frm.doctype, name: frm.doc.name, format, no_letterhead: 1 });
				window.open(`/printview?${q}`, "_blank");
			};
			frm.add_custom_button(__("Technical drawing"), () => frm.trigger("show_drawing"), __("Output"));
			frm.add_custom_button(__("Cutting plan"), () => printView("Design Cutting Plan"), __("Output"));
			frm.add_custom_button(__("Part labels"), () => printView("Design Part Labels"), __("Output"));
			frm.add_custom_button(
				__("Export for CNC"),
				() =>
					frappe
						.call({
							method: "frappe_3d_designer.api.export_cnc",
							args: { name: frm.doc.name },
							freeze: true,
							freeze_message: __("Preparing CNC files"),
						})
						.then((r) => {
							window.open(r.message, "_blank");
							frm.reload_doc();
						}),
				__("Output")
			);
			if (frm.doc.design_file) {
				frm.add_custom_button(__("Read design file again"), () =>
					frm.call("reimport_design_file").then(() => frm.reload_doc())
				);
			}
		} else {
			frm.add_custom_button(__("Open in 3D Designer"), () => frappe.set_route("three-d-designer"));
		}

		frm.trigger("render_preview");
		frm.trigger("render_cutting_plan");
	},

	show_drawing(frm) {
		frappe.xcall("frappe_3d_designer.api.get_drawing", { name: frm.doc.name }).then((svg) => {
			const d = new frappe.ui.Dialog({
				title: __("Technical drawing"),
				size: "extra-large",
				fields: [{ fieldname: "svg", fieldtype: "HTML" }],
				primary_action_label: __("Print"),
				primary_action: () => {
					const q = new URLSearchParams({
						doctype: frm.doctype,
						name: frm.doc.name,
						format: "Design Technical Drawing",
						no_letterhead: 1,
					});
					window.open(`/printview?${q}`, "_blank");
				},
			});
			d.get_field("svg").$wrapper.html(svg);
			d.show();
		});
	},

	render_cutting_plan(frm) {
		const wrapper = frm.get_field("cutting_plan").$wrapper.empty();
		if (frm.is_new() || !(frm.doc.sheet_layouts || []).length) {
			wrapper.html(
				`<p class="text-muted small">${__("Parts with a sheet-based material are nested here after saving.")}</p>`
			);
			return;
		}
		frappe.xcall("frappe_3d_designer.api.get_cutting_plan", { name: frm.doc.name }).then((plans) => {
			wrapper.empty();
			plans.forEach((plan) => {
				$(`<div style="margin-bottom:16px"><div class="small" style="font-weight:600;margin-bottom:6px"></div></div>`)
					.appendTo(wrapper)
					.find("div")
					.text(plan.title)
					.after(plan.svg);
			});
		});
	},

	render_preview(frm) {
		const wrapper = frm.get_field("preview").$wrapper;
		if (frm.__f3d_viewer) {
			frm.__f3d_viewer.destroy();
			frm.__f3d_viewer = null;
		}
		wrapper.empty();
		if (!(frm.doc.parts || []).length) {
			wrapper.html(
				`<p class="text-muted small">${__("Add parts, upload a design file or open the 3D Designer to see a preview.")}</p>`
			);
			return;
		}
		const el = $(`<div class="f3d-viewer"></div>`).appendTo(wrapper)[0];
		Promise.all([
			frappe.require("designer_3d.bundle.js"),
			frappe.xcall("frappe_3d_designer.api.get_materials"),
		]).then(([, materials]) => {
			frm.__f3d_viewer = new frappe_3d_designer.Viewer(el, frm.doc.parts, materials);
		});
	},
});

frappe.ui.form.on("Design Part", {
	parts_remove(frm) {
		frm.trigger("render_preview");
		frm.trigger("render_cutting_plan");
	},

	show_drawing(frm) {
		frappe.xcall("frappe_3d_designer.api.get_drawing", { name: frm.doc.name }).then((svg) => {
			const d = new frappe.ui.Dialog({
				title: __("Technical drawing"),
				size: "extra-large",
				fields: [{ fieldname: "svg", fieldtype: "HTML" }],
				primary_action_label: __("Print"),
				primary_action: () => {
					const q = new URLSearchParams({
						doctype: frm.doctype,
						name: frm.doc.name,
						format: "Design Technical Drawing",
						no_letterhead: 1,
					});
					window.open(`/printview?${q}`, "_blank");
				},
			});
			d.get_field("svg").$wrapper.html(svg);
			d.show();
		});
	},

	render_cutting_plan(frm) {
		const wrapper = frm.get_field("cutting_plan").$wrapper.empty();
		if (frm.is_new() || !(frm.doc.sheet_layouts || []).length) {
			wrapper.html(
				`<p class="text-muted small">${__("Parts with a sheet-based material are nested here after saving.")}</p>`
			);
			return;
		}
		frappe.xcall("frappe_3d_designer.api.get_cutting_plan", { name: frm.doc.name }).then((plans) => {
			wrapper.empty();
			plans.forEach((plan) => {
				$(`<div style="margin-bottom:16px"><div class="small" style="font-weight:600;margin-bottom:6px"></div></div>`)
					.appendTo(wrapper)
					.find("div")
					.text(plan.title)
					.after(plan.svg);
			});
		});
	},
});
