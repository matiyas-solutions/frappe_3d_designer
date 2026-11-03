"""Shared part geometry (mm, Y-up, same rules as the 3D designer).

Orientation decides which world axis carries Length / Width / Thickness:
    Horizontal     L->x  T->y  W->z
    Vertical Side  T->x  L->y  W->z
    Vertical Back  L->x  W->y  T->z
rot_y of 90 / 270 swaps the x and z axes. Rotations other than multiples of 90 are
treated as the nearest multiple.
Cylinders: Length = height (along y unless Horizontal), Width = diameter.
"""

from frappe.utils import cint, flt

ORIENTATION_AXES = {
	"Horizontal": {"L": 0, "T": 1, "W": 2},
	"Vertical Side": {"T": 0, "L": 1, "W": 2},
	"Vertical Back": {"L": 0, "W": 1, "T": 2},
}


def get(part, key, default=None):
	value = part.get(key) if hasattr(part, "get") else getattr(part, key, None)
	return default if value is None else value


def part_axes(part) -> dict[str, int]:
	axes = dict(ORIENTATION_AXES.get(get(part, "orientation"), ORIENTATION_AXES["Horizontal"]))
	if get(part, "shape") == "Cylinder":
		axes = {"L": 0, "W": 1, "T": 2} if get(part, "orientation") == "Horizontal" else {"L": 1, "W": 0, "T": 2}
	if round(flt(get(part, "rot_y")) / 90) % 2:
		swap = {0: 2, 2: 0, 1: 1}
		axes = {k: swap[v] for k, v in axes.items()}
	return axes


def part_size(part) -> list[float]:
	axes = part_axes(part)
	size = [0.0, 0.0, 0.0]
	length = max(flt(get(part, "length_mm")), 1)
	width = max(flt(get(part, "width_mm")), 1)
	thickness = max(flt(get(part, "thickness_mm")), 1)
	if get(part, "shape") == "Cylinder":
		thickness = width
	size[axes["L"]], size[axes["W"]], size[axes["T"]] = length, width, thickness
	return size


def part_box(part) -> tuple[list[float], list[float]]:
	size = part_size(part)
	centre = [flt(get(part, "pos_x")), flt(get(part, "pos_y")), flt(get(part, "pos_z"))]
	return [c - s / 2 for c, s in zip(centre, size)], [c + s / 2 for c, s in zip(centre, size)]


def is_board(part) -> bool:
	return not get(part, "item_code") and get(part, "shape", "Box") != "Cylinder"


def qty(part) -> int:
	return max(cint(get(part, "qty")) or 1, 1)


def face_name(part, axis: int, surface_at_min: bool) -> str:
	axes = part_axes(part)
	if axis == axes["T"]:
		return "Bottom" if surface_at_min else "Top"
	if axis == axes["L"]:
		return "Left Edge" if surface_at_min else "Right Edge"
	return "Back Edge" if surface_at_min else "Front Edge"


def face_coords(part, box, point, face: str) -> tuple[float, float]:
	"""2D coordinates of a world point on a part face, measured from the part's min corner.
	Top/Bottom: (L, W)   Left/Right Edge: (W, T)   Front/Back Edge: (L, T)"""
	axes = part_axes(part)
	mins = box[0]
	local = {k: point[a] - mins[a] for k, a in axes.items()}
	if face in ("Top", "Bottom"):
		return round(local["L"], 1), round(local["W"], 1)
	if face in ("Left Edge", "Right Edge"):
		return round(local["W"], 1), round(local["T"], 1)
	return round(local["L"], 1), round(local["T"], 1)
