import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class DesignMaterialMap(Document):
	def validate(self):
		if flt(self.wastage_percent) < 0:
			frappe.throw(_("Wastage % cannot be negative."))
		aliases = []
		for line in (self.aliases or "").splitlines():
			line = line.strip()
			if line and line.lower() not in (a.lower() for a in aliases):
				aliases.append(line)
		self.aliases = "\n".join(aliases)
		if self.calculation_basis in ("Area", "Volume", "Length"):
			uom = frappe.db.get_value("Item", self.item_code, "stock_uom")
			if uom and uom.lower() in ("nos", "unit", "pcs"):
				frappe.msgprint(
					_("{0} is stocked in {1}, but quantities will be calculated by {2}. Check the item's stock UOM.").format(
						self.item_code, uom, self.calculation_basis
					),
					indicator="orange",
				)
