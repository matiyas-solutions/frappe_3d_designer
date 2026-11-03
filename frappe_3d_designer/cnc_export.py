"""CNC / saw data interface.

The export is a zip attached to the Design Project:
  cutlist.csv          saw / panel optimiser import (one row per part)
  program.json         neutral machining program: holes, grooves, routing per part and face
  dxf/<label>.dxf      one DXF (R12, ENTITIES only) per part, millimetres, layers encode machining:
                         OUTLINE                         part contour (L along X, W along Y)
                         DRILL_<FACE>_D<dia>_Z<depth>    holes; face = TOP, BOTTOM, LEFT_EDGE ...
                         GROOVE_W<width>_Z<depth>        grooves
                         ROUTE_Z<depth> / POCKET_Z<depth> / PROFILE_<tool>
  sheets/*.svg         cutting diagrams
  drawing.svg          technical drawing
Most CAM postprocessors (woodWOP, Alphacam, BiesseWorks, Maestro, KDT etc.) can map DXF layers to
operations. Map the layer names once in your CAM software.
"""

import csv
import io
import json
import zipfile

import frappe
from frappe import _
from frappe.utils import cint, flt

from frappe_3d_designer.drawings import cutting_plan_svgs, technical_drawing_svg
from frappe_3d_designer.geometry import is_board
from frappe_3d_designer.workshop import build_workshop, manual_holes


def _fmt(v) -> str:
	return f"{flt(v):g}"


def _layer(text: str) -> str:
	return "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in text.upper())[:60]


class DXF:
	def __init__(self):
		self.out = ["0", "SECTION", "2", "ENTITIES"]

	def line(self, layer, x1, y1, x2, y2):
		self.out += ["0", "LINE", "8", layer, "10", _fmt(x1), "20", _fmt(y1), "30", "0",
			"11", _fmt(x2), "21", _fmt(y2), "31", "0"]

	def rect(self, layer, x, y, w, h):
		pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
		for (a, b), (c, d) in zip(pts, pts[1:]):
			self.line(layer, a, b, c, d)

	def circle(self, layer, x, y, r):
		self.out += ["0", "CIRCLE", "8", layer, "10", _fmt(x), "20", _fmt(y), "30", "0", "40", _fmt(r)]

	def text(self, layer, x, y, h, value):
		self.out += ["0", "TEXT", "8", layer, "10", _fmt(x), "20", _fmt(y), "30", "0", "40", _fmt(h), "1", value]

	def render(self) -> str:
		return "\n".join(self.out + ["0", "ENDSEC", "0", "EOF"]) + "\n"


def build_program(doc) -> list[dict]:
	settings = frappe.get_cached_doc("Designer Settings")
	ws = build_workshop(doc.parts, settings)
	holes = ws["holes"] + manual_holes(doc)
	program = []
	for p in doc.parts:
		if not is_board(p):
			continue
		program.append(
			{
				"label": p.label_id,
				"part_no": p.idx,
				"part_name": p.part_name,
				"material": p.material or p.source_material,
				"length": flt(p.length_mm),
				"width": flt(p.width_mm),
				"thickness": flt(p.thickness_mm),
				"qty": max(cint(p.qty), 1),
				"grain": p.grain or "",
				"edge_band_long": cint(p.edge_band_long),
				"edge_band_short": cint(p.edge_band_short),
				"sheets": p.sheet_no or "",
				"holes": [
					{k: h[k] for k in ("face", "x", "y", "diameter", "depth")}
					for h in holes
					if h["part_idx"] == p.idx
				],
				"machining": [
					{
						"type": m.operation_type,
						"face": m.face,
						"direction": m.direction,
						"x": flt(m.x_mm),
						"y": flt(m.y_mm),
						"length": flt(m.length_mm),
						"width": flt(m.width_mm),
						"depth": flt(m.depth_mm),
						"diameter": flt(m.diameter_mm),
						"tool": m.tool or "",
					}
					for m in doc.machining or []
					if cint(m.part_idx) == p.idx and m.operation_type != "Drill"
				],
			}
		)
	return program


def part_dxf(part: dict) -> str:
	dxf = DXF()
	L, W, T = part["length"], part["width"], part["thickness"]
	dxf.rect("OUTLINE", 0, 0, L, W)
	dxf.text("INFO", 0, -12, 6, f"{part['label']} {part['part_name']} {L:g}x{W:g}x{T:g}")
	for h in part["holes"]:
		dxf.circle(_layer(f"DRILL_{h['face']}_D{h['diameter']:g}_Z{h['depth']:g}"), h["x"], h["y"], h["diameter"] / 2)
	for m in part["machining"]:
		if m["type"] == "Groove":
			along_length = m["direction"] == "Along Length"
			w = m["width"] or 4
			gw, gh = (m["length"], w) if along_length else (w, m["length"])
			dxf.rect(_layer(f"GROOVE_{m['face']}_W{w:g}_Z{m['depth']:g}"), m["x"] - (0 if along_length else w / 2),
				m["y"] - (w / 2 if along_length else 0), gw, gh)
		elif m["type"] in ("Route", "Pocket"):
			dxf.rect(_layer(f"{m['type']}_{m['face']}_Z{m['depth']:g}"), m["x"], m["y"], m["length"] or 1, m["width"] or 1)
		elif m["type"] == "Edge Profile":
			dxf.line(_layer(f"PROFILE_{m['face']}_{m['tool'] or 'TOOL'}"), m["x"], m["y"], m["x"] + (m["length"] or L), m["y"])
		elif m["type"] == "Miter":
			dxf.line(_layer(f"MITER_{m['face']}"), m["x"], m["y"], m["x"] + (m["length"] or L), m["y"])
	return dxf.render()


def export_cnc(doc) -> str:
	program = build_program(doc)
	if not program:
		frappe.throw(_("No board parts to export."))

	buffer = io.BytesIO()
	with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
		csv_buffer = io.StringIO()
		writer = csv.writer(csv_buffer)
		writer.writerow(["Label", "Part", "Material", "Length", "Width", "Thickness", "Qty", "Grain",
			"Edge Long", "Edge Short", "Holes", "Sheets"])
		for p in program:
			writer.writerow([p["label"], p["part_name"], p["material"], p["length"], p["width"], p["thickness"],
				p["qty"], p["grain"], p["edge_band_long"], p["edge_band_short"], len(p["holes"]), p["sheets"]])
			z.writestr(f"dxf/{_layer(p['label'])}.dxf", part_dxf(p))
		z.writestr("cutlist.csv", csv_buffer.getvalue())
		z.writestr("program.json", json.dumps({"design": doc.name, "units": "mm", "parts": program}, indent=1))
		z.writestr("drawing.svg", technical_drawing_svg(doc))
		for i, plan in enumerate(cutting_plan_svgs(doc), start=1):
			z.writestr(f"sheets/sheet-{i:02d}.svg", plan["svg"])

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": f"{doc.name}-cnc.zip",
			"attached_to_doctype": "Design Project",
			"attached_to_name": doc.name,
			"is_private": 1,
			"content": buffer.getvalue(),
		}
	).insert(ignore_permissions=True)
	doc.db_set("cnc_export_file", file_doc.file_url)
	return file_doc.file_url
