"""Workshop: automatic construction methods.

Two boards form a joint when the end (edge) of one touches the face of the other
(butt joint). For each joint the connection rule decides:
- connector count along the joint (spacing, minimum, offset from the ends)
- boreholes: face hole in the face part, edge hole in the edge part
- or a groove in the face part (Groove rules, e.g. inset back panels)
- hardware items and operation minutes for the BOM
"""

import math

import frappe
from frappe.utils import cint, flt

from frappe_3d_designer.geometry import face_coords, face_name, get, is_board, part_axes, part_box, qty

MAX_PENETRATION_MM = 12  # inset panels may sit inside a groove


def _rule(name, cache):
	if not name:
		return None
	if name not in cache:
		cache[name] = frappe.get_cached_doc("Design Connection Rule", name)
	return cache[name]


def find_contact(a, box_a, b, box_b, tol: float):
	amin, amax = box_a
	bmin, bmax = box_b
	thin = min(flt(get(a, "thickness_mm")), flt(get(b, "thickness_mm")))
	allowed_overlap = MAX_PENETRATION_MM if thin <= MAX_PENETRATION_MM else tol

	for k in range(3):
		gap_ab = bmin[k] - amax[k]  # b sits on the + side of a
		gap_ba = amin[k] - bmax[k]  # b sits on the - side of a
		if -allowed_overlap - tol <= gap_ab <= tol:
			b_on_plus = True
		elif -allowed_overlap - tol <= gap_ba <= tol:
			b_on_plus = False
		else:
			continue

		others = [o for o in range(3) if o != k]
		overlaps = {o: min(amax[o], bmax[o]) - max(amin[o], bmin[o]) for o in others}
		if any(v <= tol for v in overlaps.values()):
			continue

		ta, tb = part_axes(a)["T"], part_axes(b)["T"]
		if ta == k and tb != k:
			face, edge, face_box, edge_box, edge_on_plus = a, b, box_a, box_b, b_on_plus
		elif tb == k and ta != k:
			face, edge, face_box, edge_box, edge_on_plus = b, a, box_b, box_a, not b_on_plus
		else:
			continue  # face-to-face or edge-to-edge: not a butt joint

		edge_t = part_axes(edge)["T"]
		run_axis = next(o for o in others if o != edge_t)
		# the contact plane is the surface of the face part
		plane = face_box[1][k] if edge_on_plus else face_box[0][k]
		return {
			"face": face,
			"edge": edge,
			"face_box": face_box,
			"edge_box": edge_box,
			"axis": k,
			"plane": plane,
			"edge_on_plus": edge_on_plus,
			"run_axis": run_axis,
			"run": (max(amin[run_axis], bmin[run_axis]), min(amax[run_axis], bmax[run_axis])),
			"edge_t_axis": edge_t,
			"edge_centre": (edge_box[0][edge_t] + edge_box[1][edge_t]) / 2,
		}
	return None


def connector_positions(lo: float, hi: float, rule) -> list[float]:
	length = hi - lo
	if length <= 0:
		return []
	offset = min(flt(rule.edge_offset_mm) or 50, length / 4)
	usable = length - 2 * offset
	spacing = flt(rule.spacing_mm) or 160
	minimum = max(cint(rule.min_per_joint) or 2, 1)
	count = max(minimum, 1 + math.ceil(usable / spacing - 1e-9)) if usable > 0 else 1
	if count == 1:
		return [lo + length / 2]
	step = usable / (count - 1)
	return [round(lo + offset + step * i, 1) for i in range(count)]


