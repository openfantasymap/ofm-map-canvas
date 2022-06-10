class MapDialog extends FormApplication {

    constructor(object, options) {
        super(object, options);

        // Using window['mapcanvas'] as a way to track dialog state. Not ideal.
        window['ofmmapcanvas'].dialogActive = true;
        window['ofmmapcanvas'].apiLoaded = false;

        Hooks.once('renderApplication', async () => {
            if(!window['ofmmapcanvas'].apiLoaded) {
                await $.getScript('https://polyfill.io/v3/polyfill.min.js?features=default', () => {});
                await $.getScript('https://unpkg.com/maplibre-gl@2.1.9/dist/maplibre-gl.js', () => {});
                const LICENSE = game.settings.get("ofm-map-canvas", "LICENSE");
                //window['ofmmapcanvas'].options = await $.getJSON('https://vectors.fantasymaps.org/options/?key=' + LICENSE);
                window['ofmmapcanvas'].apiLoaded = true;  // We assume.
            }


            MapDialog.initMap();
        });

        Hooks.on('mapCanvasToggleLabels', this.toggleLabels);
        MapDialog.labelsOn = true;
    }

    static get defaultOptions() {
        let opts = super.defaultOptions;
        opts.id = "ofmMapCanvasDialog";
        opts.base = "ofmc_";
        opts.title = "FantasyMaps.org Canvas";
        opts.template = "modules/ofm-map-canvas/templates/map-canvas.html";
        opts.resizable = true;
        opts.isEditable = false;
        opts.closeOnSubmit = false;
        opts.popOut = true;
        return opts;
    }

    static getMapStyle() {
        let styleJSON = [];


        return styleJSON;
    }

    static initMap(center) {

        MapDialog.mapPortal = {};
        MapDialog.mapPortalElem = document.querySelector('#mapPortal');
        MapDialog.zoomLevelElem = document.querySelector('#mapCanvasZoomLevel');
        MapDialog.lonElem = document.querySelector('#mapCanvasLon');
        MapDialog.latElem = document.querySelector('#mapCanvasLat');
        MapDialog.timeElem = document.querySelector('#mapCanvasTime');
        MapDialog.viewport = {};
        MapDialog.viewportData = document.querySelector('#mapData');

        const WORLD_TO_LOAD = game.settings.get("ofm-map-canvas", "WORLD_TO_LOAD");
        let localStyle = "";
        if (WORLD_TO_LOAD === "osm"){
            localStyle = 'https://api.maptiler.com/maps/streets/style.json?key=RjQQbPOWzLIiBsj333Xv';
        } else if (WORLD_TO_LOAD === 'ohm') {
            localStyle = '';
        } else {
            localStyle = 'https://static.fantasymaps.org/' + WORLD_TO_LOAD + '/map.json';
        }
        MapDialog.mapPortal = new maplibregl.Map({
            container: 'mapPortal',
            style: localStyle, // stylesheet location
            center: [12.986957228973097,43.791492389927406 ], // starting position [lng, lat]
            zoom: 11, // starting zoom,
        });
        MapDialog.mapPortal.dragRotate.disable();
        MapDialog.mapPortal.touchZoomRotate.disableRotation();

        MapDialog.mapPortal.on('moveend', async (e) => {
            const {lng, lat} = MapDialog.mapPortal.getCenter();
            MapDialog.zoomLevelElem.value = MapDialog.mapPortal.getZoom();
            MapDialog.latElem.value = lat;
            MapDialog.lonElem.value = lng;
            MapDialog.viewport = {zoom: MapDialog.mapPortal.getZoom(), bounds: MapDialog.mapPortal.getBounds()};
            MapDialog.viewportData.value = JSON.stringify(MapDialog.viewport);
        });
    }

    // Adapted from: https://developers.google.com/maps/documentation/javascript/examples/places-searchbox
    static initAutocomplete(map, input) {
        const searchBox = new google.maps.places.SearchBox(input);

        map.addListener("bounds_changed", () => {
            searchBox.setBounds(map.getBounds());
        });

        // Listen for the event fired when the user selects a prediction and retrieve
        // more details for that place.
        searchBox.addListener("places_changed", () => {
            const places = searchBox.getPlaces();

            if (places.length === 0) {
                return;
            }

            // For each place, get the icon, name and location.
            const bounds = new google.maps.LatLngBounds();

            places.forEach((place) => {
                if (!place.geometry || !place.geometry.location) {
                    console.log("Returned place contains no geometry");
                    return;
                }

                if (place.geometry.viewport) {
                    // Only geocodes have viewport.
                    bounds.union(place.geometry.viewport);
                } else {
                    bounds.extend(place.geometry.location);
                }
            });
            map.fitBounds(bounds);
        });

        if(SimpleCalendar){
            Hooks.on(SimpleCalendar.Hooks.DateTimeChange, (data) => {
                console.log(data);
              });             
        }

    }

    toggleLabels() {
        
    }

    getData(options = {}) {
        return super.getData().object;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }

    async _updateObject(event, formData) {
        // TODO: Rethink / Reimplement how we can properly rehydrate a dialog box where users last left it.
        window['ofmmapcanvas'].lastSearch = formData.mapCanvasSearchBox
        this.object = { searchValue: formData.mapCanvasSearchBox, portalActive: true };
    }

    async close() {
        window['ofmmapcanvas'].dialogActive = false;
        window['ofmmapcanvas'].dialog = {}
        await super.close();
    }
}

