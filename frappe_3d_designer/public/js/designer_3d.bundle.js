import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/* ------------------------------------------------------------------ constants */

const WOOD_FALLBACKS = ["#C8A27A", "#E3CBA8", "#9B6B43", "#D9D4CB", "#6E4B32", "#B8B2A6"];
const HARDWARE_COLOR = "#8A8F98";
const UNMAPPED_COLOR = "#D9534F";
const SELECT_EMISSIVE = 0x7a5200;

const PART_FIELDS = [
	"part_name", "material", "item_code", "source_material", "orientation",
	"length_mm", "width_mm", "thickness_mm", "qty", "edge_band_long", "edge_band_short",
	"pos_x", "pos_y", "pos_z", "rot_y", "mesh_id",
];

const PRESETS = {
	side: { label: "Side panel", length_mm: 720, width_mm: 560, thickness_mm: 18, orientation: "Vertical Side", edge_band_long: 1 },
	top: { label: "Top / bottom", length_mm: 800, width_mm: 560, thickness_mm: 18, orientation: "Horizontal", edge_band_long: 1 },
	shelf: { label: "Shelf", length_mm: 764, width_mm: 540, thickness_mm: 18, orientation: "Horizontal", edge_band_long: 1 },
	back: { label: "Back panel", length_mm: 800, width_mm: 720, thickness_mm: 6, orientation: "Vertical Back" },
	door: { label: "Door", length_mm: 396, width_mm: 716, thickness_mm: 18, orientation: "Vertical Back", edge_band_long: 2, edge_band_short: 2 },
};

const STYLES = `
.f3d-designer{display:flex;height:calc(100vh - 170px);min-height:540px;border:1px solid var(--border-color);border-radius:var(--border-radius-lg,10px);overflow:hidden;background:var(--card-bg)}
.f3d-stage,.f3d-viewer{position:relative;background:radial-gradient(circle at 50% 35%,#4A7A69 0%,#2F5D50 75%)}
.f3d-stage{flex:1;min-width:0}
.f3d-viewer{height:380px;border-radius:var(--border-radius-md,8px);overflow:hidden}
.f3d-canvas{position:absolute;inset:0}
.f3d-canvas canvas{display:block;width:100%;height:100%;outline:none}
.f3d-tools{position:absolute;top:12px;left:12px;right:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;pointer-events:none}
.f3d-tools>*{pointer-events:auto}
.f3d-tool,.f3d-add{background:rgba(255,255,255,.93);color:#1F2A26;border:0;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:500;line-height:1.4;cursor:pointer;box-shadow:0 1px 0 rgba(0,0,0,.25)}
.f3d-add{padding-right:6px}
.f3d-tool:hover,.f3d-add:hover{background:#fff}
.f3d-tool:focus-visible,.f3d-add:focus-visible{outline:2px solid #F2B134;outline-offset:2px}
.f3d-tool[disabled]{opacity:.5;cursor:not-allowed}
.f3d-tool.is-on{background:#F2B134;color:#2B2118}
.f3d-gap{width:1px;height:20px;background:rgba(255,255,255,.35);margin:0 4px}
.f3d-explode{display:flex;align-items:center;gap:6px;color:#fff;font-size:12px}
.f3d-explode input{width:90px;accent-color:#F2B134}
.f3d-status{position:absolute;left:12px;right:12px;bottom:10px;display:flex;flex-wrap:wrap;gap:16px;color:rgba(255,255,255,.92);font-size:12px;font-variant-numeric:tabular-nums;pointer-events:none}
.f3d-status a{color:#F2B134;pointer-events:auto}
.f3d-panel{width:320px;flex-shrink:0;border-left:1px solid var(--border-color);overflow-y:auto;padding:14px 16px;background:var(--card-bg)}
.f3d-panel h5{font-size:13px;font-weight:600;margin:0 0 10px;color:var(--heading-color,var(--text-color))}
.f3d-panel .frappe-control{margin-bottom:8px}
.f3d-parts{list-style:none;padding:0;margin:0 0 16px}
.f3d-parts li{display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;cursor:pointer;font-size:12px}
.f3d-parts li:hover,.f3d-parts li:focus-visible{background:var(--control-bg);outline:none}
.f3d-swatch{width:14px;height:14px;border-radius:3px;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.f3d-dims{margin-left:auto;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.f3d-hint{color:var(--text-muted);font-size:12px;line-height:1.55;margin:0 0 12px}
.f3d-panel-actions{display:flex;gap:6px;margin:4px 0 12px}
@media (max-width:900px){.f3d-designer{flex-direction:column;height:auto}.f3d-stage{height:60vh}.f3d-panel{width:auto;border-left:0;border-top:1px solid var(--border-color)}}
`;

