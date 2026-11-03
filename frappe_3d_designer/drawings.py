"""SVG output generated from the model, so drawings always match the current design (associative).

technical_drawing_svg: front, right side and top views, horizontal section A-A, overall
dimensions, part balloons and a title block.
cutting_plan_svgs: one diagram per nested sheet.
"""

import json
from html import escape

import frappe
from frappe import _
from frappe.utils import flt, formatdate, nowdate

from frappe_3d_designer.geometry import get, part_box

INK = "#1d2420"
FILL = "#ffffff"
CUT_FILL = "url(#hatch)"
DIM = "#3b6e5f"
GRAIN = "#9b6b43"
FONT = "font-family:Inter,Helvetica,Arial,sans-serif"

# view definitions: horizontal axis, vertical axis (sign), depth axis, nearer = larger depth?
VIEWS = {
	"front": {"h": (0, 1), "v": (1, -1), "depth": 2, "near_high": True},
	"right": {"h": (2, -1), "v": (1, -1), "depth": 0, "near_high": True},
	"top": {"h": (0, 1), "v": (2, 1), "depth": 1, "near_high": True},
}


def _boxes(parts):
	return [(p, *part_box(p)) for p in parts]


def _project(boxes, view, scale, origin):
	"""Return rect tuples (x, y, w, h, part, depth) in SVG units, painter-sorted."""
	ha, hs = view["h"]
	va, vs = view["v"]
	d = view["depth"]
	rects = []
	for p, mn, mx in boxes:
		h0, h1 = sorted((mn[ha] * hs, mx[ha] * hs))
		v0, v1 = sorted((mn[va] * vs, mx[va] * vs))
		depth = mx[d] if view["near_high"] else -mn[d]
		rects.append(
			(
				origin[0] + h0 * scale,
				origin[1] + v0 * scale,
				(h1 - h0) * scale,
				(v1 - v0) * scale,
				p,
				depth,
			)
		)
	rects.sort(key=lambda r: r[5])
	return rects


def _extent(boxes, axis_sign):
	axis, sign = axis_sign
	values = [v * sign for _, mn, mx in boxes for v in (mn[axis], mx[axis])]
	return min(values), max(values)


def _dim_h(x1, x2, y, text, off=18):
	yy = y + off
	return (
		f'<g stroke="{DIM}" stroke-width="0.6" fill="none">'
		f'<line x1="{x1:.1f}" y1="{y + 3:.1f}" x2="{x1:.1f}" y2="{yy + 4:.1f}"/>'
		f'<line x1="{x2:.1f}" y1="{y + 3:.1f}" x2="{x2:.1f}" y2="{yy + 4:.1f}"/>'
		f'<line x1="{x1:.1f}" y1="{yy:.1f}" x2="{x2:.1f}" y2="{yy:.1f}" marker-start="url(#arr)" marker-end="url(#arr)"/></g>'
		f'<text x="{(x1 + x2) / 2:.1f}" y="{yy - 4:.1f}" font-size="10" text-anchor="middle" fill="{DIM}" style="{FONT}">{escape(text)}</text>'
	)


def _dim_v(y1, y2, x, text, off=18):
	xx = x - off
	return (
		f'<g stroke="{DIM}" stroke-width="0.6" fill="none">'
		f'<line x1="{x - 3:.1f}" y1="{y1:.1f}" x2="{xx - 4:.1f}" y2="{y1:.1f}"/>'
		f'<line x1="{x - 3:.1f}" y1="{y2:.1f}" x2="{xx - 4:.1f}" y2="{y2:.1f}"/>'
		f'<line x1="{xx:.1f}" y1="{y1:.1f}" x2="{xx:.1f}" y2="{y2:.1f}" marker-start="url(#arr)" marker-end="url(#arr)"/></g>'
		f'<text x="{xx - 5:.1f}" y="{(y1 + y2) / 2:.1f}" font-size="10" text-anchor="middle" fill="{DIM}" style="{FONT}" '
		f'transform="rotate(-90 {xx - 5:.1f} {(y1 + y2) / 2:.1f})">{escape(text)}</text>'
	)


def _defs():
	return (
		"<defs>"
		f'<marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
		f'<path d="M0,2 L10,5 L0,8 z" fill="{DIM}"/></marker>'
		f'<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
		f'<rect width="6" height="6" fill="#efe6da"/><line x1="0" y1="0" x2="0" y2="6" stroke="{GRAIN}" stroke-width="1"/></pattern>'
		"</defs>"
	)


