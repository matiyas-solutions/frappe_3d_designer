"""Part labels for the workshop (Label plotting). Used by the 'Design Part Labels' print format."""

import base64
import io

import frappe
from frappe.utils import cint, flt

from frappe_3d_designer.geometry import is_board


def design_part_qr(text: str) -> str:
	"""Inline QR code as <img>. Uses pyqrcode (ships with Frappe) or qrcode if available."""
	svg = None
	try:
		import pyqrcode

		buffer = io.BytesIO()
		pyqrcode.create(text).svg(buffer, scale=3, quiet_zone=1)
		svg = buffer.getvalue()
	except Exception:
		try:
			import qrcode
			import qrcode.image.svg

			buffer = io.BytesIO()
			qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage).save(buffer)
			svg = buffer.getvalue()
		except Exception:
			svg = None
	if not svg:
		return f'<div class="qr-fallback">{frappe.utils.escape_html(text)}</div>'
	data = base64.b64encode(svg).decode()
	return f'<img class="qr" src="data:image/svg+xml;base64,{data}" alt="{frappe.utils.escape_html(text)}">'


def edge_marks(part) -> str:
	long_edges, short_edges = cint(part.edge_band_long), cint(part.edge_band_short)
	if not long_edges and not short_edges:
		return ""
	return f"L{long_edges} / S{short_edges}"


def design_part_labels(name: str) -> list[dict]:
	doc = frappe.get_doc("Design Project", name)
	doc.check_permission("read")
	labels = []
	for p in doc.parts:
		if not is_board(p):
			continue
		sheets = (p.sheet_no or "").split(", ")
		count = max(cint(p.qty), 1)
		for n in range(count):
			label_id = p.label_id + (f".{n + 1}" if count > 1 else "")
			labels.append(
				{
					"label_id": label_id,
					"qr": design_part_qr(label_id),
					"part_no": p.idx,
					"part_name": p.part_name,
					"material": p.material or p.source_material or "",
					"size": f"{flt(p.length_mm):g} × {flt(p.width_mm):g} × {flt(p.thickness_mm):g}",
					"edges": edge_marks(p),
					"grain": {"Along Length": "↔", "Along Width": "↕"}.get(p.grain, ""),
					"sheet": sheets[n] if n < len(sheets) else (sheets[0] if sheets else ""),
					"design": doc.design_name,
					"customer": doc.customer or "",
					"copy": f"{n + 1}/{count}",
				}
			)
	return labels
