const EffectComposer = require('./lib/three-extra/postprocessing/EffectComposer');
const BlurShader = require('./lib/three-extra/shaders/BlurShader');
const {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  DEFAULT_USER_HEIGHT,
} = require('./lib/constants/menu');

const NUM_POSITIONS = 500 * 1024;
const MENU_RANGE = 3;
const SIDES = ['left', 'right'];

const width = 0.1;
const height = 0.1;
const pixelWidth = 128;
const pixelHeight = 128;

const LENS_SHADER = {
  uniforms: {
    textureMap: {
      type: 't',
      value: null,
    },
    opacity: {
      type: 'f',
      value: 0,
    },
  },
  vertexShader: [
    "varying vec4 texCoord;",
    "void main() {",
    "  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
    "  vec4 position = projectionMatrix * mvPosition;",
    "  texCoord = position;",
    "  texCoord.xy = 0.5*texCoord.xy + 0.5*texCoord.w;",
    "  gl_Position = position;",
    "}"
  ].join("\n"),
  fragmentShader: [
    "uniform sampler2D textureMap;",
    "uniform float opacity;",
    "varying vec4 texCoord;",
    "void main() {",
    "  vec4 diffuse = texture2DProj(textureMap, texCoord);",
    "  gl_FragColor = vec4(mix(diffuse.rgb, vec3(0, 0, 0), 0.5), diffuse.a * opacity);",
    "}"
  ].join("\n")
};

class Inventory {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {
      metadata: {
        site: {
          url: siteUrl,
        },
        server: {
          enabled: serverEnabled,
        },
      },
    } = archae;

    const cleanups = [];
    this._cleanup = () => {
      const oldCleanups = cleanups.slice();
      for (let i = 0; i < oldCleanups.length; i++) {
        const cleanup = oldCleanups[i];
        cleanup();
      }
    };

    let live = true;
    cleanups.push(() => {
      live = false;
    });

