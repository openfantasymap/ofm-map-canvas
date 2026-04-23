const MODULE_ID = "ofm-map-canvas";

const state = {
    dialogActive: false,
    dialog: null,
    lastSearch: ""
};

class MapDialog extends FormApplication {

    constructor(object = {}, options = {}) {
        super(object, options);
        state.dialogActive = true;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ofmMapCanvasDialog",
            title: "FantasyMaps.org Canvas",
            template: `modules/${MODULE_ID}/templates/map-canvas.html`,
            width: 1100,
            height: 850,
            resizable: true,
            editable: false,
            closeOnSubmit: false,
            popOut: true
        });
    }

    getData() {
        return { lastSearch: state.lastSearch };
    }

    activateListeners(html) {
        super.activateListeners(html);

        const root = html[0] ?? html;
        this.mapPortalElem = root.querySelector('#mapPortal');
        this.zoomLevelElem = root.querySelector('#mapCanvasZoomLevel');
        this.lonElem = root.querySelector('#mapCanvasLon');
        this.latElem = root.querySelector('#mapCanvasLat');
        this.generateBtn = root.querySelector('#generateBtn');
        this.viewportData = root.querySelector('#mapData');

        root.querySelector('#generateBtn')?.addEventListener('click', () => Hooks.call('mapCanvasGenerateScene'));

        this._initMap();
    }

    _initMap() {
        const WORLD_TO_LOAD = game.settings.get(MODULE_ID, "WORLD_TO_LOAD");
        let style;
        if (WORLD_TO_LOAD === "osm") {
            style = 'https://api.maptiler.com/maps/streets/style.json?key=RjQQbPOWzLIiBsj333Xv';
        } else if (WORLD_TO_LOAD === 'ohm') {
            style = '';
        } else {
            style = `https://static.fantasymaps.org/${WORLD_TO_LOAD}/map.json`;
        }

        this.mapPortal = new maplibregl.Map({
            container: this.mapPortalElem,
            style,
            center: [12.986957228973097, 43.791492389927406],
            zoom: 11
        });
        this.mapPortal.dragRotate.disable();
        this.mapPortal.touchZoomRotate.disableRotation();

        this.mapPortal.on('moveend', () => {
            const { lng, lat } = this.mapPortal.getCenter();
            const zoom = this.mapPortal.getZoom();
            this.zoomLevelElem.value = zoom;
            this.latElem.value = lat;
            this.lonElem.value = lng;
            const viewport = { zoom, bounds: this.mapPortal.getBounds() };
            this.viewportData.value = JSON.stringify(viewport);
            const withWalls = zoom > 18.5 ? " " : "out ";
            this.generateBtn.value = `Generate Scene (with${withWalls}walls)`;
        });
    }

    async _updateObject(event, formData) {
        state.lastSearch = formData.mapCanvasSearchBox ?? "";
    }

    async close(options) {
        state.dialogActive = false;
        state.dialog = null;
        return super.close(options);
    }
}

class MapCanvas {

    constructor() {
        Hooks.once('init', () => MapCanvas.registerSettings());
        Hooks.on("getSceneControlButtons", (controls) => this.addControls(controls));
        Hooks.on('mapCanvasGenerateScene', () => this.updateScene(true));
        Hooks.on('mapCanvasUpdateScene', () => this.updateScene(false));
        Hooks.on('ofmSharedWorldUpdateScene', (args) => this.sharedUpdateScene(args));
    }

    addControls(controls) {
        if (!game.user.isGM) return;

        const tools = [
            {
                name: "mapdialog",
                title: "Open Map Dialog",
                icon: "fas fa-map-marker-alt",
                button: true,
                onClick: () => this.openDialog()
            },
            {
                name: "purgetemp",
                title: "Purge Generated Scenes",
                icon: "fas fa-backspace",
                button: true,
                onClick: () => {
                    const sceneName = game.settings.get(MODULE_ID, "DEFAULT_SCENE");
                    for (const s of game.scenes.filter(s => s.name.startsWith(sceneName + "_"))) {
                        s.delete();
                    }
                }
            }
        ];

        const hudControl = {
            name: "ofmmapcanvas",
            title: "OFM Map Canvas",
            icon: "fas fa-globe",
            layer: "controls",
            tools
        };

        // v13 may pass controls as an object keyed by name; v11/v12 pass an array.
        if (Array.isArray(controls)) controls.push(hudControl);
        else controls[hudControl.name] = hudControl;
    }

    openDialog() {
        if (state.dialogActive) return;
        state.dialog = new MapDialog();
        state.dialog.render(true);
    }

    async sharedUpdateScene(args) {
        await this.imgUpdateScene(...args);
    }

    async updateScene(generateNewScene = false) {
        const LICENSE = game.settings.get(MODULE_ID, "LICENSE");
        const RENDER_MODE = game.settings.get(MODULE_ID, "RENDER_MODE");
        const WORLD_TO_LOAD = game.settings.get(MODULE_ID, "WORLD_TO_LOAD");
        let WIDTH = game.settings.get(MODULE_ID, "WIDTH");
        let HEIGHT = game.settings.get(MODULE_ID, "HEIGHT");

        const raw = document.querySelector('#mapData')?.value;
        if (!raw) {
            ui.notifications.warn("Map Canvas | Move the map before generating a scene.");
            return;
        }
        const jdoc = JSON.parse(raw);

        const DEFAULT_SCENE = game.settings.get(MODULE_ID, "DEFAULT_SCENE");
        const sceneName = generateNewScene ? `${DEFAULT_SCENE}_${Date.now()}` : DEFAULT_SCENE;
        let scene = game.scenes.find(s => s.name.startsWith(sceneName));

        if (!scene) {
            scene = await Scene.create({ name: sceneName });
            ui.notifications.info(`Map Canvas | Created scene: ${sceneName}`);
        }

        if (WORLD_TO_LOAD === 'osm') {
            WIDTH *= 2;
            HEIGHT *= 2;
        }

        const bbox = [jdoc.bounds._sw.lng, jdoc.bounds._sw.lat, jdoc.bounds._ne.lng, jdoc.bounds._ne.lat];
        await this.imgUpdateScene(scene.id, sceneName, WORLD_TO_LOAD, WIDTH, HEIGHT, bbox, jdoc.zoom, LICENSE, RENDER_MODE, generateNewScene);
    }

