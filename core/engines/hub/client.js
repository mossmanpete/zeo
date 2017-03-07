import {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  SERVER_WIDTH,
  SERVER_HEIGHT,
  SERVER_WORLD_WIDTH,
  SERVER_WORLD_HEIGHT,
  SERVER_WORLD_DEPTH,

  DEFAULT_USER_HEIGHT,
} from './lib/constants/menu';
import menuRenderer from './lib/render/menu';

const DEFAULT_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const NUM_INVENTORY_ITEMS = 4;

const SIDES = ['left', 'right'];
const FACES = ['top', 'bottom', 'left', 'right', 'front', 'back'];

class Hub {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {metadata: {hub: {url: hubUrl, enabled: hubEnabled}}} = archae;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return Promise.all([
      archae.requestPlugins([
        '/core/engines/bootstrap',
        '/core/engines/three',
        '/core/engines/webvr',
        '/core/engines/biolumi',
        '/core/engines/rend',
      ]),
    ])
      .then(([
        [
          bootstrap,
          three,
          webvr,
          biolumi,
          rend,
        ],
      ]) => {
        if (live) {
          const {THREE, scene, camera} = three;

          const transparentMaterial = biolumi.getTransparentMaterial();
          const transparentImg = biolumi.getTransparentImg();

          const _decomposeObjectMatrixWorld = object => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            object.matrixWorld.decompose(position, rotation, scale);
            return {position, rotation, scale};
          };

          const menuUi = biolumi.makeUi({
            width: WIDTH,
            height: HEIGHT,
          });

          const mainFontSpec = {
            fonts: biolumi.getFonts(),
            fontSize: 40,
            lineHeight: 1.4,
            fontWeight: biolumi.getFontWeight(),
            fontStyle: biolumi.getFontStyle(),
          };
          const hubState = {
            open: hubEnabled,
            searchText: '',
            username: '',
            inputText: '',
            inputIndex: 0,
            inputValue: 0,
            loading: false,
            error: null,
          };
          const focusState = {
            type: '',
          };

          const menuMesh = (() => {
            const object = new THREE.Object3D();
            object.position.y = DEFAULT_USER_HEIGHT;
            object.visible = hubState.open;

            const planeMesh = (() => {
              const mesh = menuUi.addPage(({
                login: {
                  searchText,
                  inputIndex,
                  inputValue,
                  loading,
                  error,
                },
                focus: {
                  type: focusType,
                }
              }) => {
                return [
                  {
                    type: 'html',
                    src: menuRenderer.getHubSrc({
                      searchText,
                      inputIndex,
                      inputValue,
                      loading,
                      error,
                      focusType,
                    }),
                    x: 0,
                    y: 0,
                    w: WIDTH,
                    h: HEIGHT,
                  },
                ];
              }, {
                type: 'hub',
                state: {
                  login: hubState,
                  focus: focusState,
                },
                worldWidth: WORLD_WIDTH,
                worldHeight: WORLD_HEIGHT,
              });
              mesh.position.z = -1;
              mesh.receiveShadow = true;

              return mesh;
            })();
            object.add(planeMesh);
            object.planeMesh = planeMesh;

            const shadowMesh = (() => {
              const geometry = new THREE.BoxBufferGeometry(WORLD_WIDTH, WORLD_HEIGHT, 0.01);
              const material = transparentMaterial.clone();
              material.depthWrite = false;

              const mesh = new THREE.Mesh(geometry, material);
              mesh.castShadow = true;
              return mesh;
            })();
            object.add(shadowMesh);

            return object;
          })();
          scene.add(menuMesh);

          const menuHoverStates = {
            left: biolumi.makeMenuHoverState(),
            right: biolumi.makeMenuHoverState(),
          };

          const menuDotMeshes = {
            left: biolumi.makeMenuDotMesh(),
            right: biolumi.makeMenuDotMesh(),
          };
          scene.add(menuDotMeshes.left);
          scene.add(menuDotMeshes.right);
          const menuBoxMeshes = {
            left: biolumi.makeMenuBoxMesh(),
            right: biolumi.makeMenuBoxMesh(),
          };
          scene.add(menuBoxMeshes.left);
          scene.add(menuBoxMeshes.right);

          const _getServerMeshes = servers => {
            const result = Array(servers.length);

            const _makeServerEnvMesh = server => {
              const object = new THREE.Object3D();

              const _requestImageFile = p => new Promise((accept, reject) => {
                const img = new Image();
                img.src = 'https://' + hubUrl + p;
                img.onload = () => {
                  accept(img);
                };
                img.onerror = err => {
                  reject(err);
                };
              });
              const _requestCubeMapImgs = server => Promise.all(FACES.map(face => _requestImageFile('/servers/img/cubemap/' + encodeURIComponent(server.url) + '/'+ face + '.png')))
                .then(cubeMapImgs => {
                  const result = {};
                  for (let i = 0; i < cubeMapImgs.length; i++) {
                    const cubeMapImg = cubeMapImgs[i];
                    const face = FACES[i];
                    result[face] = cubeMapImg;
                  }
                  return result;
                });

              _requestCubeMapImgs(server)
                .then(faceImgs => {
                  // const geometry = new THREE.SphereBufferGeometry(0.25, 32, 32);
                  const geometry = new THREE.SphereBufferGeometry(0.2, 15, 8);
                  const material = (() => {
                    const images = [
                      'right',
                      'left',
                      'top',
                      'bottom',
                      'front',
                      'back',
                    ].map(face => faceImgs[face]);
                    const texture = new THREE.CubeTexture(
                      images,
                      THREE.UVMapping,
                      THREE.ClampToEdgeWrapping,
                      THREE.ClampToEdgeWrapping,
                      THREE.NearestFilter,
                      THREE.NearestFilter,
                      THREE.RGBAFormat,
                      THREE.UnsignedByteType,
                      1
                    );
                    texture.needsUpdate = true;

                    const material = new THREE.MeshLambertMaterial({
                      envMap: texture,
                      // shininess: 10,
                    });
                    return material;
                  })();

                  const mesh = new THREE.Mesh(geometry, material);
                  mesh.castShadow = true;
                  object.add(mesh);
                })
                .catch(err => {
                  console.warn(err);
                });

              return object;
            };
            const _makeServerMenuMesh = server => {
              const object = new THREE.Object3D();

              const _requestServerIcon = server => fetch('https://' + hubUrl + '/servers/img/icon/' + encodeURIComponent(server.url))
                .then(res => res.blob()
                   .then(blob => new Promise((accept, reject) => {
                      const reader = new FileReader();
                      reader.onload = e => {
                        accept(e.target.result);
                      };
                      reader.readAsDataURL(blob);
                   }))
                );
              _requestServerIcon(server)
                 .then(serverIcon => {
                    const planeMesh = (() => {
                      const serverUi = biolumi.makeUi({
                        width: SERVER_WIDTH,
                        height: SERVER_HEIGHT,
                      });

                      const mesh = serverUi.addPage(({
                        server: {
                          worldname,
                          description,
                        },
                        serverIcon,
                      }) => {
                        return [
                          {
                            type: 'html',
                            src: menuRenderer.getServerSrc({
                              worldname,
                              description,
                              serverIcon,
                            }),
                            x: 0,
                            y: 0,
                            w: SERVER_WIDTH,
                            h: SERVER_HEIGHT,
                          },
                        ];
                      }, {
                        type: 'hub',
                        state: {
                          server: {
                            worldname: server.worldname,
                            description: server.url,
                          },
                          serverIcon,
                        },
                        worldWidth: SERVER_WORLD_WIDTH,
                        worldHeight: SERVER_WORLD_HEIGHT,
                      });
                      mesh.position.y = 0.45;
                      mesh.receiveShadow = true;
                      mesh.ui = serverUi;

                      serverUi.update();

                      return mesh;
                    })();
                    object.add(planeMesh);
                    object.planeMesh = planeMesh;
                  })
                  .catch(err => {
                    console.warn(err);
                  });

              const shadowMesh = (() => {
                const geometry = new THREE.BoxBufferGeometry(SERVER_WORLD_WIDTH, SERVER_WORLD_HEIGHT, 0.01);
                const material = transparentMaterial.clone();
                material.depthWrite = false;

                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                return mesh;
              })();
              object.add(shadowMesh);

              return object;
            };

            for (let i = 0; i < servers.length; i++) {
              const server = servers[i];

              const mesh = (() => {
                const object = new THREE.Object3D();
                object.position.x = -2 + (i * 1);
                object.position.y = 1.2;

                const envMesh = _makeServerEnvMesh(server);
                object.add(envMesh);
                object.envMesh = envMesh;

                const menuMesh = _makeServerMenuMesh(server);
                object.add(menuMesh);
                object.menuMesh = menuMesh;

                return object;
              })();
              result[i] = mesh;
            }

            return result;
          };
          const serversMesh = (() => {
            const object = new THREE.Object3D();
            object.visible = hubState.open;

            const serverMeshes = _getServerMeshes(bootstrap.getServers());
            for (let i = 0; i < serverMeshes.length; i++) {
              const serverMesh = serverMeshes[i];
              object.add(serverMesh);
            }
            object.serverMeshes = serverMeshes;

            return object;
          })();
          scene.add(serversMesh);

          const _updatePages = () => {
            menuUi.update();
          };
          _updatePages();

          const _update = () => {
            const _updateMenuAnchors = () => {
              const {gamepads} = webvr.getStatus();

              const {planeMesh} = menuMesh;
              const menuMatrixObject = _decomposeObjectMatrixWorld(planeMesh);
              const {page} = planeMesh;

              SIDES.forEach(side => {
                const gamepad = gamepads[side];

                if (gamepad) {
                  const {position: controllerPosition, rotation: controllerRotation} = gamepad;

                  const menuHoverState = menuHoverStates[side];
                  const menuDotMesh = menuDotMeshes[side];
                  const menuBoxMesh = menuBoxMeshes[side];

                  biolumi.updateAnchors({
                    objects: [{
                      matrixObject: menuMatrixObject,
                      page: page,
                      width: WIDTH,
                      height: HEIGHT,
                      worldWidth: WORLD_WIDTH,
                      worldHeight: WORLD_HEIGHT,
                      worldDepth: WORLD_DEPTH,
                    }],
                    hoverState: menuHoverState,
                    dotMesh: menuDotMesh,
                    boxMesh: menuBoxMesh,
                    controllerPosition,
                    controllerRotation,
                  });
                }
              });
            };
            const _updateServerMeshes = () => {
              const {hmd} = webvr.getStatus();
              const {serverMeshes} = serversMesh;

              for (let i = 0; i < serverMeshes.length; i++) {
                const serverMesh = serverMeshes[i];
                serverMesh.rotation.y = new THREE.Euler().setFromQuaternion(hmd.rotation, camera.rotation.order).y;
              }
            };

            _updateMenuAnchors();
            _updateServerMeshes();
          };
          rend.on('update', _update);

          this._cleanup = () => {
            scene.remove(menuMesh);
            SIDES.forEach(side => {
              scene.remove(menuDotMeshes[side]);
              scene.remove(menuBoxMeshes[side]);
            });

            serverMeshes.forEach(serverMesh => {
              scene.remove(serverMesh);
            });

            rend.removeListener('update', _update);
          };
        }
      });
  }

  unmount() {
    this._cleanup();
  }
}

const _padNumber = (n, width) => {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

module.exports = Hub;