    const _requestImage = src => new Promise((accept, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        accept(img);
      };
      img.onerror = err => {
        reject(err);
      };
    });
    const _requestImageBitmap = src => _requestImage(src)
      .then(img => createImageBitmap(img, 0, 0, img.width, img.height));

    return Promise.all([
      archae.requestPlugins([
        '/core/engines/bootstrap',
        '/core/engines/input',
        '/core/engines/three',
        '/core/engines/webvr',
        '/core/engines/biolumi',
        '/core/engines/rend',
        '/core/engines/world',
        '/core/engines/tags',
        '/core/engines/resource',
        '/core/engines/anima',
        '/core/utils/sprite-utils',
        '/core/utils/vrid-utils',
      ]),
      _requestImageBitmap('/archae/inventory/img/menu.svg'),
    ]).then(([
      [
        bootstrap,
        input,
        three,
        webvr,
        biolumi,
        rend,
        world,
        tags,
        resource,
        anima,
        spriteUtils,
        vridUtils,
      ],
      menuImg,
    ]) => {
      if (live) {
        const {THREE, scene, camera, renderer} = three;
        const {materials: {assets: assetsMaterial}, sfx} = resource;
        const {vridApi} = vridUtils;

        const THREEEffectComposer = EffectComposer(THREE);
        const {THREERenderPass, THREEShaderPass} = THREEEffectComposer;
        const THREEBlurShader = BlurShader(THREE);

        const _quantizeAssets = assets => {
          const assetIndex = {};
          for (let i = 0; i < assets.length; i++) {
            const assetSpec = assets[i];
            const {asset} = assetSpec;
            let entry = assetIndex[asset];
            if (!entry) {
              entry = _clone(assetSpec);
              entry.assets = [];
              assetIndex[asset] = entry;
            }
            entry.assets.push(assetSpec);
          }
          return Object.keys(assetIndex).map(k => assetIndex[k]);
        };

        const _requestAssets = () => vridApi.get('assets')
          .then(assets => _quantizeAssets(assets || []));
        const _requestEquipments = () => vridApi.get('equipment')
          .then(equipments => _arrayify(equipments, 4));

        return Promise.all([
          _requestAssets(),
          _requestEquipments(),
        ])
          .then(([
            assets,
            equipments,
          ]) => {
            if (live) {
              let mods = tags.getTagMeshes()
                .filter(({item}) => item.type === 'entity')
                .map(({item}) => item);
              const _worldAdd = tagMesh => {
                const {item} = tagMesh;
                if (item.type === 'entity') {
                  mods.push(item);
                  localMods = _getLocalMods();
                  serverBarValue = 0;
                  serverPage = 0;
                  serverPages = mods.length > 12 ? Math.ceil(mods.length / 12) : 0;
                  _renderMenu();
                  assetsMesh.render();
                }
              };
              world.on('add', _worldAdd);

              const localVector = new THREE.Vector3();
              const localMatrix = new THREE.Matrix4();
              const zeroQuaternion = new THREE.Quaternion();
              const oneVector = new THREE.Vector3(1, 1, 1);
              const zeroArray = new Float32Array(0);
              const zeroArray2 = new Float32Array(0);
              const zeroVector = new THREE.Vector3();
              const pixelSize = 0.006;

              const _getAssetType = asset => {
                const match = asset.match(/^(ITEM|MOD|SKIN|FILE)\.(.+)$/);
                const type = match[1].toLowerCase();
                const name = match[2].toLowerCase();
                return {type, name};
              };
              const _requestAssetImageData = asset => (() => {
                const {type, name} = _getAssetType(asset);
                if (type === 'item') {
                  return resource.getItemImageData(name);
                } else if (type === 'mod') {
                  return resource.getModImageData(name);
                } else if (type === 'file') {
                  return resource.getFileImageData(name);
                } else if (type === 'skin') {
                  return resource.getSkinImageData(name);
                } else {
                  return Promise.resolve(null);
                }
              })().then(arrayBuffer => ({
                width: 16,
                height: 16,
                data: new Uint8Array(arrayBuffer),
              }));
              const _makeRenderTarget = (width, height) => new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                // format: THREE.RGBFormat,
                format: THREE.RGBAFormat,
              });

              const uiTracker = biolumi.makeUiTracker();

              const menuState = {
                open: false,
                position: new THREE.Vector3(0, DEFAULT_USER_HEIGHT, -1.5),
                rotation: new THREE.Quaternion(),
                scale: new THREE.Vector3(1, 1, 1),
              };

              const canvas = document.createElement('canvas');
              canvas.width = WIDTH;
              canvas.height = HEIGHT;
              const ctx = canvas.getContext('2d');
              ctx.font = '600 14px Open sans';
              const texture = new THREE.Texture(
                canvas,
                THREE.UVMapping,
                THREE.ClampToEdgeWrapping,
                THREE.ClampToEdgeWrapping,
                THREE.LinearFilter,
                THREE.LinearFilter,
                THREE.RGBAFormat,
                THREE.UnsignedByteType,
                16
              );

              const _getLocalTabAssets = () => assets
                .filter(assetSpec => _getAssetType(assetSpec.asset).type === tabType);
              const _getLocalAssets = () => _getLocalTabAssets()
                .slice(inventoryPage * 12, (inventoryPage + 1) * 12);
              const _getLocalMods = () => mods
                .slice(serverPage * 12, (serverPage + 1) * 12);

              let tabIndex = 0;
              let tabType = 'item';
              let inventoryPage = 0;
              let localAssets = _getLocalAssets();
              const localTabAssets = _getLocalTabAssets();
              let inventoryPages = localTabAssets.length > 12 ? Math.ceil(localTabAssets.length / 12) : 0;
              let inventoryBarValue = 0;
              let inventoryIndices = {
                left: -1,
                right: -1,
              };
              let serverPage = 0;
              let localMods = _getLocalMods();
              let serverPages = mods.length > 12 ? Math.ceil(mods.length / 12) : 0;
              let serverBarValue = 0;
              const _snapToIndex = (steps, value) => Math.floor(steps * value);
              const _snapToPixel = (max, steps, value) => {
                const stepIndex = _snapToIndex(steps, value);
                const stepSize = max / steps;
                return stepIndex * stepSize;
              };
              const _renderMenu = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(menuImg, (canvas.width - menuImg.width) / 2, (canvas.height - menuImg.height) / 2, canvas.width, canvas.width * menuImg.height / menuImg.width);
                ctx.fillStyle = '#FFF';
                ctx.fillRect(850 + tabIndex * 126, 212, 125, 4);
                ctx.textAlign = 'center';
                for (let i = 0; i < localAssets.length; i++) {
                  const assetSpec = localAssets[i];
                  const dx = i % 3;
                  const dy = Math.floor(i / 3);
                  ctx.fillStyle = '#FFF';
                  ctx.fillText(_getAssetType(assetSpec.asset).name, 870 + (dx + 0.5) * 150, 235 + 157 - 10 + dy * 155, 132, 132);

                  for (let s = 0; s < SIDES.length; s++) {
                    const side = SIDES[s];
                    if (inventoryIndices[side] === i) {
                      ctx.fillStyle = '#4CAF5080';
                      ctx.fillRect(870 + dx * 150, 235 + dy * 155, 132, 132);
                    }
                  }
                }
                for (let i = 0; i < localMods.length; i++) {
                  const modSpec = localMods[i];
                  const dx = i % 3;
                  const dy = Math.floor(i / 3);
                  ctx.fillText(modSpec.displayName, 0 + (dx + 0.5) * 150, 235 + 127 - 10 + dy * 155, 132, 132);
                }
                ctx.fillStyle = '#FFF';
                ctx.fillRect(1316, 235 + _snapToPixel(600, inventoryPages, inventoryBarValue), 24, 600 / inventoryPages);
                ctx.fillRect(456, 204 + _snapToPixel(600, serverPages, serverBarValue), 24, 600 / serverPages);
                texture.needsUpdate = true;
              };
              _renderMenu();

              const menuMesh = new THREE.Object3D();
              menuMesh.visible = false;
              scene.add(menuMesh);

              const plane = new THREE.Object3D();
              plane.width = WIDTH;
              plane.height = HEIGHT;
              plane.worldWidth = WORLD_WIDTH;
              plane.worldHeight = WORLD_HEIGHT;
              const _pushAnchor = (anchors, x, y, w, h, triggerdown = null) => {
                anchors.push({
                  left: x,
                  right: x + w,
                  top: y,
                  bottom: y + h,
                  triggerdown,
                });
              };
              let onmove = null;
              const inventoryAnchors = [];
              let index = 0;
              for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 3; dx++) {
                  const localIndex = index++;
                  _pushAnchor(inventoryAnchors, 870 + dx * 150, 235 + dy * 155, 132, 132, e => {
                    inventoryIndices[e.side] = localIndex;
                    _renderMenu();

                    e.stopImmediatePropagation();
                  });
                }
              }
              const inventoryBarAnchors = [];
              _pushAnchor(inventoryBarAnchors, 1316, 235, 24, 600, (e, hoverState) => {
                const {side} = e;

                let lastInventoryPage = -1;
                const _renderAssets = () => {
                  inventoryPage = _snapToIndex(inventoryPages, inventoryBarValue);
                  if (inventoryPage !== lastInventoryPage) {
                    localAssets = _getLocalAssets();

                    assetsMesh.render();
                    lastInventoryPage = inventoryPage;
                  }
                };

                inventoryBarValue = hoverState.crossValue;
                _renderMenu();
                _renderAssets();

                onmove = () => {
                  const hoverState = uiTracker.getHoverState(side);
                  inventoryBarValue = Math.min(Math.max(hoverState.y - 235, 0), 600) / 600;
                  _renderMenu();
                  _renderAssets();
                };
              });
              index = 0;
              const equipmentAnchors = [];
              for (let dy = 0; dy < 4; dy++) {
                const localIndex = index++;
                _pushAnchor(equipmentAnchors, 576, 235 + dy * 152, 252, 120, e => {
                  console.log('equipment', localIndex);

                  e.stopImmediatePropagation();
                });
              }
              index = 0;
              const tabsAnchors = [];
              for (let dx = 0; dx < 4; dx++) {
                const localIndex = index++;
                _pushAnchor(tabsAnchors, 850 + dx * 126, 160, 126, 60, e => {
                  tabIndex = localIndex;
                  if (tabIndex === 0) {
                    tabType = 'item';
                  } else if (tabIndex === 1) {
                    tabType = 'mod';
                  } else if (tabIndex === 2) {
                    tabType = 'file';
                  } else if (tabIndex === 3) {
                    tabType = 'skin';
                  }
                  localAssets = _getLocalAssets();
                  const localTabAssets = _getLocalTabAssets();
                  inventoryBarValue = 0;
                  inventoryPage = 0;
                  inventoryPages = localTabAssets.length > 12 ? Math.ceil(localTabAssets.length / 12) : 0;

                  _renderMenu();
                  assetsMesh.render();

                  e.stopImmediatePropagation();
                });
              }
              index = 0;
              const serverAnchors = [];
              for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 3; dx++) {
                  const localIndex = index++;
                  _pushAnchor(serverAnchors, dx * 150, 204 + dy * 155, 132, 132, e => {
                    console.log('server', localIndex);

                    e.stopImmediatePropagation();
                  });
                }
              }
              const serverBarAnchors = [];
              _pushAnchor(serverBarAnchors, 456, 204, 24, 600, (e, hoverState) => {
                const {side} = e;

                let lastServerPage = -1;
                const _renderAssets = () => {
                  serverPage = _snapToIndex(serverPages, serverBarValue);
                  if (_renderAssets !== lastServerPage) {
                    localAssets = _getLocalAssets();

                    assetsMesh.render();
                    lastServerPage = serverPage;
                  }
                };

                serverBarValue = hoverState.crossValue;
                serverPage = _snapToIndex(serverPages, serverBarValue);
                localMods = _getLocalMods();
                _renderMenu();
                _renderAssets();

                onmove = () => {
                  const hoverState = uiTracker.getHoverState(side);
                  serverBarValue = Math.min(Math.max(hoverState.y - 204, 0), 600) / 600;
                  serverPage = _snapToIndex(serverPages, serverBarValue);
                  localMods = _getLocalMods();
                  _renderMenu();
                  _renderAssets();
                };
              });
              plane.anchors = inventoryAnchors.concat(inventoryBarAnchors).concat(equipmentAnchors).concat(tabsAnchors).concat(serverAnchors).concat(serverBarAnchors);
              menuMesh.add(plane);
              uiTracker.addPlane(plane);

              const lensMesh = (() => {
                const object = new THREE.Object3D();
                // object.position.set(0, 0, 0);

                const width = window.innerWidth * window.devicePixelRatio / 4;
                const height = window.innerHeight * window.devicePixelRatio / 4;
                const renderTarget = _makeRenderTarget(width, height);
                const render = (() => {
                  const blurShader = {
                    uniforms: THREE.UniformsUtils.clone(THREEBlurShader.uniforms),
                    vertexShader: THREEBlurShader.vertexShader,
                    fragmentShader: THREEBlurShader.fragmentShader,
                  };

                  const composer = new THREEEffectComposer(renderer, renderTarget);
                  const renderPass = new THREERenderPass(scene, camera);
                  composer.addPass(renderPass);
                  const blurPass = new THREEShaderPass(blurShader);
                  composer.addPass(blurPass);
                  composer.addPass(blurPass);
                  composer.addPass(blurPass);

                  return (scene, camera) => {
                    renderPass.scene = scene;
                    renderPass.camera = camera;

                    composer.render();
                    renderer.setRenderTarget(null);
                  };
                })();
                object.render = render;

                const planeMesh = (() => {
                  const geometry = new THREE.SphereBufferGeometry(3, 8, 6);
                  const material = (() => {
                    const shaderUniforms = THREE.UniformsUtils.clone(LENS_SHADER.uniforms);
                    const shaderMaterial = new THREE.ShaderMaterial({
                      uniforms: shaderUniforms,
                      vertexShader: LENS_SHADER.vertexShader,
                      fragmentShader: LENS_SHADER.fragmentShader,
                      side: THREE.BackSide,
                      transparent: true,
                    })
                    shaderMaterial.uniforms.textureMap.value = renderTarget.texture;
                    // shaderMaterial.polygonOffset = true;
                    // shaderMaterial.polygonOffsetFactor = -1;
                    return shaderMaterial;
                  })();

                  const mesh = new THREE.Mesh(geometry, material);
                  return mesh;
                })();
                object.add(planeMesh);
                object.planeMesh = planeMesh;

                return object;
              })();
              menuMesh.add(lensMesh);

              const planeMesh = (() => {
                const geometry = new THREE.PlaneBufferGeometry(WORLD_WIDTH, WORLD_HEIGHT);
                const material = new THREE.MeshBasicMaterial({
                  map: texture,
                  side: THREE.DoubleSide,
                  transparent: true,
                  // renderOrder: -1,
                });
                const mesh = new THREE.Mesh(geometry, material);
                return mesh;
              })();
              menuMesh.add(planeMesh);

              const {dotMeshes, boxMeshes} = uiTracker;
              for (let i = 0; i < SIDES.length; i++) {
                const side = SIDES[i];
                scene.add(dotMeshes[side]);
                scene.add(boxMeshes[side]);
              }

              const assetsMesh = (() => {
                const geometry = (() => {
                  const geometry = new THREE.BufferGeometry();

                  geometry.boundingSphere = new THREE.Sphere(
                    zeroVector,
                    1
                  );
                  const cleanups = [];
                  geometry.destroy = () => {
                    for (let i = 0; i < cleanups.length; i++) {
                      cleanups[i]();
                    }
                  };

                  return geometry;
                })();
                const material = assetsMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                const _renderAssets = _debounce(next => {
                  Promise.all(
                    localAssets
                      .map((assetSpec, i) =>
                        _requestAssetImageData(assetSpec.asset)
                          .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                            localVector.set(
                              WORLD_WIDTH * -0.01 + (i % 3) * WORLD_WIDTH * 0.065 * 1.2,
                              WORLD_HEIGHT * 0.18 -Math.floor(i / 3) * WORLD_WIDTH * 0.065 * 1.2,
                              pixelSize * 16 * 0.6
                            ),
                            zeroQuaternion,
                            oneVector
                          )))
                      ).concat(
                        equipments
                          .map((assetSpec, i) => {
                            if (assetSpec) {
                              return _requestAssetImageData(assetSpec.asset)
                                .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                                  localVector.set(
                                    WORLD_WIDTH * -0.13,
                                    WORLD_HEIGHT * 0.18 - i * WORLD_HEIGHT * 0.065 * 1.2,
                                    pixelSize * 16 * 0.6
                                  ),
                                  zeroQuaternion,
                                  oneVector
                                )))
                            } else {
                              return null;
                            }
                          })
                          .filter(o => o !== null)
                      ).concat(
                        localMods
                          .map((modSpec, i) =>
                            _requestAssetImageData('MOD.' + modSpec.displayName)
                              .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                                localVector.set(
                                  WORLD_WIDTH * -0.46 + (i % 3) * WORLD_WIDTH * 0.065 * 1.2,
                                  WORLD_HEIGHT * 0.2 -Math.floor(i / 3) * WORLD_WIDTH * 0.065 * 1.2,
                                  pixelSize * 16 * 0.6
                                ),
                                zeroQuaternion,
                                oneVector
                              )))
                          )
                      )
                  )
                  .then(geometrySpecs => {
                    const positions = new Float32Array(NUM_POSITIONS);
                    const colors = new Float32Array(NUM_POSITIONS);
                    const dys = new Float32Array(NUM_POSITIONS);

                    let attributeIndex = 0;
                    let dyIndex = 0;

                    for (let i = 0; i < geometrySpecs.length; i++) {
                      const geometrySpec = geometrySpecs[i];
                      const {positions: newPositions, colors: newColors, dys: newDys} = geometrySpec;

                      positions.set(newPositions, attributeIndex);
                      colors.set(newColors, attributeIndex);
                      dys.set(newDys, dyIndex);

                      attributeIndex += newPositions.length;
                      dyIndex += newDys.length;

                      cleanups.push(() => {
                        spriteUtils.releaseSpriteGeometry(geometrySpec);
                      });
                    }

                    geometry.addAttribute('position', new THREE.BufferAttribute(positions.subarray(0, attributeIndex), 3));
                    geometry.addAttribute('color', new THREE.BufferAttribute(colors.subarray(0, attributeIndex), 3));
                    geometry.addAttribute('dy', new THREE.BufferAttribute(dys.subarray(0, dyIndex), 2));

                    next();
                  })
                  .catch(err => {
                    console.warn(err);

                    next();
                  });
                });
                _renderAssets();
                mesh.render = _renderAssets;
                return mesh;
              })();
              menuMesh.add(assetsMesh);

              const trigger = e => {
                const {side} = e;

                if (menuState.open) {
                  sfx.digi_plink.trigger();

                  e.stopImmediatePropagation();
                }
              };
              input.on('trigger', trigger, {
                priority: -1,
              });

              let animation = null;
              const _closeMenu = () => {
                // menuMesh.visible = false;

                menuState.open = false; // XXX need to cancel other menu states as well

                uiTracker.setOpen(false);

                sfx.digi_powerdown.trigger();

                animation = anima.makeAnimation(1, 0, 500);
              };
              const _openMenu = () => {
                const {hmd: hmdStatus} = webvr.getStatus();
                const {worldPosition: hmdPosition, worldRotation: hmdRotation} = hmdStatus;

                const newMenuRotation = (() => {
                  const hmdEuler = new THREE.Euler().setFromQuaternion(hmdRotation, camera.rotation.order);
                  hmdEuler.x = 0;
                  hmdEuler.z = 0;
                  return new THREE.Quaternion().setFromEuler(hmdEuler);
                })();
                const newMenuPosition = hmdPosition.clone()
                  .add(new THREE.Vector3(0, 0, -1.5).applyQuaternion(newMenuRotation));
                const newMenuScale = new THREE.Vector3(1, 1, 1);
                menuMesh.position.copy(newMenuPosition);
                menuMesh.quaternion.copy(newMenuRotation);
                menuMesh.scale.copy(newMenuScale);
                // menuMesh.visible = true;
                menuMesh.updateMatrixWorld();

                menuState.open = true;
                menuState.position.copy(newMenuPosition);
                menuState.rotation.copy(newMenuRotation);
                menuState.scale.copy(newMenuScale);

                uiTracker.setOpen(true);

                sfx.digi_slide.trigger();

                animation = anima.makeAnimation(0, 1, 500);
              };
              const _menudown = () => {
                const {open} = menuState;

                if (open) {
                  _closeMenu();
                } else {
                  _openMenu();
                }
              };
              input.on('menudown', _menudown);

              const _triggerdown = e => {
                const {side} = e;
                const hoverState = uiTracker.getHoverState(side);
                const {anchor} = hoverState;
                if (anchor) {
                  anchor.triggerdown(e, hoverState);
                }
              };
              input.on('triggerdown', _triggerdown);
              const _triggerup = e => {
                onmove = null;
              };
              input.on('triggerup', _triggerup);

              cleanups.push(() => {
                scene.remove(menuMesh);

                for (let i = 0; i < SIDES.length; i++) {
                  const side = SIDES[i];
                  scene.remove(uiTracker.dotMeshes[side]);
                  scene.remove(uiTracker.boxMeshes[side]);
                }

                input.removeListener('triggerdown', _triggerdown);
                input.removeListener('triggerup', _triggerup);
                input.removeListener('menudown', _menudown);

                scene.onRenderEye = null;
                scene.onBeforeRenderEye = null;
                scene.onAfterRenderEye = null;
              });

              rend.on('update', () => {
                const _updateMove = () => {
                  if (onmove) {
                    onmove();
                  }
                };
                const _updateMenu = () => {
                  if (menuState.open) {
                    if (menuMesh.position.distanceTo(webvr.getStatus().hmd.worldPosition) > MENU_RANGE) {
                      _closeMenu();
                    }
                  }
                };
                const _updateUiTracker = () => {
                  uiTracker.update({
                    pose: webvr.getStatus(),
                    sides: (() => {
                      const vrMode = bootstrap.getVrMode();

                      if (vrMode === 'hmd') {
                        return SIDES;
                      } else {
                        const mode = webvr.getMode();

                        if (mode !== 'center') {
                          return [mode];
                        } else {
                          return SIDES;
                        }
                      }
                    })(),
                    controllerMeshes: rend.getAuxObject('controllerMeshes'),
                  });
                };
                const _updateAnimation = () => {
                  if (animation) {
                    if (animation.isDone()) {
                      menuMesh.visible = animation.getValue() >= 0.5;
                      animation = null;
                    } else {
                      const value = animation.getValue();
                      if (value > 0) {
                        planeMesh.scale.set(1, value, 1);
                        planeMesh.updateMatrixWorld();

                        assetsMesh.scale.set(1, value, 1);
                        assetsMesh.updateMatrixWorld();

                        // lensMesh.scale.set(value, value, value);
                        // lensMesh.updateMatrixWorld();
                        lensMesh.planeMesh.material.uniforms.opacity.value = value;

                        menuMesh.visible = true;
                      } else {
                        menuMesh.visible = false;
                      }
                    }
                  }
                };

                _updateMove();
                _updateMenu();
                _updateUiTracker();
                _updateAnimation();
              });
              rend.on('updateEye', eyeCamera => {
                lensMesh.planeMesh.visible = false;
                lensMesh.render(scene, eyeCamera);
                lensMesh.planeMesh.visible = true;
              });
            }
          });
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}
const _clone = o => {
  const result = {};
  for (const k in o) {
    result[k] = o[k];
  }
  return result;
};
const _arrayify = (array, numElements) => {
  array = array || [];

  const result = Array(numElements);
  for (let i = 0; i < numElements; i++) {
    result[i] = array[i] || null;
  }
  return result;
};
const _debounce = fn => {
  let running = false;
  let queued = false;

  const _go = () => {
    if (!running) {
      running = true;

      fn(() => {
        running = false;

        if (queued) {
          queued = false;

          _go();
        }
      });
    } else {
      queued = true;
    }
  };
  return _go;
};

module.exports = Inventory;