class MapCanvas extends Application {

    constructor(object, options) {
        super(object, options)

        window['ofmmapcanvas'] = { dialogActive: false, apiLoaded: false };

        $.getScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.3.2/html2canvas.min.js', () => { /* import html2canvas */ });

        Hooks.on("getSceneControlButtons", (controls) => this.addControls(controls));
        Hooks.on('mapCanvasGenerateScene', () => this.updateScene(true));
        Hooks.on('mapCanvasUpdateScene', this.updateScene);

        // Register our settings
        Hooks.once('init', () => {
            MapCanvas.registerSettings(options).then(() => console.log("MapCanvas Settings Registered."));
        });

        Hooks.on('fileUtilsReady', (fileUtils) => {
            window.fileUtils = fileUtils;
        })
    }

    addControls(controls) {
        if (game.user.isGM) {

            const canvasTools = [
                {
                    active: true,
                    name: "mapdialog",
                    title: "Open Map Dialog",
                    icon: "fas fa-map-marker-alt",
                    button: true,
                    toggle: true,
                    onClick: _ => {
                        this.openDialog();
                    }
                },
                {
                    active: false,
                    name: "purgetemp",
                    title: "Purge Generated Scenes",
                    icon: "fas fa-backspace",
                    button: true,
                    toggle: true,
                    onClick: _ => {
                        const SCENE_NAME = game.settings.get("map-canvas", "DEFAULT_SCENE");
                        game.scenes.filter(s => s.name.startsWith(SCENE_NAME+"_")).forEach((a) => {
                            game.scenes.get(a.id).delete();
                        });
                    }
                }
            ]

            const hudControl = {
                name: "ofmmapcanvas",
                title: "OFM Map Canvas",
                icon: "fas fa-globe",
                layer: "controls",
                tools: canvasTools,
            }

            controls.push(hudControl);
        }
    }

    openDialog() {
        if (!window['ofmmapcanvas'].dialogActive) { window['ofmmapcanvas'].dialogActive = true } else { return }
        window['ofmmapcanvas'].dialog = new MapDialog();
        window['ofmmapcanvas'].dialog.render(true, {
            width: 1100,
            height: 850
        });
    }