def _rects_svg(rects, fill=FILL):
	out = []
	for x, y, w, h, p, _ in rects:
		dash = ' stroke-dasharray="3 2"' if get(p, "item_code") and not get(p, "material") else ""
		out.append(
			f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(w, 0.5):.1f}" height="{max(h, 0.5):.1f}" '
			f'fill="{fill}" stroke="{INK}" stroke-width="0.8"{dash}/>'
		)
	return "".join(out)


def _balloons_svg(rects):
	"""Number only the parts whose visible centre is not covered by a nearer part."""
	out = []
	for i, (x, y, w, h, p, _) in enumerate(rects):
		cx, cy = x + w / 2, y + h * 0.35
		dx, dy = min(6, w / 2 - 0.5), min(6, h / 2 - 0.5)
		probes = [(cx, cy), (cx - dx, cy), (cx + dx, cy), (cx, cy - dy), (cx, cy + dy)]
		covered = any(
			ox < px < ox + ow and oy < py < oy + oh
			for px, py in probes
			for ox, oy, ow, oh, *_ in rects[i + 1 :]
		)
		if covered:
			continue
		out.append(
			f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="7" fill="#fff" stroke="{DIM}" stroke-width="0.7"/>'
			f'<text x="{cx:.1f}" y="{cy + 3:.1f}" font-size="8" text-anchor="middle" fill="{DIM}" style="{FONT}">{get(p, "idx")}</text>'
		)
	return "".join(out)


def technical_drawing_svg(doc) -> str:
	parts = list(doc.parts or [])
	if not parts:
		return f'<p>{_("No parts to draw.")}</p>'
	boxes = _boxes(parts)

	ext = {axis: _extent(boxes, (axis, 1)) for axis in range(3)}
	width = ext[0][1] - ext[0][0]
	height = ext[1][1] - ext[1][0]
	depth = ext[2][1] - ext[2][0]

	page_w, page_h, margin, gap = 1120.0, 760.0, 60.0, 70.0
	scale = min((page_w - 2 * margin - gap) / (width + depth), (page_h - 2 * margin - gap - 70) / (height + depth))
	scale = min(scale, 2.0)

	def origin(view, left, top):
		h_min, _ = _extent(boxes, view["h"])
		v_min, _ = _extent(boxes, view["v"])
		return (left - h_min * scale, top - v_min * scale)

	left1, top1 = margin, margin
	left2 = margin + width * scale + gap
	top2 = margin + height * scale + gap

	svg = [
		f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {page_w:.0f} {page_h:.0f}" width="100%" style="background:#fff">',
		_defs(),
	]
	labels = []

	# front
	front = _project(boxes, VIEWS["front"], scale, origin(VIEWS["front"], left1, top1))
	svg.append(_rects_svg(front))
	labels.append((left1, top1 - 14, _("Front view")))
	svg.append(_dim_h(left1, left1 + width * scale, top1 + height * scale, f"{width:.0f}"))
	svg.append(_dim_v(top1, top1 + height * scale, left1, f"{height:.0f}"))

	# right side
	right = _project(boxes, VIEWS["right"], scale, origin(VIEWS["right"], left2, top1))
	svg.append(_rects_svg(right))
	labels.append((left2, top1 - 14, _("Right view")))
	svg.append(_dim_h(left2, left2 + depth * scale, top1 + height * scale, f"{depth:.0f}"))

	# top
	top = _project(boxes, VIEWS["top"], scale, origin(VIEWS["top"], left1, top2))
	svg.append(_rects_svg(top))
	labels.append((left1, top2 - 14, _("Top view")))

	# section A-A (horizontal cut, seen from above)
	cut_h = flt(doc.get("section_height_mm")) or round(ext[1][0] + height * 0.6)
	cut = [b for b in boxes if b[1][1] < cut_h < b[2][1]]
	below = [b for b in boxes if b[2][1] <= cut_h]
	sec_origin = origin(VIEWS["top"], left2, top2)
	svg.append(_rects_svg(_project(below, VIEWS["top"], scale, sec_origin), fill="#f4f4f2"))
	svg.append(_rects_svg(_project(cut, VIEWS["top"], scale, sec_origin), fill=CUT_FILL))
	labels.append((left2, top2 - 14, _("Section A-A at {0} mm").format(f"{cut_h:.0f}")))

	# section line on the front view
	y_cut = origin(VIEWS["front"], left1, top1)[1] + (-cut_h) * scale
	svg.append(
		f'<line x1="{left1 - 12:.1f}" y1="{y_cut:.1f}" x2="{left1 + width * scale + 12:.1f}" y2="{y_cut:.1f}" '
		f'stroke="{DIM}" stroke-width="0.8" stroke-dasharray="10 3 2 3"/>'
		f'<text x="{left1 + width * scale + 16:.1f}" y="{y_cut + 4:.1f}" font-size="11" fill="{DIM}" style="{FONT}">A</text>'
	)

	svg.append(_balloons_svg(front))

	for x, y, text in labels:
		svg.append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="12" font-weight="600" fill="{INK}" style="{FONT}">{escape(text)}</text>')

	# title block
	tb_w, tb_h = 330, 62
	tx, ty = page_w - tb_w - 16, page_h - tb_h - 16
	scale_ratio = f"1:{round(1 / scale)}" if scale < 1 else f"{scale:.1f}:1"
	svg.append(
		f'<g style="{FONT}" fill="{INK}"><rect x="{tx}" y="{ty}" width="{tb_w}" height="{tb_h}" fill="#fff" stroke="{INK}" stroke-width="1"/>'
		f'<text x="{tx + 10}" y="{ty + 20}" font-size="13" font-weight="600">{escape(doc.design_name or doc.name)}</text>'
		f'<text x="{tx + 10}" y="{ty + 38}" font-size="10">{escape(doc.name)}   {_("Scale")} {scale_ratio}   {_("mm")}</text>'
		f'<text x="{tx + 10}" y="{ty + 53}" font-size="10">{formatdate(nowdate())}   {escape(doc.customer or "")}</text></g>'
	)
	svg.append("</svg>")
	return "".join(svg)


