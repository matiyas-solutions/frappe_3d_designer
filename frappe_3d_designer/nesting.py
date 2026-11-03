"""Saw optimisation: MaxRects (best short side fit) nesting of rectangular parts on sheets.

Kerf is added to every part, trim is removed from every sheet edge. Parts with a grain
direction on a grained material keep their direction (sheet grain runs along sheet length).
"""

import json

from frappe import _
from frappe.utils import flt

from frappe_3d_designer.geometry import get, is_board, qty

EPS = 1e-6


def _contains(outer, inner) -> bool:
	ox, oy, ow, oh = outer
	ix, iy, iw, ih = inner
	return ix >= ox - EPS and iy >= oy - EPS and ix + iw <= ox + ow + EPS and iy + ih <= oy + oh + EPS


def _intersects(a, b) -> bool:
	ax, ay, aw, ah = a
	bx, by, bw, bh = b
	return not (bx >= ax + aw - EPS or bx + bw <= ax + EPS or by >= ay + ah - EPS or by + bh <= ay + EPS)


class MaxRects:
	def __init__(self, width: float, height: float):
		self.free = [(0.0, 0.0, width, height)]

	def find(self, w: float, h: float, rotations) -> tuple | None:
		best = None
		for fx, fy, fw, fh in self.free:
			for rotated in rotations:
				rw, rh = (h, w) if rotated else (w, h)
				if rw <= fw + EPS and rh <= fh + EPS:
					leftover = sorted((fw - rw, fh - rh))
					candidate = (leftover[0], leftover[1], fx, fy, rw, rh, rotated)
					if best is None or candidate[:2] < best[:2]:
						best = candidate
		return best

	def place(self, x: float, y: float, w: float, h: float):
		used = (x, y, w, h)
		free = []
		for f in self.free:
			if not _intersects(f, used):
				free.append(f)
				continue
			fx, fy, fw, fh = f
			if x > fx:
				free.append((fx, fy, x - fx, fh))
			if x + w < fx + fw:
				free.append((x + w, fy, fx + fw - x - w, fh))
			if y > fy:
				free.append((fx, fy, fw, y - fy))
			if y + h < fy + fh:
				free.append((fx, y + h, fw, fy + fh - y - h))
		free = [r for r in free if r[2] > EPS and r[3] > EPS]
		keep = []
		for i, a in enumerate(free):
			if not any(
				j != i and _contains(b, a) and (not _contains(a, b) or j < i) for j, b in enumerate(free)
			):
				keep.append(a)
		self.free = keep


def nest_pieces(pieces: list[dict], sheet_l: float, sheet_w: float, kerf: float, trim: float, has_grain: bool):
	"""pieces: [{key, label, part_name, part_idx, L, W, grain}] -> (sheets, errors)"""
	usable_l = sheet_l - 2 * trim + kerf
	usable_w = sheet_w - 2 * trim + kerf
	sheets, errors = [], []

	def rotations(piece):
		if has_grain and piece.get("grain") == "Along Length":
			return (False,)
		if has_grain and piece.get("grain") == "Along Width":
			return (True,)
		return (False, True)

	order = sorted(pieces, key=lambda p: (p["L"] * p["W"], max(p["L"], p["W"])), reverse=True)
	for piece in order:
		w, h = piece["L"] + kerf, piece["W"] + kerf
		rots = rotations(piece)
		placed = False
		for sheet in sheets:
			hit = sheet["packer"].find(w, h, rots)
			if hit:
				_put(sheet, piece, hit, trim, kerf)
				placed = True
				break
		if placed:
			continue
		sheet = {"packer": MaxRects(usable_l, usable_w), "placements": []}
		hit = sheet["packer"].find(w, h, rots)
		if not hit:
			errors.append(
				_("Part #{0} {1} ({2} × {3} mm) does not fit on a {4} × {5} mm sheet.").format(
					piece["part_idx"], piece["part_name"], piece["L"], piece["W"], sheet_l, sheet_w
				)
			)
			continue
		sheets.append(sheet)
		_put(sheet, piece, hit, trim, kerf)

	result = []
	for no, sheet in enumerate(sheets, start=1):
		area = sum(p["w"] * p["h"] for p in sheet["placements"])
		result.append(
			{
				"sheet_no": no,
				"placements": sheet["placements"],
				"utilisation": round(area / (sheet_l * sheet_w) * 100, 1),
			}
		)
	return result, errors


def _put(sheet, piece, hit, trim, kerf):
	_, _, fx, fy, rw, rh, rotated = hit
	sheet["packer"].place(fx, fy, rw, rh)
	sheet["placements"].append(
		{
			"label": piece["label"],
			"part_idx": piece["part_idx"],
			"part_name": piece["part_name"],
			"x": round(trim + fx, 1),
			"y": round(trim + fy, 1),
			"w": round(rw - kerf, 1),
			"h": round(rh - kerf, 1),
			"rotated": rotated,
			"grain": piece.get("grain"),
		}
	)


def nest_design(parts, material_docs: dict) -> tuple[list[dict], dict[int, list[str]], list[str]]:
	"""Nest every part whose material uses the Sheet basis.
	Returns (layout rows for Design Sheet Layout, part_idx -> sheet labels, errors)."""
	by_material: dict[str, list[dict]] = {}
	for p in parts:
		material = get(p, "material")
		if not is_board(p) or not material or material not in material_docs:
			continue
		for n in range(qty(p)):
			by_material.setdefault(material, []).append(
				{
					"part_idx": get(p, "idx"),
					"part_name": get(p, "part_name"),
					"label": f"{get(p, 'idx')}" + (f".{n + 1}" if qty(p) > 1 else ""),
					"L": flt(get(p, "length_mm")),
					"W": flt(get(p, "width_mm")),
					"grain": get(p, "grain"),
				}
			)

	rows, part_sheets, errors = [], {}, []
	for material, pieces in by_material.items():
		m = material_docs[material]
		sheet_l, sheet_w = flt(m.sheet_length_mm) or 2440, flt(m.sheet_width_mm) or 1220
		sheets, errs = nest_pieces(
			pieces, sheet_l, sheet_w, flt(m.kerf_mm), flt(m.trim_mm), bool(m.has_grain)
		)
		errors += errs
		for sheet in sheets:
			for pl in sheet["placements"]:
				part_sheets.setdefault(pl["part_idx"], []).append(f"{material[:12]}-{sheet['sheet_no']}")
			rows.append(
				{
					"material": material,
					"sheet_no": sheet["sheet_no"],
					"sheet_size": f"{sheet_l:g} × {sheet_w:g}",
					"parts_count": len(sheet["placements"]),
					"utilisation_percent": sheet["utilisation"],
					"layout_json": json.dumps(
						{
							"sheet_l": sheet_l,
							"sheet_w": sheet_w,
							"has_grain": bool(m.has_grain),
							"placements": sheet["placements"],
						}
					),
				}
			)
	return rows, part_sheets, errors