def build_workshop(parts, settings) -> dict:
	"""Return joints, holes and grooves for the given part rows."""
	tol = flt(settings.joint_tolerance_mm) or 1.0
	thin_limit = flt(settings.thin_panel_max_mm) or 8.0
	cache = {}
	boards = [p for p in parts if is_board(p)]
	boxes = {get(p, "idx"): part_box(p) for p in boards}

	joints, holes, grooves = [], [], []
	for i, a in enumerate(boards):
		for b in boards[i + 1 :]:
			c = find_contact(a, boxes[get(a, "idx")], b, boxes[get(b, "idx")], tol)
			if not c:
				continue
			face, edge = c["face"], c["edge"]
			thin = min(flt(get(face, "thickness_mm")), flt(get(edge, "thickness_mm"))) <= thin_limit
			rule_name = (settings.thin_panel_rule if thin else None) or settings.default_connection_rule
			rule = _rule(rule_name, cache)
			lo, hi = c["run"]
			multiplicity = min(qty(face), qty(edge))

			positions = []
			if rule and rule.connection_type not in ("Groove", "Miter"):
				positions = connector_positions(lo, hi, rule)

			joints.append(
				{
					"part_a_idx": get(face, "idx"),
					"part_a": get(face, "part_name"),
					"part_b_idx": get(edge, "idx"),
					"part_b": get(edge, "part_name"),
					"connection_rule": rule_name,
					"joint_length_mm": round(hi - lo, 1),
					"connector_count": len(positions) * multiplicity if rule else 0,
					"auto": 1,
				}
			)
			if not rule:
				continue

			k = c["axis"]
			face_surface_at_min = not c["edge_on_plus"]
			edge_surface_at_min = c["edge_on_plus"]
			face_side = face_name(face, k, face_surface_at_min)
			edge_side = face_name(edge, k, edge_surface_at_min)

			if rule.connection_type == "Groove":
				if flt(get(face, "thickness_mm")) <= thin_limit:
					continue  # overlaid thin panel: nothing to groove, joint stays without connectors
				start = [0.0, 0.0, 0.0]
				start[k] = c["plane"]
				start[c["run_axis"]] = lo
				start[c["edge_t_axis"]] = c["edge_centre"]
				x, y = face_coords(face, c["face_box"], start, face_side)
				along = "Along Length" if c["run_axis"] == part_axes(face)["L"] else "Along Width"
				grooves.append(
					{
						"part_idx": get(face, "idx"),
						"part_name": get(face, "part_name"),
						"operation_type": "Groove",
						"face": face_side,
						"direction": along,
						"x_mm": x,
						"y_mm": y,
						"length_mm": round(hi - lo, 1),
						"width_mm": round(flt(get(edge, "thickness_mm")) + 0.5, 1),
						"depth_mm": flt(rule.groove_depth_mm) or 8,
						"auto": 1,
					}
				)
				continue

			into_face = 1 if face_surface_at_min else -1
			into_edge = 1 if edge_surface_at_min else -1
			for pos in positions:
				point = [0.0, 0.0, 0.0]
				point[k] = c["plane"]
				point[c["run_axis"]] = pos
				point[c["edge_t_axis"]] = c["edge_centre"]
				for part, box, side, dia, depth, into in (
					(face, c["face_box"], face_side, rule.face_diameter_mm, rule.face_depth_mm, into_face),
					(edge, c["edge_box"], edge_side, rule.edge_diameter_mm, rule.edge_depth_mm, into_edge),
				):
					x, y = face_coords(part, box, point, side)
					holes.append(
						{
							"part_idx": get(part, "idx"),
							"face": side,
							"x": x,
							"y": y,
							"diameter": flt(dia) or 8,
							"depth": flt(depth) or 12,
							"world": [round(v, 1) for v in point],
							"axis": k,
							"into": into,
							"rule": rule_name,
						}
					)
	return {"joints": joints, "holes": holes, "grooves": grooves}


def manual_holes(doc) -> list[dict]:
	"""Drill rows the user added in the Machining table."""
	out = []
	for m in doc.machining or []:
		if m.operation_type == "Drill" and not cint(m.auto):
			out.append(
				{
					"part_idx": cint(m.part_idx),
					"face": m.face,
					"x": flt(m.x_mm),
					"y": flt(m.y_mm),
					"diameter": flt(m.diameter_mm) or 5,
					"depth": flt(m.depth_mm) or 10,
					"rule": None,
				}
			)
	return out


def connector_requirements(doc) -> tuple[dict[str, float], dict[tuple, float]]:
	"""Hardware items and operation minutes from the Joints table."""
	items: dict[str, float] = {}
	ops: dict[tuple, float] = {}
	cache = {}
	for j in doc.joints or []:
		rule = _rule(j.connection_rule, cache)
		count = cint(j.connector_count)
		if not rule or not count:
			continue
		for row in rule.get("items") or []:
			items[row.item_code] = items.get(row.item_code, 0.0) + count * (flt(row.qty_per_connector) or 1)
		if rule.operation and rule.workstation and flt(rule.mins_per_connector):
			key = (rule.operation, rule.workstation)
			ops[key] = ops.get(key, 0.0) + count * flt(rule.mins_per_connector)
	return items, ops
