const txtr = require('txtr');

const LIGHTMAP_PLUGIN = 'plugins-lightmap';
const DAY_NIGHT_SKYBOX_PLUGIN = 'plugins-day-night-skybox';
const CRAFT_PLUGIN = 'plugins-craft';

const {
  NUM_CELLS,

  NUM_CELLS_HEIGHT,
  HEIGHT_OFFSET,

  RANGE,
} = require('./lib/constants/constants');
const protocolUtils = require('./lib/utils/protocol-utils');
const objectsLib = require('./lib/objects/index');

const NUM_POSITIONS_CHUNK = 5 * 1024 * 1024;
const TEXTURE_SIZE = 512;
const DEFAULT_SIZE = 0.1;

class Objects {
  mount() {
    const {three, pose, input, elements, render, utils: {js: {events, bffr}, hash: {murmur}, random: {chnkr}}} = zeo;
    const {THREE, scene} = three;
    const {EventEmitter} = events;

    const OBJECTS_SHADER = {
      uniforms: {
        map: {
          type: 't',
          value: null,
        },
        lightMap: {
          type: 't',
          value: null,
        },
        d: {
          type: 'v2',
          value: new THREE.Vector2(),
        },
        sunIntensity: {
          type: 'f',
          value: 0,
        },
      },
      vertexShader: `\
        precision highp float;
        precision highp int;
        /*uniform mat4 modelMatrix;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat3 normalMatrix;
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 uv; */

        varying vec3 vPosition;
        varying vec2 vUv;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4( position.xyz, 1.0 );
          gl_Position = projectionMatrix * mvPosition;

          vUv = uv;

          vPosition = position.xyz;
        }
      `,
      fragmentShader: `\
        precision highp float;
        precision highp int;
        #define ALPHATEST 0.7
        #define DOUBLE_SIDED
        // uniform mat4 viewMatrix;
        uniform vec3 ambientLightColor;
        uniform sampler2D map;
        uniform sampler2D lightMap;
        uniform vec2 d;
        uniform float sunIntensity;

        varying vec3 vPosition;
        varying vec2 vUv;

        void main() {
          vec4 diffuseColor = texture2D( map, vUv );

          float u = (
            floor(clamp(vPosition.x - d.x, 0.0, ${(NUM_CELLS).toFixed(8)})) +
            (floor(clamp(vPosition.z - d.y, 0.0, ${(NUM_CELLS).toFixed(8)})) * ${(NUM_CELLS + 1).toFixed(8)}) +
            0.5
          ) / (${(NUM_CELLS + 1).toFixed(8)} * ${(NUM_CELLS + 1).toFixed(8)});
          float v = (floor(vPosition.y - ${HEIGHT_OFFSET.toFixed(8)}) + 0.5) / ${NUM_CELLS_HEIGHT.toFixed(8)};
          vec3 lightColor = texture2D( lightMap, vec2(u, v) ).rgb * 1.0;

        #ifdef ALPHATEST
          if ( diffuseColor.a < ALPHATEST ) discard;
        #endif

          vec3 outgoingLight = (ambientLightColor * 0.2 + diffuseColor.rgb) * (0.1 + sunIntensity * 0.9) +
            diffuseColor.rgb * (
              min((lightColor.rgb - 0.5) * 2.0, 0.0) * sunIntensity +
              max((lightColor.rgb - 0.5) * 2.0, 0.0) * (1.0 - sunIntensity)
            );

          gl_FragColor = vec4( outgoingLight, diffuseColor.a );
        }
      `
    };

    const zeroVector = new THREE.Vector3();
    const localVector = new THREE.Vector3();

    const cleanups = [];
    this._cleanup = () => {
      for (let i = 0; i < cleanups.length; i++) {
        const cleanup = cleanups[i];
        cleanup();
      }
    };

    const buffers = bffr(NUM_POSITIONS_CHUNK, (RANGE + 1) * (RANGE + 1) * 2);
    const textures = txtr(TEXTURE_SIZE, TEXTURE_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    const textureAtlas = new THREE.Texture(
      canvas,
      THREE.UVMapping,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.NearestFilter,
      THREE.NearestFilter,
      // THREE.LinearMipMapLinearFilter,
      // THREE.LinearMipMapLinearFilter,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
      1
      // 16
    );

    const worker = new Worker('archae/plugins/_plugins_objects/build/worker.js');
    const queue = [];
    worker.requestRegisterGeometry = (name, fn) => {
      const {args, src} = _parseFunction(fn);
      worker.postMessage({
        type: 'registerGeometry',
        name,
        args,
        src,
      });
      return Promise.resolve();
    };
    worker.requestRegisterGenerator = (name, fn) => {
      const {args, src} = _parseFunction(fn);
      worker.postMessage({
        type: 'registerGenerator',
        name,
        args,
        src,
      });
      return Promise.resolve();
    };
    worker.requestRegisterTexture = (name, uv) => {
      worker.postMessage({
        type: 'registerTexture',
        name,
        uv,
      });
      return Promise.resolve();
    };
    worker.requestAddObject = (name, position) => {
      worker.postMessage({
        type: 'addObject',
        name,
        position: position.toArray(),
      });
      return Promise.resolve();
    };
    worker.requestRemoveObject = (x, z, index) => {
      worker.postMessage({
        type: 'removeObject',
        x,
        z,
        index,
      });
      return Promise.resolve();
    };
    worker.requestGenerate = (x, z) => new Promise((accept, reject) => {
      const buffer = buffers.alloc();
      worker.postMessage({
        type: 'generate',
        x,
        z,
        buffer,
      });
      queue.push(buffer => {
        accept(buffer);
      });
    });
    worker.onmessage = e => {
      const {data: buffer} = e;
      const cb = queue.shift();
      cb(buffer);
    };

    const _requestObjectsGenerate = (x, z) => worker.requestGenerate(x, z)
      .then(objectsChunkBuffer => protocolUtils.parseGeometry(objectsChunkBuffer));
    const _makeObjectsChunkMesh = (objectsChunkData, x, z) => {
      const mesh = (() => {
        const geometry = (() => {
          const {positions, uvs, indices} = objectsChunkData;
          const geometry = new THREE.BufferGeometry();
          geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
          geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
          const maxY = 64;
          const minY = -16;
          geometry.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(
              (x * NUM_CELLS) + (NUM_CELLS / 2),
              (minY + maxY) / 2,
              (z * NUM_CELLS) + (NUM_CELLS / 2)
            ),
            Math.max(Math.sqrt((NUM_CELLS / 2) * (NUM_CELLS / 2) * 3), (maxY - minY) / 2) // XXX really compute this
          );

          return geometry;
        })();
        const uniforms = THREE.UniformsUtils.clone(OBJECTS_SHADER.uniforms);
        uniforms.map.value = textureAtlas;
        uniforms.d.value.set(x * NUM_CELLS, z * NUM_CELLS);
        const material = new THREE.ShaderMaterial({
          uniforms: uniforms,
          vertexShader: OBJECTS_SHADER.vertexShader,
          fragmentShader: OBJECTS_SHADER.fragmentShader,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.offset = new THREE.Vector2(x, z);
        mesh.lightmap = null;

        if (lightmapper) {
          _bindLightmap(mesh);
        }

        return mesh;
      })();

      mesh.destroy = () => {
        mesh.geometry.dispose();

        const {buffer} = objectsChunkData;
        buffers.free(buffer);

        if (mesh.lightmap) {
          _unbindLightmap(mesh);
        }
      };

      return mesh;
    };

    class TrackedObject extends EventEmitter {
      constructor(mesh, n, objectIndex, startIndex, endIndex, position, offset = new THREE.Vector3(), size = DEFAULT_SIZE) {
        super();

        this.mesh = mesh;
        this.n = n;
        this.objectIndex = objectIndex;
        this.startIndex = startIndex;
        this.endIndex = endIndex;
        this.position = position;
        this.offset = offset;
        this.size = size;
      }

      trigger(side) {
        this.emit('trigger', side);
      }

      grip(side) {
        this.emit('grip', side);
      }

      remove() {
        const {mesh, startIndex, endIndex} = this;
        const {geometry} = mesh;
        const indexAttribute = geometry.index;
        const indices = indexAttribute.array;
        for (let i = startIndex; i < endIndex; i++) {
          indices[i] = 0;
        }
        indexAttribute.needsUpdate = true;

        trackedObjects.splice(trackedObjects.indexOf(this), 1);

        const {n} = this;
        const objectApi = objectApis[n];
        if (objectApi) {
          _unbindTrackedObject(this, objectApi);
        }

        const {objectIndex, position} = this;
        const x = Math.floor(position.x / NUM_CELLS);
        const z = Math.floor(position.z / NUM_CELLS);
        worker.requestRemoveObject(x, z, objectIndex);
      }
    }

    const trackedObjects = [];
    const _addTrackedObjects = (mesh, data) => {
      const {objects: objectsUint32Data} = data;
      const objectsFloat32Data = new Float32Array(objectsUint32Data.buffer, objectsUint32Data.byteOffset, objectsUint32Data.length);
      const numObjects = objectsUint32Data.length / 7;
      let startObject = null;
      for (let i = 0; i < numObjects; i++) {
        const baseIndex = i * 7;
        const n = objectsUint32Data[baseIndex + 0];
        const objectIndex = objectsUint32Data[baseIndex + 1];
        const startIndex = objectsUint32Data[baseIndex + 2];
        const endIndex = objectsUint32Data[baseIndex + 3];
        const position = new THREE.Vector3().fromArray(objectsFloat32Data, baseIndex + 4);
        const trackedObject = new TrackedObject(mesh, n, objectIndex, startIndex, endIndex, position);
        trackedObjects.push(trackedObject);

        const objectApi = objectApis[n];
        if (objectApi) {
          _bindTrackedObject(trackedObject, objectApi);
        }
        
        if (startObject === null) {
          startObject = trackedObject;
        }
      }

      return [startObject, numObjects];
    };
    const _removeTrackedObjects = objectRange => {
      const [startObject, numObjects] = objectRange;
      const removedTrackedObjects = trackedObjects.splice(trackedObjects.indexOf(startObject), numObjects);

      for (let i = 0; i < removedTrackedObjects.length; i++) {
        const trackedObject = removedTrackedObjects[i];
        const {n} = trackedObject;
        const objectApi = objectApis[n];
        if (objectApi) {
          _unbindTrackedObject(trackedObject, objectApi);
        }
      }
    };
    const _getHoveredTrackedObject = side => {
      const {gamepads} = pose.getStatus();
      const gamepad = gamepads[side];
      const {worldPosition: controllerPosition} = gamepad;

      for (let i = 0; i < trackedObjects.length; i++) {
        const trackedObject = trackedObjects[i];
        if (controllerPosition.distanceTo(localVector.copy(trackedObject.position).add(trackedObject.offset)) < trackedObject.size/2) {
          return trackedObject;
        }
      }
      return null;
    };
    const _bindTrackedObject = (trackedObject, objectApi) => {
      objectApi.objectAddedCallback(trackedObject);

      if (objectApi.offset) {
        trackedObject.offset.fromArray(objectApi.offset);
      } else {
        trackedObject.offset.copy(zeroVector);
      }
      trackedObject.size = objectApi.size !== undefined ? objectApi.size : DEFAULT_SIZE;
    };
    const _unbindTrackedObject = (trackedObject, objectApi) => {
      objectApi.objectRemovedCallback(trackedObject);

      trackedObject.offset.copy(zeroVector);
      trackedObject.size = DEFAULT_SIZE;
    };

    const _triggerdown = e => {
      const {side} = e;
      const trackedObject = _getHoveredTrackedObject(side);

      if (trackedObject) {
        trackedObject.trigger(side);
      }
    };
    input.on('triggerdown', _triggerdown);
    const _gripdown = e => {
      const {side} = e;
      const trackedObject = _getHoveredTrackedObject(side);

      if (trackedObject) {
        trackedObject.grip(side);
      }
    };
    input.on('gripdown', _gripdown, {
      priority: -4,
    });

    const objectApis = {};

    let lightmapper = null;
    const _bindLightmapper = lightmapElement => {
      lightmapper = lightmapElement.lightmapper;

      _bindLightmaps();
    };
    const _unbindLightmapper = () => {
      _unbindLightmaps();

      lightmapper = null;
    };
    const _bindLightmaps = () => {
      for (let i = 0; i < objectsChunkMeshes.length; i++) {
        const objectChunkMesh = objectsChunkMeshes[i];
        _bindLightmap(objectChunkMesh);
      }
    };
    const _unbindLightmaps = () => {
      for (let i = 0; i < objectsChunkMeshes.length; i++) {
        const objectChunkMesh = objectsChunkMeshes[i];
        _unbindLightmap(objectChunkMesh);
      }
    };
    const _bindLightmap = objectChunkMesh => {
      const {offset} = objectChunkMesh;
      const {x, y} = offset;
      const lightmap = lightmapper.getLightmapAt(x * NUM_CELLS, y * NUM_CELLS);
      objectChunkMesh.material.uniforms.lightMap.value = lightmap.texture;
      objectChunkMesh.lightmap = lightmap;
    };
    const _unbindLightmap = objectChunkMesh => {
      const {lightmap} = objectChunkMesh;
      lightmapper.releaseLightmap(lightmap);
      objectChunkMesh.lightmap = null;
    };
    const lightmapElementListener = elements.makeListener(LIGHTMAP_PLUGIN); // XXX destroy these
    lightmapElementListener.on('add', entityElement => {
      _bindLightmapper(entityElement);
    });
    lightmapElementListener.on('remove', () => {
      _unbindLightmapper();
    });

    let craftElement = null;
    const craftElementListener = elements.makeListener(CRAFT_PLUGIN);
    craftElementListener.on('add', entityElement => {
      craftElement = entityElement;

      if (recipeQueue.length > 0) {
        for (let i = 0; i < recipeQueue.length; i++) {
          const recipe = recipeQueue[i];
          craftElement.registerRecipe(recipe);
        }
        recipeQueue.length = 0;
      }
    });
    craftElementListener.on('remove', () => {
      craftElement = null;
    });
    const recipeQueue = [];

    class ObjectApi {
      registerGeometry(name, fn) {
        return worker.requestRegisterGeometry(name, fn);
      }

      registerTexture(name, img) {
        const rect = textures.pack(img.width, img.height);
        const uv = textures.uv(rect);
        worker.requestRegisterTexture(name, uv)
          .catch(err => {
            console.warn(err);
          });

        return createImageBitmap(img, 0, 0, img.width, img.height, {
          imageOrientation: 'flipY',
        })
          .then(imageBitmap => {
            ctx.drawImage(imageBitmap, rect.x, rect.y);
            textureAtlas.needsUpdate = true;
          });
      }

      addObject(name, position) {
        worker.requestAddObject(name, position)
          .then(() => {
            const x = Math.floor(position.x / NUM_CELLS);
            const z = Math.floor(position.z / NUM_CELLS);
            const chunk = chunker.chunks.find(chunk => chunk.x === x && chunk.z === z);

            if (chunk) {
              chunk.lod = -1; // force chunk refresh
            }
          });
      }

      registerObject(objectApi) {
        const {object} = objectApi;
        const n = murmur(object);
        objectApis[n] = objectApi;

        for (let i = 0; i < trackedObjects.length; i++) {
          const trackedObject = trackedObjects[i];
          if (trackedObject.n === n) {
            _bindTrackedObject(trackedObject, objectApi);
          }
        }
      }

      unregisterObject(objectApi) {
        const {object} = objectApi;
        const n = murmur(object);
        delete objectApis[n];

        for (let i = 0; i < trackedObjects.length; i++) {
          const trackedObject = trackedObjects[i];
          if (trackedObject.n === n) {
            _unbindTrackedObject(trackedObject, objectApi);
          }
        }
      }

      registerRecipe(recipe) {
        if (craftElement) {
          craftElement.registerRecipe(recipe);
        } else {
          recipeQueue.push(recipe);
        }
      }

      unregisterRecipe(recipe) {
        if (craftElement) {
          craftElement.registerRecipe(recipe);
        } else {
          const index = recipeQueue.indexOf(recipe);

          if (index !== -1) {
            recipeQueue.splice(index, 1);
          }
        }
      }

      registerGenerator(name, fn) {
        return worker.requestRegisterGenerator(name, fn);
      }
    }
    const objectApi = new ObjectApi();

    const chunker = chnkr.makeChunker({
      resolution: NUM_CELLS,
      range: RANGE,
    });
    const objectsChunkMeshes = [];

    const _requestRefreshObjectsChunks = () => {
      const {hmd} = pose.getStatus();
      const {worldPosition: hmdPosition} = hmd;
      const {added, removed, relodded} = chunker.update(hmdPosition.x, hmdPosition.z);

      const promises = [];
      const _addChunk = chunk => {
        const {x, z} = chunk;

        const promise = _requestObjectsGenerate(x, z)
          .then(objectsChunkData => {
            const {data: oldData} = chunk;
            if (oldData) {
              const {objectsChunkMesh} = oldData;
              scene.remove(objectsChunkMesh);

              objectsChunkMeshes.splice(objectsChunkMeshes.indexOf(objectsChunkMesh), 1);

              objectsChunkMesh.destroy();

              const {objectRange} = oldData;
              _removeTrackedObjects(objectRange);
            }

            const objectsChunkMesh = _makeObjectsChunkMesh(objectsChunkData, x, z);
            scene.add(objectsChunkMesh);

            objectsChunkMeshes.push(objectsChunkMesh);

            const objectRange = _addTrackedObjects(objectsChunkMesh, objectsChunkData);

            chunk.data = {
              objectsChunkMesh,
              objectRange,
            };
          });
        promises.push(promise);
      };
      for (let i = 0; i < added.length; i++) {
        _addChunk(added[i]);
      }
      for (let i = 0; i < relodded.length; i++) {
        _addChunk(relodded[i]);
      }
      return Promise.all(promises)
        .then(() => {
          for (let i = 0; i < removed.length; i++) {
            const chunk = removed[i];
            const {data} = chunk;
            const {objectsChunkMesh} = data;
            scene.remove(objectsChunkMesh);

            objectsChunkMeshes.splice(objectsChunkMeshes.indexOf(objectsChunkMesh), 1);

            objectsChunkMesh.destroy();

            const {objectRange} = data;
            _removeTrackedObjects(objectRange);
          }
        })
    };

    const _update = () => {
      const dayNightSkyboxEntity = elements.getEntitiesElement().querySelector(DAY_NIGHT_SKYBOX_PLUGIN);
      const sunIntensity = (dayNightSkyboxEntity && dayNightSkyboxEntity.getSunIntensity) ? dayNightSkyboxEntity.getSunIntensity() : 0;

      for (let i = 0; i < objectsChunkMeshes.length; i++) {
        const objectChunkMesh = objectsChunkMeshes[i];
        objectChunkMesh.material.uniforms.sunIntensity.value = sunIntensity;
      }
    };
    render.on('update', _update);

    cleanups.push(() => {
      input.removeListener('triggerdown', _triggerdown);
      input.removeListener('gripdown', _gripdown);

      render.removeListener('update', _update);
    });

    return Promise.all(
      objectsLib(objectApi)
        .map(makeObject => makeObject()
          .then(cleanup => {
            cleanups.push(cleanup);
          }))
    )
      .then(() => {
        let live = true;
        const _recurse = () => {
          _requestRefreshObjectsChunks()
            .then(() => {
              if (live) {
                setTimeout(_recurse, 1000);
              }
            })
            .catch(err => {
              if (live) {
                console.warn(err);

                setTimeout(_recurse, 1000);
              }
            });
        };
        _recurse();
        cleanups.push(() => {
          live = false;
        });
      });
  }

  unmount() {
    this._cleanup();
  }
}
const _parseFunction = fn => {
  const match = fn.toString().match(/[^\(]*\(([^\)]*)\)[^\{]*\{([\s\S]*)\}\s*$/); // XXX support bracketless arrow functions
  const args = match[1].split(',').map(arg => arg.trim());
  const src = match[2];
  return {args, src};
};

module.exports = Objects;