    async updateScene(generateNewScene = false) {
        const LICENSE = game.settings.get("ofm-map-canvas", "LICENSE");
        const WORLD_TO_LOAD = game.settings.get("ofm-map-canvas", "WORLD_TO_LOAD");
        let WIDTH = game.settings.get("ofm-map-canvas", "WIDTH");
        let HEIGHT = game.settings.get("ofm-map-canvas", "HEIGHT");

        console.log('getting walls and lights for...')
        const doc = document.querySelector('#mapData').value;
        const jdoc = JSON.parse(doc);
        console.log(jdoc)

        if(jdoc.zoom < 18.5){
            alert('I cannot render a battlemap at this level of zoom');
            return false;
        }
        const DEFAULT_SCENE = game.settings.get("ofm-map-canvas", "DEFAULT_SCENE");
        const sceneName = (generateNewScene) ? DEFAULT_SCENE+"_"+new Date().getTime() : DEFAULT_SCENE;
        let scene = game.scenes.find(s => s.name.startsWith(sceneName));

        if(!scene) {
            // Create our scene if we don't have it.
            await Scene.create({name: sceneName }).then(s => {
                scene = s;
                ui.notifications.info('Map Canvas | Created scene: '+sceneName);
            });
        }

        if (WORLD_TO_LOAD === 'osm'){
            WIDTH *= 2;
            HEIGHT *= 2;
        }


        const bbox = [jdoc.bounds._sw.lng, jdoc.bounds._sw.lat, jdoc.bounds._ne.lng, jdoc.bounds._ne.lat];

        const vectors = await $.getJSON('https://vectors.fantasymaps.org/vectors/'+ WORLD_TO_LOAD +'?width='+WIDTH+'&height='+HEIGHT+'&bbox=['+bbox.join(',')+']&zoom='+jdoc.zoom+'&key=LICENSE');

        console.log(vectors.tiles);



        if (!generateNewScene) {
            await canvas.lighting.deleteAll();
            await canvas.walls.deleteAll();
            await canvas.tokens.deleteAll();
            await canvas.foreground.objects.destroy();
            await canvas.background.objects.destroy()
            await canvas.sight.resetFog();
        }

        //await const fileUtils = game.modules.get('foundry-file-utils');
        try{
            await FilePicker.createDirectory('data', 'ofm-map-canvas');
        } catch(ex){ }

        const url = 'https://vectors.fantasymaps.org/render/' + WORLD_TO_LOAD + '.jpeg?width='+WIDTH+'&height='+HEIGHT+'&bbox=[' + bbox.join(',') + ']&zoom=' + jdoc.zoom + '&key=LICENSE';
        const data = await fetch(url);
        const fil = new File([await data.blob()], scene.id+'.jpeg');
        await FilePicker.upload('data', 'ofm-map-canvas', scene.id);


        let updates = {
            _id: scene.id,
            width: WIDTH,
            height: HEIGHT,
            bgSource: 'ofm-map-canvas/'+scene.id+".jpeg",
            //img: 'https://vectors.fantasymaps.org/render/' + WORLD_TO_LOAD + '.jpeg?width='+WIDTH+'&height='+HEIGHT+'&bbox=[' + bbox.join(',') + ']&zoom=' + jdoc.zoom + '&key=LICENSE',
            padding: 0,
            gridType: 1,
            grid:50,
            gridColor:"#000000",
            gridAlpha:0.2,
            gridDistance:5,
            gridUnits:"ft",
            walls: vectors.walls,
            lights: vectors.lights,
            //tokens: vectors.tokens,
            tiles: vectors.tiles,
        };     
        
        //if(WORLD_TO_LOAD === 'osm'){
        //    updates['bgSource'] = 'https://vectors.fantasymaps.org/render/osm.jpeg?width='+WIDTH+'&height='+HEIGHT+'&bbox=[' + bbox.join(',') + ']&zoom=' + jdoc.zoom + '&key=LICENSE';
        //} else {
        //    updates['bgSource'] = 'https://vectors.fantasymaps.org/render/' + WORLD_TO_LOAD + '.jpeg?width='+WIDTH+'&height='+HEIGHT+'&bbox=[' + bbox.join(',') + ']&zoom=' + jdoc.zoom + '&key=LICENSE';
        //}

        await Scene.updateDocuments([updates]).then(() => {
            ui.notifications.info(" Map Canvas | Updated Scene: " + sceneName)
        });
    }

