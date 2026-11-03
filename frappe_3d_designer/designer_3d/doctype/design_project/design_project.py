import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt

from frappe_3d_designer.bom_builder import edge_length_m, enqueue_sync, parts_hash
from frappe_3d_designer.design_parser import clean_part, parse_design_file
from frappe_3d_designer.nesting import nest_design
from frappe_3d_designer.workshop import build_workshop


class DesignProject(Document):
	def validate(self):
		if not self.company:
			self.company = frappe.db.get_single_value("Designer Settings", "default_company")
		if self.design_file and (self.is_new() or self.has_value_changed("design_file")):
			self.import_design_file()
		self.normalise_parts()
		self.run_workshop()
		self.run_nesting()
		self.set_totals()

	def on_update(self):
		if not cint(self.auto_create_bom) or not self.parts or self.status == "Cancelled":
			return
		if not self.bom or parts_hash(self) != self.design_hash:
			enqueue_sync(self.name)

	# ------------------------------------------------------------ file import
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

	# ------------------------------------------------------------ parts
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
			row.label_id = f"{self.name}-{row.idx:03d}"  # name is set before validate, also on insert

	# ------------------------------------------------------------ workshop
	def run_workshop(self):
		names = {p.idx: p.part_name for p in self.parts}
		manual = [m for m in self.machining if not cint(m.auto)]
		for m in manual:
			m.part_name = names.get(cint(m.part_idx), _("Unknown part"))

		if not cint(self.auto_detect_joints):
			return
		settings = frappe.get_cached_doc("Designer Settings")
		ws = build_workshop(self.parts, settings)

		manual_joints = [j for j in self.joints if not cint(j.auto)]
		self.set("joints", [])
		for j in manual_joints:
			self.append("joints", j.as_dict(no_default_fields=True))
		for j in ws["joints"]:
			self.append("joints", j)

		self.set("machining", [])
		for m in manual:
			self.append("machining", m.as_dict(no_default_fields=True))
		for g in ws["grooves"]:
			self.append("machining", g)

	# ------------------------------------------------------------ nesting
	def run_nesting(self):
		sheet_materials = {}
		for material in {p.material for p in self.parts if p.material}:
			m = frappe.get_cached_doc("Design Material Map", material)
			if m.calculation_basis == "Sheet":
				sheet_materials[material] = m

		rows, part_sheets, errors = nest_design(self.parts, sheet_materials)
		self.set("sheet_layouts", [])
		for row in rows:
			self.append("sheet_layouts", row)
		for p in self.parts:
			p.sheet_no = ", ".join(part_sheets.get(p.idx, []))[:140]
		if errors:
			frappe.msgprint("<br>".join(errors), title=_("Cutting plan"), indicator="orange")

	def set_totals(self):
		self.total_parts = sum(cint(p.qty) or 1 for p in self.parts)
		self.total_area_sqm = flt(sum(flt(p.area_sqm) for p in self.parts), 3)
		self.total_edge_m = flt(sum(edge_length_m(p) for p in self.parts if not p.item_code), 2)
		self.total_connectors = sum(cint(j.connector_count) for j in self.joints)
		self.total_sheets = len(self.sheet_layouts)
		self.average_utilisation = (
			flt(sum(flt(r.utilisation_percent) for r in self.sheet_layouts) / len(self.sheet_layouts), 1)
			if self.sheet_layouts
			else 0
		)

