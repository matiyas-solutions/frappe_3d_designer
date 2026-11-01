import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt

from frappe_3d_designer.bom_builder import edge_length_m, enqueue_sync, parts_hash
from frappe_3d_designer.design_parser import clean_part, parse_design_file


class DesignProject(Document):
	def validate(self):
		if not self.company:
			self.company = frappe.db.get_single_value("Designer Settings", "default_company")
		if self.design_file and (self.is_new() or self.has_value_changed("design_file")):
			self.import_design_file()
		self.normalise_parts()
		self.set_totals()

	def on_update(self):
		if not cint(self.auto_create_bom) or not self.parts or self.status == "Cancelled":
			return
		if not self.bom or parts_hash(self) != self.design_hash:
			enqueue_sync(self.name)

	@frappe.whitelist()
	def reimport_design_file(self):
		self.check_permission("write")
		if not self.design_file:
			frappe.throw(_("Attach a design file first."))
		self.import_design_file()
		self.save()

	def import_design_file(self):
		file_format, parts = parse_design_file(self.design_file)
		self.file_format = file_format
		self.set("parts", [])
		for part in parts:
			self.append("parts", part)
		if self.status == "Draft":
			self.status = "In Design"
		frappe.msgprint(
			_("{0} parts read from the design file.").format(len(parts)), indicator="green", alert=True
		)

	def normalise_parts(self):
		for row in self.parts:
			cleaned = clean_part(row.as_dict())
			for key, value in cleaned.items():
				if key in ("material", "item_code", "source_material", "mesh_id"):
					continue
				row.set(key, value)
			if row.material and not row.thickness_mm:
				row.thickness_mm = flt(
					frappe.get_cached_value("Design Material Map", row.material, "default_thickness_mm")
				)
			row.area_sqm = 0 if row.item_code else flt(
				flt(row.length_mm) * flt(row.width_mm) / 1e6 * (cint(row.qty) or 1), 4
			)

	def set_totals(self):
		self.total_parts = sum(cint(p.qty) or 1 for p in self.parts)
		self.total_area_sqm = flt(sum(flt(p.area_sqm) for p in self.parts), 3)
		self.total_edge_m = flt(sum(edge_length_m(p) for p in self.parts if not p.item_code), 2)