def cutting_plan_svgs(doc) -> list[dict]:
	out = []
	for row in doc.sheet_layouts or []:
		data = json.loads(row.layout_json or "{}")
		if not data:
			continue
		sl, sw = flt(data["sheet_l"]), flt(data["sheet_w"])
		w = 900.0
		s = w / sl
		h = sw * s
		svg = [
			f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 {w + 8:.0f} {h + 8:.0f}" width="100%">',
			f'<rect x="0" y="0" width="{w:.1f}" height="{h:.1f}" fill="#efe6da" stroke="{INK}" stroke-width="1"/>',
		]
		if data.get("has_grain"):
			for gy in range(12, int(h), 14):
				svg.append(f'<line x1="0" y1="{gy}" x2="{w:.1f}" y2="{gy}" stroke="{GRAIN}" stroke-opacity=".18" stroke-width="1"/>')
		for p in data["placements"]:
			x, y, pw, ph = p["x"] * s, p["y"] * s, p["w"] * s, p["h"] * s
			svg.append(
				f'<rect x="{x:.1f}" y="{y:.1f}" width="{pw:.1f}" height="{ph:.1f}" fill="#fff" stroke="{INK}" stroke-width="0.8"/>'
			)
			if pw > 34 and ph > 20:
				dims = f"{p['h']:g} × {p['w']:g}" if p["rotated"] else f"{p['w']:g} × {p['h']:g}"
				svg.append(
					f'<text x="{x + pw / 2:.1f}" y="{y + ph / 2 - 2:.1f}" font-size="11" font-weight="600" text-anchor="middle" fill="{INK}" style="{FONT}">#{escape(str(p["label"]))}</text>'
					f'<text x="{x + pw / 2:.1f}" y="{y + ph / 2 + 11:.1f}" font-size="9" text-anchor="middle" fill="{DIM}" style="{FONT}">{escape(dims)}{" ⟲" if p["rotated"] else ""}</text>'
				)
		svg.append("</svg>")
		out.append(
			{
				"title": _("{0}: sheet {1} of {2}, {3}% used").format(
					row.material,
					row.sheet_no,
					len([r for r in doc.sheet_layouts if r.material == row.material]),
					row.utilisation_percent,
				),
				"svg": "".join(svg),
			}
		)
	return out


# ------------------------------------------------------------------ jinja helpers for print formats
def design_technical_drawing(name: str) -> str:
	doc = frappe.get_doc("Design Project", name)
	doc.check_permission("read")
	return technical_drawing_svg(doc)


def design_cutting_plans(name: str) -> list[dict]:
	doc = frappe.get_doc("Design Project", name)
	doc.check_permission("read")
	return cutting_plan_svgs(doc)