    // TODO: Kinda violates single-responsibility principle, method should be moved to the MapDialog class.
    static async getMapCanvasImage() {
        let tempImage = new Image();
        let imageDems = {};

        function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms) ) }
        await sleep(100); // Hack to give the maps api time to remove the controls.

        await html2canvas(document.querySelector("#mapPortal"), { useCORS: true }).then( mapCanvas => {
           // simple hack to get image size from data urls.
           tempImage.onload = (_) => {
               imageDems = { width: _.currentTarget.naturalWidth, height: _.currentTarget.naturalHeight }
           };
           tempImage.src = mapCanvas.toDataURL();
        });

        //MapDialog.mapPortal.setOptions({ disableDefaultUI: false }); // Put the map controls back.

        return { dataUrl: tempImage.src, dems: imageDems } ;
    } 

    static async registerSettings(options) {

        
        await game.settings.register('ofm-map-canvas', 'DEFAULT_SCENE', {
            name: 'Default Scene Name',
            hint: 'Used when running canvas updates.',
            scope: 'world',
            config: true,
            type: String,
            default: "MapCanvasScene",
            filePicker: false,
        });

        
        await game.settings.register('ofm-map-canvas', 'LICENSE', {
            name: 'License Key',
            hint: 'Go to Fantasymaps.org or [patreon] to get a license key for the special features.',
            scope: 'world',
            config: true,
            type: String,
            default: null,
            filePicker: false,
        });

        console.log(window['ofmmapcanvas'].options);
        await game.settings.register('ofm-map-canvas', 'WORLD_TO_LOAD', {
            name: 'Fantasy Map to load',
            hint: 'Fantasy map to load',
            scope: 'world',
            config: true,
            default: 'toril',
            choices: {
                toril: "Toril",
                barovia: "Barovia",
                osm: "OpenStreetMap",
            },
            type: String
        });

        await game.settings.register('ofm-map-canvas', 'WIDTH', {
            name: 'Width of the scene',
            hint: 'Width of the scene to use',
            scope: 'world',
            config: true,
            type: Number,
            default: 2400,
            filePicker: false,
        });
        
        await game.settings.register('ofm-map-canvas', 'HEIGHT', {
            name: 'Height of the scene',
            hint: 'Height of the scene to use',
            scope: 'world',
            config: true,
            type: Number,
            default: 1600,
            filePicker: false,
        });

    }

    // A failed stab at canvas based image scaling lifted from SO for rendering cleaner scaled scene backgrounds.
    static canvasScale(img, dems, scale = 2) {
        let src_canvas = document.createElement('canvas');
        src_canvas.width = dems.width;
        src_canvas.height = dems.height;

        console.log("Dems: ", dems.width);

        let src_ctx = src_canvas.getContext('2d');
        src_ctx.drawImage(img, 0, 0);
        let src_data = src_ctx.getImageData(0, 0, 640, 480).data;

        let sw = dems.width * scale;
        let sh = dems.height * scale;

        console.log({ sw: sw, sh: sh });
        let dst_canvas = document.createElement('canvas');
        dst_canvas.width = sw;
        dst_canvas.height = sh;
        let dst_ctx = dst_canvas.getContext('2d');

        let dst_imgdata = dst_ctx.createImageData(200, 200);
        let dst_data = dst_imgdata.data;

        let src_p = 0;
        let dst_p = 0;
        for (let y = 0; y < this.height; ++y) {
            for (let i = 0; i < scale; ++i) {
                for (let x = 0; x < this.width; ++x) {
                    let src_p = 4 * (y * this.width + x);
                    for (let j = 0; j < scale; ++j) {
                        let tmp = src_p;
                        dst_data[dst_p++] = src_data[tmp++];
                        dst_data[dst_p++] = src_data[tmp++];
                        dst_data[dst_p++] = src_data[tmp++];
                        dst_data[dst_p++] = src_data[tmp++];
                    }
                }
            }
        }
        dst_ctx.putImageData(dst_imgdata, 0, 0);
        console.log(dst_canvas);
        return dst_canvas.toDataURL();
    }

}

const mapCanvas = new MapCanvas();