    async imgUpdateScene(sceneId, sceneName, WORLD_TO_LOAD, WIDTH, HEIGHT, bbox, ZOOM, LICENSE, RENDER_MODE, generateNewScene) {
        const scene = game.scenes.get(sceneId);
        if (!scene) {
            ui.notifications.error(`Map Canvas | Scene ${sceneId} not found.`);
            return;
        }

        const vectorsUrl = `https://vectors.fantasymaps.org/vectors/${WORLD_TO_LOAD}?width=${WIDTH}&height=${HEIGHT}&bbox=[${bbox.join(',')}]&zoom=${ZOOM}&key=${LICENSE}`;
        const vectors = await fetch(vectorsUrl).then(r => r.json());

        if (!generateNewScene) {
            const wallIds = scene.walls.map(w => w.id);
            const lightIds = scene.lights.map(l => l.id);
            const tokenIds = scene.tokens.map(t => t.id);
            const tileIds = scene.tiles.map(t => t.id);
            if (wallIds.length) await scene.deleteEmbeddedDocuments("Wall", wallIds);
            if (lightIds.length) await scene.deleteEmbeddedDocuments("AmbientLight", lightIds);
            if (tokenIds.length) await scene.deleteEmbeddedDocuments("Token", tokenIds);
            if (tileIds.length) await scene.deleteEmbeddedDocuments("Tile", tileIds);
        }

        try {
            await FilePicker.createDirectory('data', MODULE_ID);
        } catch (_) { /* already exists */ }

        const renderUrl = `https://vectors.fantasymaps.org/render/${WORLD_TO_LOAD}.jpeg?width=${WIDTH}&height=${HEIGHT}&bbox=[${bbox.join(',')}]&zoom=${ZOOM}&key=${LICENSE}&mode=${RENDER_MODE}`;
        const blob = await fetch(renderUrl).then(r => r.blob());
        const file = new File([blob], `${sceneName}.jpeg`);
        await FilePicker.upload('data', MODULE_ID, file);

        const bgPath = `${MODULE_ID}/${sceneName}.jpeg`;
        const updates = {
            _id: sceneId,
            width: WIDTH,
            height: HEIGHT,
            background: { src: bgPath },
            padding: 0,
            grid: {
                type: 1,
                size: 50,
                color: "#000000",
                alpha: 0.2,
                distance: 5,
                units: "ft"
            },
            walls: vectors.walls,
            lights: vectors.lights,
            tiles: vectors.tiles,
            flags: {
                ofm: {
                    world: WORLD_TO_LOAD,
                    bbox,
                    license: LICENSE,
                    renderArgs: [sceneId, sceneName, WORLD_TO_LOAD, WIDTH, HEIGHT, bbox, ZOOM, LICENSE, RENDER_MODE, false]
                }
            }
        };

        await Scene.updateDocuments([updates]);
        ui.notifications.info(`Map Canvas | Updated Scene: ${sceneName}`);
    }

    static async registerSettings() {
        game.settings.register(MODULE_ID, 'DEFAULT_SCENE', {
            name: 'Default Scene Name',
            hint: 'Used when running canvas updates.',
            scope: 'world',
            config: true,
            type: String,
            default: "MapCanvasScene"
        });

        game.settings.register(MODULE_ID, 'LICENSE', {
            name: 'License Key',
            hint: 'Go to <a href="https://www.fantasymaps.org" target="_blank">Fantasymaps.org</a> or <a href="https://www.patreon.com/openfantasymap" target="_blank">Patreon</a> for a license key.',
            scope: 'world',
            config: true,
            type: String,
            default: ""
        });

        game.settings.register(MODULE_ID, 'WORLD_TO_LOAD', {
            name: 'Map to load',
            hint: 'Which vector world to load.',
            scope: 'world',
            config: true,
            type: String,
            default: 'toril',
            choices: {
                toril: "FantasyMaps: Toril",
                barovia: "FantasyMaps: Barovia",
                rock_of_bral_upper: "FantasyMaps: Rock of Bral - Upper side",
                "rock_of_bral_upper-openworld": "FantasyMaps: Rock of Bral - Upper side (OW)",
                rock_of_bral_lower: "FantasyMaps: Rock of Bral - Lower side",
                osm: "OpenStreetMap: Real World"
            }
        });

        game.settings.register(MODULE_ID, 'RENDER_MODE', {
            name: 'Render Mode',
            hint: 'Default is aerial for OSM and drawn for anything else.',
            scope: 'world',
            config: true,
            type: String,
            default: 'default',
            choices: {
                default: "Default",
                photo: "Aerial Photo",
                draw: "Drawn Render"
            }
        });

        game.settings.register(MODULE_ID, 'WIDTH', {
            name: 'Scene width',
            hint: 'Width of the generated scene in pixels.',
            scope: 'world',
            config: true,
            type: Number,
            default: 2400
        });

        game.settings.register(MODULE_ID, 'HEIGHT', {
            name: 'Scene height',
            hint: 'Height of the generated scene in pixels.',
            scope: 'world',
            config: true,
            type: Number,
            default: 1600
        });
    }
}

new MapCanvas();
