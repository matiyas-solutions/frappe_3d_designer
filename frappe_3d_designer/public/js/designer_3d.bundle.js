import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* ------------------------------------------------------------------ constants */

const WOOD_FALLBACKS = ["#C8A27A", "#E3CBA8", "#9B6B43", "#D9D4CB", "#6E4B32", "#B8B2A6"];
const HARDWARE_COLOR = "#8A8F98";
const UNMAPPED_COLOR = "#D9534F";
const SELECT_EMISSIVE = 0x7a5200;

const PART_FIELDS = [
	"part_name", "material", "item_code", "source_material", "orientation", "shape", "grain",
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
.f3d-stage.f3d-is-presentation,.f3d-viewer.f3d-is-presentation{background:linear-gradient(180deg,#EEF1F2 0%,#CBD2D6 100%)}
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
.f3d-foot{position:absolute;left:12px;right:12px;bottom:10px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:flex-end;justify-content:space-between;pointer-events:none}
.f3d-foot>*{pointer-events:auto}
.f3d-status{display:flex;flex-wrap:wrap;gap:4px 16px;color:rgba(255,255,255,.92);font-size:12px;font-variant-numeric:tabular-nums}
.f3d-viewbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end}
.f3d-seg{display:inline-flex;border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.25)}
.f3d-seg .f3d-tool{border-radius:0;box-shadow:none}
.f3d-seg .f3d-tool+.f3d-tool{border-left:1px solid rgba(0,0,0,.08)}
.f3d-is-presentation .f3d-status,.f3d-is-presentation .f3d-explode{color:#1F2A26}
.f3d-is-presentation .f3d-gap{background:rgba(0,0,0,.2)}
.f3d-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:60vh;overflow:auto}
.f3d-lib button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg);padding:8px;cursor:pointer;color:var(--text-color)}
.f3d-lib button:hover,.f3d-lib button:focus-visible{border-color:#3E6B5C;outline:none}
.f3d-lib img,.f3d-lib .f3d-thumb{width:100%;height:84px;object-fit:contain;border-radius:4px;background:var(--control-bg)}
.f3d-lib small{color:var(--text-muted)}
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
	if (p.shape === "Cylinder") return p.orientation === "Horizontal" ? { x: L, y: W, z: W } : { x: W, y: L, z: W };
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
	out.shape = out.shape || "Box";
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

/* ------------------------------------------------------------------ wood textures (presentation) */

const textureCache = {};

function woodTexture(hex, acrossGrain) {
	const key = `${hex}|${acrossGrain ? 1 : 0}`;
	if (textureCache[key]) return textureCache[key];
	const size = 512;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = hex;
	ctx.fillRect(0, 0, size, size);
	let seed = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
	const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
	for (let i = 0; i < 140; i++) {
		const y = rnd() * size;
		const amp = 2 + rnd() * 6;
		const freq = 0.004 + rnd() * 0.01;
		ctx.strokeStyle = rnd() > 0.5 ? "rgba(60,35,15,0.10)" : "rgba(255,240,220,0.08)";
		ctx.lineWidth = 0.6 + rnd() * 2.2;
		ctx.beginPath();
		for (let x = 0; x <= size; x += 8) {
			const yy = y + Math.sin(x * freq + i) * amp;
			x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
		}
		ctx.stroke();
	}
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.center.set(0.5, 0.5);
	if (acrossGrain) tex.rotation = Math.PI / 2;
	textureCache[key] = tex;
	return tex;
}

/* ------------------------------------------------------------------ scene core */

class SceneCore {
	constructor(container) {
		this.container = container;
		this.materials = {};
		this.parts = [];
		this.explode = 0;
		this.presentation = false;
		this.view = "3d";

		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		container.appendChild(this.renderer.domElement);

		this.scene = new THREE.Scene();
		this.perspective = new THREE.PerspectiveCamera(40, 1, 5, 60000);
		this.perspective.position.set(1800, 1400, 2200);
		this.ortho = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, -50000, 50000);
		this.camera = this.perspective;

		this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
		this.orbit.target.set(0, 360, 0);
		this.orbit.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		this.hemi = new THREE.HemisphereLight(0xffffff, 0x2f5d50, 2.2);
		this.scene.add(this.hemi);
		this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
		this.sun.position.set(2000, 4000, 3000);
		this.sun.shadow.mapSize.set(2048, 2048);
		this.sun.shadow.bias = -0.0004;
		this.scene.add(this.sun, this.sun.target);
		const fill = new THREE.DirectionalLight(0xffffff, 0.8);
		fill.position.set(-3000, 1500, -2000);
		this.scene.add(fill);

		// cutting-mat grid: 100 mm cells, 6 m wide
		this.grid = new THREE.GridHelper(6000, 60, 0x9cc3b4, 0x5e8a7b);
		this.grid.material.transparent = true;
		this.grid.material.opacity = 0.55;
		this.scene.add(this.grid);

		this.ground = new THREE.Mesh(
			new THREE.PlaneGeometry(20000, 20000),
			new THREE.ShadowMaterial({ opacity: 0.22 })
		);
		this.ground.rotation.x = -Math.PI / 2;
		this.ground.receiveShadow = true;
		this.ground.visible = false;
		this.scene.add(this.ground);

		this.group = new THREE.Group();
		this.scene.add(this.group);
		this.holes = new THREE.Group();
		this.scene.add(this.holes);

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
		this.perspective.aspect = w / h;
		this.perspective.updateProjectionMatrix();
		this.fitOrthoFrustum();
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
		const isHardware = p.item_code && !p.material;
		let geometry;
		if (p.shape === "Cylinder") {
			const r = Math.max(num(p.width_mm), 1) / 2;
			geometry = new THREE.CylinderGeometry(r, r, Math.max(num(p.length_mm), 1), 32);
			if (p.orientation === "Horizontal") geometry.rotateZ(Math.PI / 2);
		} else {
			geometry = new THREE.BoxGeometry(s.x, s.y, s.z);
		}
		const color = this.colorFor(p);
		const material = new THREE.MeshStandardMaterial({
			color: new THREE.Color(this.presentation && !isHardware ? "#ffffff" : color),
			map: this.presentation && !isHardware ? woodTexture(color, p.grain === "Along Width") : null,
			roughness: isHardware ? 0.35 : 0.72,
			metalness: isHardware ? 0.7 : 0,
		});
		material.name = p.material || p.source_material || p.item_code || "Unmapped";

		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = `${p.part_name}__${material.name}`;
		mesh.castShadow = mesh.receiveShadow = this.presentation;
		if (!this.presentation) {
			mesh.add(
				new THREE.LineSegments(
					new THREE.EdgesGeometry(geometry, 20),
					new THREE.LineBasicMaterial({ color: 0x2b2118, transparent: true, opacity: 0.55 })
				)
			);
		}
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
		this.updateShadowCamera();
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

	bounds() {
		const box = new THREE.Box3();
		this.group.children.forEach((m) => {
			m.updateMatrixWorld(true);
			box.expandByObject(m);
		});
		return box;
	}

	centre() {
		const box = new THREE.Box3();
		this.group.children.forEach((m) => box.expandByPoint(m.userData.base));
		return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
	}

	setExplode(factor) {
		this.explode = factor;
		this.applyExplode();
		this.holes.visible = factor === 0;
	}

	applyExplode() {
		const c = this.centre();
		this.group.children.forEach((m) => {
			const base = m.userData.base;
			m.position.copy(base).add(base.clone().sub(c).multiplyScalar(this.explode));
		});
	}

	/* ---------- views: 3D perspective or 2D orthographic (front / top / right) */

	setView(view) {
		this.view = view;
		const cam = view === "3d" ? this.perspective : this.ortho;
		this.camera = cam;
		this.orbit.object = cam;
		this.orbit.enableRotate = view === "3d";
		this.onCameraChange?.(cam);
		this.fit();
	}

	fitOrthoFrustum(size) {
		const w = this.container.clientWidth || 1;
		const h = this.container.clientHeight || 1;
		const half = (size || this._orthoHalf || 1000) * 0.62;
		this._orthoHalf = size || this._orthoHalf || 1000;
		const aspect = w / h;
		this.ortho.left = -half * aspect;
		this.ortho.right = half * aspect;
		this.ortho.top = half;
		this.ortho.bottom = -half;
		this.ortho.updateProjectionMatrix();
	}

	fit() {
		const box = this.bounds();
		const empty = box.isEmpty();
		const size = empty ? new THREE.Vector3(1000, 800, 600) : box.getSize(new THREE.Vector3());
		const centre = empty ? new THREE.Vector3(0, 360, 0) : box.getCenter(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z, 400);

		if (this.view === "3d") {
			const dist = maxDim * 1.8;
			this.perspective.position.copy(centre).add(new THREE.Vector3(dist * 0.75, dist * 0.6, dist * 0.95));
			this.perspective.near = Math.max(dist / 200, 1);
			this.perspective.far = dist * 30;
			this.perspective.updateProjectionMatrix();
		} else {
			const dist = maxDim * 4;
			const dir = { front: [0, 0, 1], top: [0, 1, 0], right: [1, 0, 0] }[this.view];
			this.ortho.position.copy(centre).add(new THREE.Vector3(...dir).multiplyScalar(dist));
			this.ortho.up.set(...(this.view === "top" ? [0, 0, -1] : [0, 1, 0]));
			this.ortho.zoom = 1;
			const extent = this.view === "front" ? Math.max(size.y, size.x / 1.6)
				: this.view === "top" ? Math.max(size.z, size.x / 1.6)
				: Math.max(size.y, size.z / 1.6);
			this.fitOrthoFrustum(Math.max(extent, 300) * 1.25);
			this.ortho.lookAt(centre);
		}
		this.orbit.target.copy(centre);
		this.camera.lookAt(centre);
		this.orbit.update();
	}

	/* ---------- section (clipping plane) */

	setSection(axis, fraction) {
		if (!axis) {
			this.renderer.clippingPlanes = [];
			return;
		}
		const box = this.bounds();
		if (box.isEmpty()) return;
		const i = { x: 0, y: 1, z: 2 }[axis];
		const lo = box.min.getComponent(i), hi = box.max.getComponent(i);
		const normal = new THREE.Vector3();
		normal.setComponent(i, -1);
		this.renderer.clippingPlanes = [new THREE.Plane(normal, lo + (hi - lo) * fraction)];
	}

	/* ---------- presentation (PBR, environment light, soft shadows, wood grain) */

	setPresentation(on) {
		this.presentation = on;
		const r = this.renderer;
		r.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
		r.toneMappingExposure = 1.05;
		r.shadowMap.enabled = on;
		if (on && !this._env) {
			const pmrem = new THREE.PMREMGenerator(r);
			this._env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			pmrem.dispose();
		}
		this.scene.environment = on ? this._env : null;
		this.hemi.intensity = on ? 0.6 : 2.2;
		this.sun.castShadow = on;
		this.grid.visible = !on;
		this.ground.visible = on;
		this.container.parentElement?.classList.toggle("f3d-is-presentation", on);
		this.setParts(this.parts);
	}

	updateShadowCamera() {
		const box = this.bounds();
		if (box.isEmpty()) return;
		const c = box.getCenter(new THREE.Vector3());
		const r = box.getSize(new THREE.Vector3()).length();
		this.sun.position.copy(c).add(new THREE.Vector3(r * 0.6, r * 1.4, r * 0.9));
		this.sun.target.position.copy(c);
		const cam = this.sun.shadow.camera;
		cam.left = cam.bottom = -r;
		cam.right = cam.top = r;
		cam.near = 1;
		cam.far = r * 4;
		cam.updateProjectionMatrix();
	}

	renderPNG(scale = 2) {
		const prev = this.renderer.getPixelRatio();
		this.renderer.setPixelRatio(scale);
		this.resize();
		this.renderer.render(this.scene, this.camera);
		const url = this.renderer.domElement.toDataURL("image/png");
		this.renderer.setPixelRatio(prev);
		this.resize();
		return url;
	}

	/* ---------- workshop overlay: boreholes */

	setHoles(holes) {
		[...this.holes.children].forEach((m) => {
			this.holes.remove(m);
			m.geometry.dispose();
		});
		if (!holes?.length) return;
		const mat = new THREE.MeshBasicMaterial({ color: 0x14100c });
		holes.forEach((h) => {
			const g = new THREE.CylinderGeometry(h.diameter / 2, h.diameter / 2, h.depth, 16);
			const m = new THREE.Mesh(g, mat);
			const p = new THREE.Vector3(...h.world);
			const shift = new THREE.Vector3();
			shift.setComponent(h.axis, (h.into * h.depth) / 2);
			m.position.copy(p.add(shift));
			if (h.axis === 0) m.rotation.z = Math.PI / 2;
			if (h.axis === 2) m.rotation.x = Math.PI / 2;
			this.holes.add(m);
		});
	}

	destroy() {
		this.renderer.setAnimationLoop(null);
		this.resizeObserver.disconnect();
		this.clear();
		this.setHoles([]);
		this.orbit.dispose();
		this._env?.dispose();
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
		const toggle = (label, fn) =>
			$(`<button type="button" class="f3d-tool">${label}</button>`)
				.appendTo(tools)
				.on("click", (e) => {
					const on = !$(e.currentTarget).hasClass("is-on");
					$(e.currentTarget).toggleClass("is-on", on).attr("aria-pressed", on);
					fn(on);
				});
		toggle(__("Explode"), (on) => this.core.setExplode(on ? 0.6 : 0));
		toggle(__("Presentation"), (on) => this.core.setPresentation(on));
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
					<div class="f3d-foot">
						<div class="f3d-status" aria-live="polite"></div>
						<div class="f3d-viewbar"></div>
					</div>
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
		const printView = (format) => {
			if (!this.doc || this.dirty) return frappe.show_alert(__("Save the design first"));
			const q = new URLSearchParams({ doctype: "Design Project", name: this.doc.name, format, no_letterhead: 1 });
			window.open(`/printview?${q}`, "_blank");
		};
		this.page.add_menu_item(__("Technical drawing"), () => printView("Design Technical Drawing"));
		this.page.add_menu_item(__("Cutting plan"), () => printView("Design Cutting Plan"));
		this.page.add_menu_item(__("Print part labels"), () => printView("Design Part Labels"));
		this.page.add_menu_item(__("Export for CNC"), () => this.exportCnc());
		this.page.add_menu_item(__("Download GLB model"), () => this.exportGlb());
		this.page.add_menu_item(__("Download design JSON"), () => this.exportJson());
		this.page.add_menu_item(__("Material mapping"), () => frappe.set_route("List", "Design Material Map"));
		this.page.add_menu_item(__("Connection rules"), () => frappe.set_route("List", "Design Connection Rule"));
		this.page.add_menu_item(__("Parts library"), () => frappe.set_route("List", "Design Library Component"));
		this.page.add_menu_item(__("Designer settings"), () => frappe.set_route("Form", "Designer Settings"));

		window.addEventListener("beforeunload", (e) => {
			if (this.dirty) e.preventDefault();
		});
	}

	setupTools() {
		const $t = this.$root.find(".f3d-tools");
		const $v = this.$root.find(".f3d-viewbar");
		const btn = ($into, label, fn, title) =>
			$(`<button type="button" class="f3d-tool" title="${title || label}">${label}</button>`).appendTo($into).on("click", fn);

		const options = Object.entries(PRESETS)
			.map(([key, p]) => `<option value="${key}">${__(p.label)}</option>`)
			.join("");
		const $add = $(`<select class="f3d-add" aria-label="${__("Add part")}">
				<option value="">${__("Add part")}</option>
				<optgroup label="${__("Panels")}">${options}</optgroup>
			</select>`)
			.appendTo($t)
			.on("change", (e) => {
				const v = e.target.value;
				if (v.startsWith("lib:")) {
					const c = (this.library || []).find((x) => x.name === v.slice(4));
					if (c) this.addLibraryPart(c);
				} else if (v) {
					this.addPart(v);
				}
				e.target.value = "";
			});
		// screws, glue, handles, hinges... come from the parts library
		frappe.xcall("frappe_3d_designer.api.get_library").then((items) => {
			this.library = items || [];
			const groups = {};
			this.library.forEach((c) => (groups[c.category || "Other"] ||= []).push(c));
			Object.entries(groups).forEach(([cat, list]) => {
				$add.append(`<optgroup label="${frappe.utils.escape_html(__(cat))}">${list
					.map((c) => `<option value="lib:${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.name)}</option>`)
					.join("")}</optgroup>`);
			});
		});
		btn($t, __("From library"), () => this.libraryDialog(), __("Fittings, handles, legs and profiles"));
		btn($t, __("Cabinet"), () => this.cabinetDialog(), __("Build a parametric cabinet"));

		$(`<span class="f3d-gap"></span>`).appendTo($t);
		this.$dup = btn($t, __("Duplicate"), () => this.duplicate());
		this.$rot = btn($t, __("Rotate 90°"), () => this.rotate());
		this.$del = btn($t, __("Delete"), () => this.remove());

		$(`<span class="f3d-gap"></span>`).appendTo($t);
		const $explode = $(`<label class="f3d-explode">${__("Explode")}
				<input type="range" min="0" max="1.5" step="0.05" value="0"></label>`).appendTo($t);
		this.$explodeInput = $explode.find("input").on("input", (e) => {
			const f = parseFloat(e.target.value);
			this.core.setExplode(f);
			if (f > 0) this.transform.detach();
			else if (this.selected) this.transform.attach(this.core.meshFor(this.selected));
		});
		const $section = $(`<label class="f3d-explode">${__("Section")}
				<select class="f3d-add" aria-label="${__("Section axis")}">
					<option value="">${__("Off")}</option><option value="y">${__("Height")}</option>
					<option value="x">${__("Width")}</option><option value="z">${__("Depth")}</option>
				</select>
				<input type="range" min="0.02" max="0.98" step="0.01" value="0.6" disabled></label>`).appendTo($t);
		const applySection = () => {
			const axis = $section.find("select").val();
			$section.find("input").prop("disabled", !axis);
			this.core.setSection(axis, parseFloat($section.find("input").val()));
		};
		$section.find("select, input").on("input change", applySection);

		// view bar
		const $views = $(`<div class="f3d-seg" role="group" aria-label="${__("View")}"></div>`).appendTo($v);
		this.$viewButtons = {};
		[["3d", __("3D")], ["front", __("Front")], ["top", __("Top")], ["right", __("Side")]].forEach(([key, label]) => {
			this.$viewButtons[key] = btn($views, label, () => this.setView(key));
		});
		this.$viewButtons["3d"].addClass("is-on");

		this.$drill = btn($v, __("Drilling"), () => this.toggleDrilling(), __("Show boreholes from connection rules"));
		this.$present = btn($v, __("Presentation"), () => this.togglePresentation(), __("Realistic materials, light and shadows"));
		this.$render = btn($v, __("Save render"), () => this.saveRender(), __("Save a PNG to the design")).hide();
		this.$source = btn($v, __("Source model"), () => this.toggleSourceModel(), __("Overlay the uploaded GLB/GLTF file")).hide();
		btn($v, __("Fit view"), () => this.core.fit());
		this.updateToolState();
	}

	setView(view) {
		this.core.setView(view);
		Object.entries(this.$viewButtons).forEach(([k, $b]) => $b.toggleClass("is-on", k === view).attr("aria-pressed", k === view));
	}

	async toggleDrilling() {
		if (this.core.holes.children.length) {
			this.core.setHoles([]);
			this.$drill.removeClass("is-on");
			return;
		}
		if (!this.doc || this.dirty) return frappe.show_alert({ message: __("Save the design to see its drilling"), indicator: "orange" });
		const r = await frappe.xcall("frappe_3d_designer.api.get_workshop", { name: this.doc.name });
		this.core.setHoles(r.holes);
		this.$drill.addClass("is-on");
		frappe.show_alert(__("{0} holes from {1} joints", [r.holes.length, r.joints.length]));
	}

	togglePresentation() {
		const on = !this.core.presentation;
		this.core.setPresentation(on);
		this.$present.toggleClass("is-on", on).attr("aria-pressed", on);
		this.$render.toggle(on);
		this.select(this.selected);
	}

	async saveRender() {
		if (!this.doc || this.dirty) return frappe.show_alert({ message: __("Save the design first"), indicator: "orange" });
		this.transform.detach();
		this.core.group.children.forEach((m) => m.material.emissive?.setHex(0));
		const data_url = this.core.renderPNG(2);
		this.select(this.selected);
		await frappe.call({
			method: "frappe_3d_designer.api.save_render",
			args: { name: this.doc.name, data_url },
			freeze: true,
			freeze_message: __("Saving render"),
		});
		frappe.show_alert({ message: __("Render saved to the design"), indicator: "green" });
	}

	async exportCnc() {
		if (!this.doc || this.dirty) return frappe.show_alert({ message: __("Save the design first"), indicator: "orange" });
		const r = await frappe.call({
			method: "frappe_3d_designer.api.export_cnc",
			args: { name: this.doc.name },
			freeze: true,
			freeze_message: __("Preparing CNC files"),
		});
		window.open(r.message, "_blank");
	}

	setupTransform() {
		this.transform = new TransformControls(this.core.camera, this.core.renderer.domElement);
		this.transform.setTranslationSnap(5);
		this.transform.setSize(0.8);
		this.core.scene.add(this.transform);
		this.transform.addEventListener("dragging-changed", (e) => (this.core.orbit.enabled = !e.value));
		this.core.onCameraChange = (cam) => (this.transform.camera = cam);
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
		this.core.setHoles([]);
		this.$drill?.removeClass("is-on");
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

	cabinetDialog() {
		const d = new frappe.ui.Dialog({
			title: __("Cabinet"),
			fields: [
				{ fieldname: "width", fieldtype: "Float", label: __("Width (mm)"), default: 800, reqd: 1 },
				{ fieldname: "height", fieldtype: "Float", label: __("Height (mm)"), default: 720, reqd: 1 },
				{ fieldname: "depth", fieldtype: "Float", label: __("Depth (mm)"), default: 560, reqd: 1 },
				{ fieldname: "plinth", fieldtype: "Float", label: __("Plinth height (mm)"), default: 0, description: __("0 for none") },
				{ fieldname: "cb1", fieldtype: "Column Break" },
				{ fieldname: "thickness", fieldtype: "Float", label: __("Board thickness (mm)"), default: 18, reqd: 1 },
				{ fieldname: "shelves", fieldtype: "Int", label: __("Shelves"), default: 1 },
				{ fieldname: "doors", fieldtype: "Select", label: __("Doors"), options: "0\n1\n2", default: "2" },
				{ fieldname: "back", fieldtype: "Select", label: __("Back panel"), options: "Overlay\nInset in groove\nNone", default: "Overlay" },
				{ fieldname: "back_thickness", fieldtype: "Float", label: __("Back thickness (mm)"), default: 6 },
				{ fieldname: "replace", fieldtype: "Check", label: __("Replace current parts"), default: this.parts.length ? 0 : 1 },
			],
			primary_action_label: __("Build cabinet"),
			primary_action: (v) => {
				d.hide();
				this.buildCabinet(v);
			},
		});
		d.show();
	}

	buildCabinet(v) {
		const W = num(v.width), H = num(v.height), D = num(v.depth), T = num(v.thickness);
		const P = num(v.plinth), BT = num(v.back_thickness) || 6, Hc = H - P;
		if (W < 2 * T + 50 || Hc < 2 * T + 50 || D < 100) return frappe.msgprint(__("The cabinet is too small for this board thickness."));
		const offsetX = v.replace ? 0 : this.nextFreeX(W);
		const parts = [];
		const add = (key, o) => parts.push(this.newPart(key, { thickness_mm: T, ...o, pos_x: num(o.pos_x) + offsetX }));
		const inset = v.back === "Inset in groove";
		const groove = 8, backSetback = 20;

		add("side", { part_name: __("Left side"), length_mm: Hc, width_mm: D, pos_x: -(W / 2 - T / 2), pos_y: P + Hc / 2, grain: "Along Length" });
		add("side", { part_name: __("Right side"), length_mm: Hc, width_mm: D, pos_x: W / 2 - T / 2, pos_y: P + Hc / 2, grain: "Along Length" });
		add("top", { part_name: __("Bottom"), length_mm: W - 2 * T, width_mm: D, pos_y: P + T / 2, grain: "Along Length" });
		add("top", { part_name: __("Top"), length_mm: W - 2 * T, width_mm: D, pos_y: P + Hc - T / 2, grain: "Along Length" });

		let shelfBack = -D / 2;
		if (v.back === "Overlay") {
			add("back", { length_mm: W, width_mm: Hc, thickness_mm: BT, pos_y: P + Hc / 2, pos_z: -(D / 2 + BT / 2) });
		} else if (inset) {
			const z = -D / 2 + backSetback + BT / 2;
			add("back", { length_mm: W - 2 * T + 2 * groove, width_mm: Hc - 2 * T + 2 * groove, thickness_mm: BT, pos_y: P + Hc / 2, pos_z: z });
			shelfBack = z + BT / 2 + 1;
		}
		const shelves = Math.max(parseInt(v.shelves) || 0, 0);
		const shelfDepth = D / 2 - 10 - shelfBack;
		for (let i = 1; i <= shelves; i++) {
			add("shelf", {
				part_name: shelves > 1 ? __("Shelf {0}", [i]) : __("Shelf"),
				length_mm: W - 2 * T,
				width_mm: Math.round(shelfDepth),
				pos_y: Math.round(P + T + ((Hc - 2 * T) * i) / (shelves + 1)),
				pos_z: Math.round(shelfBack + shelfDepth / 2),
				grain: "Along Length",
			});
		}
		const doors = parseInt(v.doors) || 0;
		const doorW = (W - 4 - (doors - 1) * 3) / Math.max(doors, 1);
		for (let i = 0; i < doors; i++) {
			add("door", {
				part_name: doors === 1 ? __("Door") : i ? __("Right door") : __("Left door"),
				length_mm: Math.round(doorW),
				width_mm: Hc - 4,
				pos_x: -W / 2 + 2 + doorW / 2 + i * (doorW + 3),
				pos_y: P + Hc / 2,
				pos_z: D / 2 + T / 2 + 2,
				grain: "Along Width",
			});
		}
		if (P > 0) {
			add("top", { part_name: __("Plinth"), orientation: "Vertical Back", length_mm: W, width_mm: P, pos_y: P / 2, pos_z: D / 2 - 50, edge_band_long: 1 });
		}

		if (v.replace) this.parts.splice(0, this.parts.length);
		this.parts.push(...parts);
		this.core.setParts(this.parts);
		this.core.fit();
		this.select(null);
		this.markDirty();
	}

	nextFreeX(width) {
		const box = this.core.bounds();
		return box.isEmpty() ? 0 : Math.round(box.max.x + 100 + width / 2);
	}

	async libraryDialog() {
		const items = await frappe.xcall("frappe_3d_designer.api.get_library");
		const d = new frappe.ui.Dialog({
			title: __("Parts library"),
			size: "large",
			fields: [
				{ fieldname: "search", fieldtype: "Data", label: __("Search"), placeholder: __("Hinge, handle, leg ...") },
				{ fieldname: "list", fieldtype: "HTML" },
			],
		});
		const render = () => {
			const q = (d.get_value("search") || "").toLowerCase();
			const rows = items.filter((c) => !q || `${c.name} ${c.category} ${c.item_code}`.toLowerCase().includes(q));
			const $list = d.get_field("list").$wrapper.empty();
			if (!items.length) {
				$list.html(`<p class="text-muted">${__("The library is empty.")} <a href="/app/design-library-component/new">${__("Add a component")}</a></p>`);
				return;
			}
			const $grid = $(`<div class="f3d-lib"></div>`).appendTo($list);
			rows.forEach((c) => {
				const thumb = c.image
					? `<img src="${encodeURI(c.image)}" alt="">`
					: `<span class="f3d-thumb" style="background:${HARDWARE_COLOR}"></span>`;
				$(`<button type="button">${thumb}
						<strong>${frappe.utils.escape_html(c.name)}</strong>
						<small>${frappe.utils.escape_html(c.category || "")} ${c.length_mm ? `${num(c.length_mm)} × ${num(c.width_mm)} × ${num(c.thickness_mm)}` : ""}</small>
					</button>`)
					.appendTo($grid)
					.on("click", () => {
						d.hide();
						this.addLibraryPart(c);
					});
			});
		};
		d.fields_dict.search.$input.on("input", render);
		render();
		d.show();
	}

	addLibraryPart(c) {
		const p = normalisePart({
			part_name: c.name,
			item_code: c.item_code,
			shape: c.shape || "Box",
			orientation: c.orientation || "Horizontal",
			length_mm: num(c.length_mm) || 50,
			width_mm: num(c.width_mm) || 20,
			thickness_mm: num(c.thickness_mm) || 20,
			qty: parseInt(c.default_qty) || 1,
		});
		const ref = this.selected;
		if (ref) {
			p.pos_x = ref.pos_x;
			p.pos_y = ref.pos_y;
			p.pos_z = ref.pos_z + partSize(ref).z / 2 + partSize(p).z / 2;
		} else {
			p.pos_y = partSize(p).y / 2;
		}
		this.parts.push(p);
		this.core.replaceMesh(p);
		this.select(p);
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
				`<p class="f3d-hint">${__("Build a cabinet, add parts or pick fittings from the library. You can also upload a GLB, OBJ or cut list on the Design Project form.")}</p>`
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
			{ fieldname: "shape", fieldtype: "Select", label: __("Shape"), options: "Box\nCylinder", change: onChange("shape") },
			{ fieldname: "grain", fieldtype: "Select", label: __("Grain"), options: "\nAlong Length\nAlong Width", change: onChange("grain") },
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
			${this.doc?.total_sheets && !this.dirty ? `<span>${__("{0} sheets", [this.doc.total_sheets])}</span>` : ""}
			${this.doc?.total_connectors && !this.dirty ? `<span>${__("{0} connectors", [this.doc.total_connectors])}</span>` : ""}
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