function ensureStyles() {
	if (document.getElementById("f3d-styles")) return;
	const style = document.createElement("style");
	style.id = "f3d-styles";
	style.textContent = STYLES;
	document.head.appendChild(style);
}

/* ------------------------------------------------------------------ helpers */

const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

function partSize(p) {
	const L = Math.max(num(p.length_mm), 1);
	const W = Math.max(num(p.width_mm), 1);
	const T = Math.max(num(p.thickness_mm), 1);
	if (p.orientation === "Vertical Side") return { x: T, y: L, z: W };
	if (p.orientation === "Vertical Back") return { x: L, y: W, z: T };
	return { x: L, y: T, z: W };
}

function hashColor(key) {
	let h = 0;
	for (const ch of String(key || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return WOOD_FALLBACKS[h % WOOD_FALLBACKS.length];
}

function normalisePart(p) {
	const out = {};
	PART_FIELDS.forEach((f) => (out[f] = p[f] ?? null));
	out.part_name = out.part_name || __("Part");
	out.orientation = out.orientation || "Horizontal";
	out.qty = Math.max(parseInt(out.qty) || 1, 1);
	["length_mm", "width_mm", "thickness_mm", "pos_x", "pos_y", "pos_z", "rot_y"].forEach((f) => (out[f] = num(out[f])));
	out.edge_band_long = parseInt(out.edge_band_long) || 0;
	out.edge_band_short = parseInt(out.edge_band_short) || 0;
	return out;
}

function download(blob, filename) {
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ scene core */

class SceneCore {
	constructor(container) {
		this.container = container;
		this.materials = {};
		this.parts = [];
		this.explode = 0;

		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		container.appendChild(this.renderer.domElement);

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(40, 1, 5, 60000);
		this.camera.position.set(1800, 1400, 2200);

		this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
		this.orbit.target.set(0, 360, 0);
		this.orbit.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2f5d50, 2.2));
		const sun = new THREE.DirectionalLight(0xffffff, 2.4);
		sun.position.set(2000, 4000, 3000);
		this.scene.add(sun);
		const fill = new THREE.DirectionalLight(0xffffff, 0.8);
		fill.position.set(-3000, 1500, -2000);
		this.scene.add(fill);

		// cutting-mat grid: 100 mm cells, 6 m wide
		const grid = new THREE.GridHelper(6000, 60, 0x9cc3b4, 0x5e8a7b);
		grid.material.transparent = true;
		grid.material.opacity = 0.55;
		this.scene.add(grid);

		this.group = new THREE.Group();
		this.scene.add(this.group);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();

		this.renderer.setAnimationLoop(() => {
			this.orbit.update();
			this.renderer.render(this.scene, this.camera);
		});
	}

	resize() {
		const w = this.container.clientWidth || 1;
		const h = this.container.clientHeight || 1;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h, false);
	}

	setMaterials(list) {
		this.materials = {};
		(list || []).forEach((m) => (this.materials[m.name] = m));
	}

	colorFor(p) {
		if (p.item_code && !p.material) return HARDWARE_COLOR;
		if (p.material && this.materials[p.material]?.color) return this.materials[p.material].color;
		if (!p.material && p.source_material) return UNMAPPED_COLOR;
		return hashColor(p.material || p.part_name);
	}

	buildMesh(p) {
		const s = partSize(p);
		const geometry = new THREE.BoxGeometry(s.x, s.y, s.z);
		const material = new THREE.MeshStandardMaterial({
			color: new THREE.Color(this.colorFor(p)),
			roughness: 0.72,
			metalness: p.item_code && !p.material ? 0.6 : 0,
		});
		material.name = p.material || p.source_material || p.item_code || "Unmapped";

		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = `${p.part_name}__${material.name}`;
		mesh.add(
			new THREE.LineSegments(
				new THREE.EdgesGeometry(geometry),
				new THREE.LineBasicMaterial({ color: 0x2b2118, transparent: true, opacity: 0.55 })
			)
		);
		mesh.position.set(num(p.pos_x), num(p.pos_y), num(p.pos_z));
		mesh.rotation.y = THREE.MathUtils.degToRad(num(p.rot_y));
		mesh.userData.part = p;
		mesh.userData.base = mesh.position.clone();
		return mesh;
	}

	layoutIfNeeded(parts) {
		// cut lists have no positions: lay the parts flat on the mat in rows
		const placed = parts.some((p) => num(p.pos_x) || num(p.pos_y) || num(p.pos_z));
		if (placed) return false;
		let x = 0, z = 0, rowDepth = 0;
		const gap = 60, maxRow = 3200;
		parts.forEach((p) => {
			const s = partSize(p);
			if (x > 0 && x + s.x > maxRow) {
				x = 0;
				z += rowDepth + gap;
				rowDepth = 0;
			}
			p.pos_x = Math.round(x + s.x / 2 - maxRow / 2);
			p.pos_y = Math.round(s.y / 2);
			p.pos_z = Math.round(z + s.z / 2);
			x += s.x + gap;
			rowDepth = Math.max(rowDepth, s.z);
		});
		return true;
	}

	clear() {
		[...this.group.children].forEach((mesh) => this.disposeMesh(mesh));
	}

	disposeMesh(mesh) {
		this.group.remove(mesh);
		mesh.traverse((o) => {
			o.geometry?.dispose();
			o.material?.dispose();
		});
	}

	setParts(parts) {
		this.clear();
		this.parts = parts;
		const laidOut = this.layoutIfNeeded(parts);
		parts.forEach((p) => this.group.add(this.buildMesh(p)));
		this.applyExplode();
		return laidOut;
	}

	meshFor(part) {
		return this.group.children.find((m) => m.userData.part === part);
	}

	replaceMesh(part) {
		const old = this.meshFor(part);
		const mesh = this.buildMesh(part);
		if (old) this.disposeMesh(old);
		this.group.add(mesh);
		this.applyExplode();
		return mesh;
	}

	centre() {
		const box = new THREE.Box3();
		this.group.children.forEach((m) => box.expandByPoint(m.userData.base));
		return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
	}

	setExplode(factor) {
		this.explode = factor;
		this.applyExplode();
	}

	applyExplode() {
		const c = this.centre();
		this.group.children.forEach((m) => {
			const base = m.userData.base;
			m.position.copy(base).add(base.clone().sub(c).multiplyScalar(this.explode));
		});
	}

	fit() {
		const box = new THREE.Box3().setFromObject(this.group);
		if (box.isEmpty()) {
			this.camera.position.set(1800, 1400, 2200);
			this.orbit.target.set(0, 360, 0);
			return;
		}
		const size = box.getSize(new THREE.Vector3());
		const centre = box.getCenter(new THREE.Vector3());
		const dist = Math.max(size.x, size.y, size.z, 400) * 1.8;
		this.camera.position.copy(centre).add(new THREE.Vector3(dist * 0.75, dist * 0.6, dist * 0.95));
		this.camera.near = Math.max(dist / 200, 1);
		this.camera.far = dist * 30;
		this.camera.updateProjectionMatrix();
		this.orbit.target.copy(centre);
	}

	destroy() {
		this.renderer.setAnimationLoop(null);
		this.resizeObserver.disconnect();
		this.clear();
		this.orbit.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}

/* ------------------------------------------------------------------ read-only viewer (form preview) */

class Viewer {
	constructor(el, parts, materials) {
		ensureStyles();
		const canvas = $(`<div class="f3d-canvas"></div>`).appendTo(el)[0];
		this.core = new SceneCore(canvas);
		this.core.setMaterials(materials);
		this.core.setParts((parts || []).map(normalisePart));
		this.core.fit();

		const tools = $(`<div class="f3d-tools"></div>`).appendTo(el);
		$(`<button type="button" class="f3d-tool">${__("Explode")}</button>`)
			.appendTo(tools)
			.on("click", (e) => {
				const on = !$(e.currentTarget).hasClass("is-on");
				$(e.currentTarget).toggleClass("is-on", on);
				this.core.setExplode(on ? 0.6 : 0);
			});
		$(`<button type="button" class="f3d-tool">${__("Fit view")}</button>`)
			.appendTo(tools)
			.on("click", () => this.core.fit());
	}

	destroy() {
		this.core.destroy();
	}
}

/* ------------------------------------------------------------------ designer page */

class Designer {
	constructor({ page, wrapper }) {
		ensureStyles();
		this.page = page;
		this.doc = null;
		this.parts = [];
		this.selected = null;
		this.dirty = false;
		this.sourceModel = null;

		this.$root = $(`
			<div class="f3d-designer">
				<div class="f3d-stage">
					<div class="f3d-canvas"></div>
					<div class="f3d-tools"></div>
					<div class="f3d-status" aria-live="polite"></div>
				</div>
				<aside class="f3d-panel" aria-label="${__("Part properties")}"></aside>
			</div>`).appendTo(wrapper);

		this.core = new SceneCore(this.$root.find(".f3d-canvas")[0]);
		this.$panel = this.$root.find(".f3d-panel");
		this.$status = this.$root.find(".f3d-status");

		this.setupPage();
		this.setupTools();
		this.setupTransform();
		this.setupPicking();
		this.setupKeys();
	}

	/* ---------- page chrome */

	setupPage() {
		this.designField = this.page.add_field({
			fieldname: "design",
			fieldtype: "Link",
			options: "Design Project",
			label: __("Design"),
			change: () => {
				const value = this.designField.get_value();
				if (this._settingField || !value || value === this.doc?.name) return;
				this.confirmDiscard(() => frappe.set_route("three-d-designer", value));
			},
		});

		this.page.set_primary_action(__("Save design"), () => this.save());
		this.page.add_inner_button(__("Generate BOM"), () => this.generateBom());
		this.page.add_menu_item(__("New design"), () => this.confirmDiscard(() => frappe.set_route("three-d-designer")));
		this.page.add_menu_item(__("Open design form"), () => {
			if (this.doc) frappe.set_route("Form", "Design Project", this.doc.name);
			else frappe.show_alert(__("Save the design first"));
		});
		this.page.add_menu_item(__("Download GLB model"), () => this.exportGlb());
		this.page.add_menu_item(__("Download design JSON"), () => this.exportJson());
		this.page.add_menu_item(__("Material mapping"), () => frappe.set_route("List", "Design Material Map"));
		this.page.add_menu_item(__("Designer settings"), () => frappe.set_route("Form", "Designer Settings"));

		window.addEventListener("beforeunload", (e) => {
			if (this.dirty) e.preventDefault();
		});
	}

	setupTools() {
		const $t = this.$root.find(".f3d-tools");
		const btn = (label, fn, title) =>
			$(`<button type="button" class="f3d-tool" title="${title || label}">${label}</button>`).appendTo($t).on("click", fn);

		const options = Object.entries(PRESETS)
			.map(([key, p]) => `<option value="${key}">${__(p.label)}</option>`)
			.join("");
		$(`<select class="f3d-add" aria-label="${__("Add part")}">
				<option value="">${__("Add part")}</option>${options}
			</select>`)
			.appendTo($t)
			.on("change", (e) => {
				if (e.target.value) this.addPart(e.target.value);
				e.target.value = "";
			});
		btn(__("Start a cabinet"), () => this.starterCabinet(), __("800 × 720 × 560 mm carcass with shelf, back and two doors"));

		$(`<span class="f3d-gap"></span>`).appendTo($t);
		this.$dup = btn(__("Duplicate"), () => this.duplicate());
		this.$rot = btn(__("Rotate 90°"), () => this.rotate());
		this.$del = btn(__("Delete"), () => this.remove());

		$(`<span class="f3d-gap"></span>`).appendTo($t);
		btn(__("Fit view"), () => this.core.fit());
		const $explode = $(`<label class="f3d-explode">${__("Explode")}
				<input type="range" min="0" max="1.5" step="0.05" value="0"></label>`).appendTo($t);
		$explode.find("input").on("input", (e) => {
			const f = parseFloat(e.target.value);
			this.core.setExplode(f);
			if (f > 0) this.transform.detach();
			else if (this.selected) this.transform.attach(this.core.meshFor(this.selected));
		});
		this.$source = btn(__("Source model"), () => this.toggleSourceModel(), __("Overlay the uploaded GLB/GLTF file")).hide();
		this.updateToolState();
	}

	setupTransform() {
		this.transform = new TransformControls(this.core.camera, this.core.renderer.domElement);
		this.transform.setTranslationSnap(5);
		this.transform.setSize(0.8);
		this.core.scene.add(this.transform);
		this.transform.addEventListener("dragging-changed", (e) => (this.core.orbit.enabled = !e.value));
		this.transform.addEventListener("objectChange", () => {
			const mesh = this.transform.object;
			if (!mesh) return;
			const p = mesh.userData.part;
			mesh.userData.base.copy(mesh.position);
			p.pos_x = Math.round(mesh.position.x);
			p.pos_y = Math.round(mesh.position.y);
			p.pos_z = Math.round(mesh.position.z);
			this.markDirty();
			this.syncPositionFields();
		});
	}

	setupPicking() {
		const el = this.core.renderer.domElement;
		const ray = new THREE.Raycaster();
		let down = null;
		el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
		el.addEventListener("pointerup", (e) => {
			if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
			if (this.transform.dragging) return;
			const r = el.getBoundingClientRect();
			const pointer = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
			ray.setFromCamera(pointer, this.core.camera);
			const hit = ray.intersectObjects(this.core.group.children, false)[0];
			this.select(hit ? hit.object.userData.part : null);
		});
	}

	setupKeys() {
		document.addEventListener("keydown", (e) => {
			if (frappe.get_route()[0] !== "three-d-designer") return;
			if ($(e.target).is("input, textarea, select, [contenteditable]")) return;
			if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
				e.preventDefault();
				this.remove();
			} else if (e.key === "Escape") {
				this.select(null);
			}
		});
	}

	/* ---------- loading & saving */

	load_from_route() {
		const name = frappe.get_route()[1];
		if (name && name !== this.doc?.name) this.load(name);
		else if (!name && (this.doc || !this.loaded)) this.newDesign();
	}

	async load(name) {
		const r = await frappe.call({ method: "frappe_3d_designer.api.get_design", args: { name } });
		const d = r.message;
		this.doc = d;
		this.loaded = true;
		this.removeSourceModel();
		this.core.setMaterials(d.materials);
		this.parts = d.parts.map(normalisePart);
		const laidOut = this.core.setParts(this.parts);
		this.core.fit();
		this.dirty = laidOut && this.parts.length > 0;
		this.setTitle();
		this.$source.toggle(/\.(glb|gltf)$/i.test(d.design_file || ""));
		this.select(null);
	}

	async newDesign() {
		this.doc = null;
		this.loaded = true;
		this.removeSourceModel();
		const materials = await frappe.xcall("frappe_3d_designer.api.get_materials");
		this.core.setMaterials(materials);
		this.parts = [];
		this.core.setParts(this.parts);
		this.core.fit();
		this.dirty = false;
		this.setTitle();
		this.$source.hide();
		this.select(null);
	}

	setTitle() {
		this.page.set_title(this.doc ? this.doc.design_name : __("New design"));
		this._settingField = true;
		Promise.resolve(this.designField.set_value(this.doc?.name || "")).finally(() => (this._settingField = false));
		this.renderStatus();
	}

	confirmDiscard(fn) {
		if (!this.dirty) return fn();
		frappe.confirm(__("You have unsaved changes. Discard them?"), () => {
			this.dirty = false;
			fn();
		});
	}

	serialize() {
		return this.parts.map((p) => {
			const out = {};
			PART_FIELDS.forEach((f) => (out[f] = p[f]));
			return out;
		});
	}

	askDesignName() {
		return new Promise((resolve) => {
			frappe.prompt(
				[
					{ fieldname: "design_name", fieldtype: "Data", label: __("Design name"), reqd: 1 },
					{
						fieldname: "company",
						fieldtype: "Link",
						options: "Company",
						label: __("Company"),
						reqd: 1,
						default: frappe.defaults.get_user_default("Company"),
					},
				],
				(v) => resolve(v),
				__("Save design"),
				__("Save design")
			);
		});
	}

	async save() {
		if (!this.parts.length) {
			frappe.show_alert({ message: __("Add at least one part before saving"), indicator: "orange" });
			return null;
		}
		let extra = {};
		if (!this.doc) extra = await this.askDesignName();
		const r = await frappe.call({
			method: "frappe_3d_designer.api.save_design",
			args: { name: this.doc?.name, parts: JSON.stringify(this.serialize()), ...extra },
			freeze: true,
			freeze_message: __("Saving design"),
		});
		const isNew = !this.doc;
		this.dirty = false;
		frappe.show_alert({ message: __("Design saved"), indicator: "green" });
		await this.load(r.message.name);
		if (isNew) frappe.set_route("three-d-designer", r.message.name);
		return r.message.name;
	}

	async generateBom() {
		const name = this.dirty || !this.doc ? await this.save() : this.doc.name;
		if (!name) return;
		const r = await frappe.call({
			method: "frappe_3d_designer.api.generate_bom",
			args: { name },
			freeze: true,
			freeze_message: __("Building BOM from parts"),
		});
		this.doc = { ...(this.doc || {}), name, bom: r.message };
		this.renderStatus();
		frappe.show_alert({ message: __("BOM {0} is ready", [r.message]), indicator: "green" });
	}

	/* ---------- editing */

	markDirty() {
		this.dirty = true;
		this.renderStatus();
	}

	defaultMaterial(maxThickness) {
		const list = Object.values(this.core.materials);
		if (maxThickness) {
			const thin = list.find((m) => m.default_thickness_mm && m.default_thickness_mm <= maxThickness);
			if (thin) return thin.name;
		}
		return (list.find((m) => num(m.default_thickness_mm) >= 15) || list[0])?.name || null;
	}

	newPart(presetKey, overrides = {}) {
		const preset = PRESETS[presetKey];
		const p = normalisePart({
			...preset,
			part_name: __(preset.label),
			material: this.defaultMaterial(preset.thickness_mm <= 8 ? 8 : null),
			...overrides,
		});
		if (!overrides.pos_y) p.pos_y = partSize(p).y / 2;
		return p;
	}

	addPart(presetKey) {
		const p = this.newPart(presetKey);
		if (this.selected) {
			const ref = this.selected;
			p.pos_x = ref.pos_x + partSize(ref).x / 2 + partSize(p).x / 2 + 20;
			p.pos_z = ref.pos_z;
		}
		this.parts.push(p);
		this.core.replaceMesh(p);
		this.select(p);
		this.markDirty();
	}

	starterCabinet() {
		const W = 800, H = 720, D = 560, T = 18;
		const add = (key, o) => this.parts.push(this.newPart(key, o));
		add("side", { part_name: __("Left side"), pos_x: -(W / 2 - T / 2), pos_y: H / 2, pos_z: 0 });
		add("side", { part_name: __("Right side"), pos_x: W / 2 - T / 2, pos_y: H / 2, pos_z: 0 });
		add("top", { part_name: __("Bottom"), length_mm: W - 2 * T, pos_y: T / 2 });
		add("top", { part_name: __("Top"), length_mm: W - 2 * T, pos_y: H - T / 2 });
		add("shelf", { pos_y: H / 2, pos_z: -10 });
		add("back", { pos_y: H / 2, pos_z: -(D / 2 + 3) });
		add("door", { part_name: __("Left door"), pos_x: -(W / 4), pos_y: H / 2, pos_z: D / 2 + T / 2 + 2 });
		add("door", { part_name: __("Right door"), pos_x: W / 4, pos_y: H / 2, pos_z: D / 2 + T / 2 + 2 });
		this.core.setParts(this.parts);
		this.core.fit();
		this.select(null);
		this.markDirty();
	}

	duplicate() {
		if (!this.selected) return;
		const p = normalisePart({ ...this.selected });
		p.part_name = `${this.selected.part_name} (2)`;
		p.mesh_id = null;
		p.pos_x += partSize(p).x + 20;
		this.parts.push(p);
		this.core.replaceMesh(p);
		this.select(p);
		this.markDirty();
	}

	rotate() {
		if (!this.selected) return;
		this.selected.rot_y = (num(this.selected.rot_y) + 90) % 360;
		this.refreshSelected();
	}

	remove() {
		if (!this.selected) return;
		const p = this.selected;
		this.select(null);
		const mesh = this.core.meshFor(p);
		if (mesh) this.core.disposeMesh(mesh);
		this.parts.splice(this.parts.indexOf(p), 1);
		this.markDirty();
	}

	refreshSelected() {
		const mesh = this.core.replaceMesh(this.selected);
		this.highlight(mesh);
		if (!this.core.explode) this.transform.attach(mesh);
		this.markDirty();
	}

	/* ---------- selection & panel */

	select(part) {
		this.transform.detach();
		this.core.group.children.forEach((m) => m.material.emissive?.setHex(0));
		this.selected = part;
		if (part) {
			const mesh = this.core.meshFor(part);
			this.highlight(mesh);
			if (!this.core.explode && this.doc?.can_write !== false) this.transform.attach(mesh);
		}
		this.updateToolState();
		this.renderPanel();
	}

	highlight(mesh) {
		mesh?.material.emissive?.setHex(SELECT_EMISSIVE);
	}

	updateToolState() {
		[this.$dup, this.$rot, this.$del].forEach(($b) => $b?.prop("disabled", !this.selected));
	}

	renderPanel() {
		this.$panel.empty();
		if (this.selected) return this.renderPartForm();

		this.$panel.append(`<h5>${__("Parts")}</h5>`);
		if (!this.parts.length) {
			this.$panel.append(
				`<p class="f3d-hint">${__("Start a cabinet or add parts from the toolbar. You can also upload a GLB, OBJ or cut list on the Design Project form.")}</p>`
			);
			return;
		}
		this.$panel.append(`<p class="f3d-hint">${__("Click a part in the view or the list to edit it. Drag the arrows to move it.")}</p>`);
		const $list = $(`<ul class="f3d-parts"></ul>`).appendTo(this.$panel);
		this.parts.forEach((p) => {
			const unmapped = !p.material && !p.item_code;
			$(`<li tabindex="0">
					<span class="f3d-swatch" style="background:${this.core.colorFor(p)}"></span>
					<span>${frappe.utils.escape_html(p.part_name)}${p.qty > 1 ? ` ×${p.qty}` : ""}</span>
					<span class="f3d-dims">${unmapped ? __("No material") : `${Math.round(p.length_mm)} × ${Math.round(p.width_mm)} × ${Math.round(p.thickness_mm)}`}</span>
				</li>`)
				.appendTo($list)
				.on("click keydown", (e) => {
					if (e.type === "keydown" && e.key !== "Enter") return;
					this.select(p);
				});
		});
	}

	renderPartForm() {
		const p = this.selected;
		this.$panel.append(`<h5>${frappe.utils.escape_html(p.part_name)}</h5>`);
		const onChange = (field, rebuild = true) => () => {
			if (this._filling) return;
			let value = this.partForm.get_value(field);
			if (field.startsWith("edge_band")) value = parseInt(value) || 0;
			if (value === p[field]) return;
			p[field] = value;
			if (field === "material" && value && !this.core.materials[value]) {
				frappe.xcall("frappe_3d_designer.api.get_materials").then((list) => {
					this.core.setMaterials(list);
					this.refreshSelected();
				});
			}
			if (field === "part_name") this.$panel.find("h5").text(value || "");
			if (rebuild) this.refreshSelected();
			else this.markDirty();
		};

		const fields = [
			{ fieldname: "part_name", fieldtype: "Data", label: __("Part name"), change: onChange("part_name", false) },
			{ fieldname: "material", fieldtype: "Link", options: "Design Material Map", label: __("Material"), change: onChange("material") },
			p.source_material && !p.material
				? { fieldname: "source_material", fieldtype: "Data", label: __("Material in file"), read_only: 1 }
				: null,
			{
				fieldname: "item_code",
				fieldtype: "Link",
				options: "Item",
				label: __("Hardware item"),
				description: __("For hinges, handles or legs. Counted per piece."),
				change: onChange("item_code"),
			},
			{ fieldname: "orientation", fieldtype: "Select", label: __("Orientation"), options: "Horizontal\nVertical Side\nVertical Back", change: onChange("orientation") },
			{ fieldname: "length_mm", fieldtype: "Float", label: __("Length (mm)"), change: onChange("length_mm") },
			{ fieldname: "width_mm", fieldtype: "Float", label: __("Width (mm)"), change: onChange("width_mm") },
			{ fieldname: "thickness_mm", fieldtype: "Float", label: __("Thickness (mm)"), change: onChange("thickness_mm") },
			{ fieldname: "qty", fieldtype: "Int", label: __("Qty"), change: onChange("qty", false) },
			{ fieldname: "sec_edge", fieldtype: "Section Break", label: __("Edge banding") },
			{ fieldname: "edge_band_long", fieldtype: "Select", options: "0\n1\n2", label: __("Long edges"), change: onChange("edge_band_long", false) },
			{ fieldname: "edge_band_short", fieldtype: "Select", options: "0\n1\n2", label: __("Short edges"), change: onChange("edge_band_short", false) },
			{ fieldname: "sec_pos", fieldtype: "Section Break", label: __("Position (mm)"), collapsible: 1 },
			{ fieldname: "pos_x", fieldtype: "Float", label: "X", change: onChange("pos_x") },
			{ fieldname: "pos_y", fieldtype: "Float", label: "Y", change: onChange("pos_y") },
			{ fieldname: "pos_z", fieldtype: "Float", label: "Z", change: onChange("pos_z") },
			{ fieldname: "rot_y", fieldtype: "Float", label: __("Rotation (°)"), change: onChange("rot_y") },
		].filter(Boolean);

		const body = $(`<div></div>`).appendTo(this.$panel);
		this.partForm = new frappe.ui.FieldGroup({ fields, body });
		this.partForm.make();
		this._filling = true;
		const values = { ...p, edge_band_long: String(p.edge_band_long), edge_band_short: String(p.edge_band_short) };
		Promise.resolve(this.partForm.set_values(values)).finally(() => (this._filling = false));

		const $actions = $(`<div class="f3d-panel-actions"></div>`).appendTo(this.$panel);
		$(`<button type="button" class="btn btn-default btn-xs">${__("Back to parts")}</button>`)
			.appendTo($actions)
			.on("click", () => this.select(null));
	}

	syncPositionFields() {
		if (!this.partForm || !this.selected) return;
		clearTimeout(this._posTimer);
		this._posTimer = setTimeout(() => {
			this._filling = true;
			const p = this.selected;
			Promise.resolve(this.partForm.set_values({ pos_x: p.pos_x, pos_y: p.pos_y, pos_z: p.pos_z })).finally(
				() => (this._filling = false)
			);
		}, 120);
	}

	renderStatus() {
		const boards = this.parts.filter((p) => !(p.item_code && !p.material));
		const area = boards.reduce((s, p) => s + (num(p.length_mm) * num(p.width_mm) * p.qty) / 1e6, 0);
		const count = this.parts.reduce((s, p) => s + p.qty, 0);
		const unmapped = this.parts.filter((p) => !p.material && !p.item_code).length;
		const bom = this.doc?.bom
			? `<a href="/app/bom/${encodeURIComponent(this.doc.bom)}">${frappe.utils.escape_html(this.doc.bom)}</a>`
			: __("No BOM yet");
		this.$status.html(`
			<span>${__("{0} parts", [count])}</span>
			<span>${__("{0} m² of board", [area.toFixed(2)])}</span>
			${unmapped ? `<span>${__("{0} without material", [unmapped])}</span>` : ""}
			<span>${bom}</span>
			${this.dirty ? `<span>${__("Unsaved changes")}</span>` : ""}`);
	}

	/* ---------- source model & export */

	toggleSourceModel() {
		if (this.sourceModel) return this.removeSourceModel();
		new GLTFLoader().load(
			this.doc.design_file,
			(gltf) => {
				const model = gltf.scene;
				model.scale.setScalar(this.doc.model_scale || 1000);
				model.traverse((o) => {
					if (!o.isMesh) return;
					o.material = o.material.clone();
					o.material.transparent = true;
					o.material.opacity = 0.35;
					o.material.depthWrite = false;
				});
				this.sourceModel = model;
				this.core.scene.add(model);
				this.$source.addClass("is-on");
			},
			undefined,
			() => frappe.msgprint(__("Could not load the source model. Only GLB and embedded GLTF files can be shown."))
		);
	}

	removeSourceModel() {
		if (!this.sourceModel) return;
		this.core.scene.remove(this.sourceModel);
		this.sourceModel = null;
		this.$source?.removeClass("is-on");
	}

	fileName(ext) {
		return `${(this.doc?.design_name || "design").replace(/[^\w\- ]+/g, "").trim() || "design"}.${ext}`;
	}

	exportGlb() {
		if (!this.parts.length) return frappe.show_alert(__("Nothing to export yet"));
		const root = new THREE.Group();
		root.name = this.doc?.design_name || "design";
		root.scale.setScalar(0.001); // GLB in metres, like most CAD exports
		this.core.group.children.forEach((m) => {
			const copy = m.clone(false);
			copy.position.copy(m.userData.base);
			root.add(copy);
		});
		new GLTFExporter().parse(
			root,
			(glb) => download(new Blob([glb], { type: "model/gltf-binary" }), this.fileName("glb")),
			(err) => frappe.msgprint(__("GLB export failed: {0}", [err?.message || err])),
			{ binary: true }
		);
	}

	exportJson() {
		const data = { format: "frappe-3d-designer", version: 1, design_name: this.doc?.design_name, parts: this.serialize() };
		download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), this.fileName("json"));
	}
}

frappe.provide("frappe_3d_designer");
frappe_3d_designer.Designer = Designer;
frappe_3d_designer.Viewer = Viewer;
