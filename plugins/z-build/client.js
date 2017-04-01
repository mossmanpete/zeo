const mod = require('mod-loop');

const DIRTY_TIME = 1000;

const SIDES = ['left', 'right'];

class ZBuild {
  mount() {
    const {three: {THREE, scene, camera}, elements, input, pose, world, render, utils: {function: funUtils, geometry: geometryUtils, menu: menuUtils}} = zeo;

    const targetPlaneImg = menuUtils.getTargetPlaneImg();
    const colorWheelImg = menuUtils.getColorWheelImg();

    let live = true;
    this.cleanup = () => {
      live = false;
    };

    const worldElement = elements.getWorldElement();

    const _requestImg = url => new Promise((accept, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        accept(img);
      };
      img.onerror = err => {
        reject(err);
      };
    });
    const _requestImgs = () => Promise.all([
      _requestImg('/archae/z-build/icons/rotate.svg'),
      _requestImg('/archae/z-build/icons/resize.svg'),
    ])
      .then(([
        rotateImg,
        resizeImg,
      ]) => ({
        rotateImg,
        resizeImg,
      }));

    return _requestImgs()
      .then(({
        rotateImg,
        resizeImg,
      }) => {
        if (live) {
          const _decomposeObjectMatrixWorld = object => _decomposeMatrix(object.matrixWorld);
          const _decomposeMatrix = matrix => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(position, rotation, scale);
            return {position, rotation, scale};
          };

          const zeroVector = new THREE.Vector3();
          const zeroQuaternion = new THREE.Quaternion();
          const oneVector = new THREE.Vector3(1, 1, 1);

          const shapeMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            shading: THREE.FlatShading,
            side: THREE.DoubleSide,
          });

          const buildComponent = {
            selector: 'build[position][color]',
            attributes: {
              position: {
                type: 'matrix',
                value: [
                  0, 1.2, 0,
                  0, 0, 0, 1,
                  1, 1, 1,
                ],
              },
              color: {
                type: 'color',
                value: '#808080',
              },
              file: {
                type: 'file',
                value: () => elements.makeFile({
                  ext: 'json',
                }).then(file => file.url),
              },
              grabbable: {
                type: 'checkbox',
                value: true,
              },
              holdable: {
                type: 'checkbox',
                value: true,
              },
              size: {
                type: 'vector',
                value: [0.2, 0.2, 0.2],
              },
            },
            entityAddedCallback(entityElement) {
              const entityApi = entityElement.getComponentApi();
              const entityObject = entityElement.getObject();

              const toolMesh = (() => {
                const object = new THREE.Object3D();

                const coreMesh = (() => {
                  const geometry = (() => {
                    const sq = n => Math.sqrt((n * n) + (n * n));

                    const coreGeometry = new THREE.BoxBufferGeometry(0.02, 0.02, 0.1);
                    const tipsGeometries = [
                      new THREE.BoxBufferGeometry(0.01, 0.01, 0.03)
                        .applyMatrix(new THREE.Matrix4().makeTranslation(-0.02 / 2, 0.02 / 2, -0.1 / 2)),
                      new THREE.BoxBufferGeometry(0.01, 0.01, 0.03)
                        .applyMatrix(new THREE.Matrix4().makeTranslation(0.02 / 2, 0.02 / 2, -0.1 / 2)),
                      new THREE.BoxBufferGeometry(0.01, 0.01, 0.03)
                        .applyMatrix(new THREE.Matrix4().makeTranslation(-0.02 / 2, -0.02 / 2, -0.1 / 2)),
                      new THREE.BoxBufferGeometry(0.01, 0.01, 0.03)
                        .applyMatrix(new THREE.Matrix4().makeTranslation(0.02 / 2, -0.02 / 2, -0.1 / 2)),
                    ];

                    return geometryUtils.concatBufferGeometry([coreGeometry].concat(tipsGeometries));
                  })();
                  const material = new THREE.MeshPhongMaterial({
                    color: 0x808080,
                  });

                  const mesh = new THREE.Mesh(geometry, material);
                  return mesh;
                })();
                object.add(coreMesh);
                object.coreMesh = coreMesh;

                const shapeMeshContainer = (() => {
                  const object = new THREE.Object3D();
                  object.position.z = -(0.1 / 2) - (0.03 / 2);
                  return object;
                })();
                object.add(shapeMeshContainer);
                object.shapeMeshContainer = shapeMeshContainer;

                const menuMesh = (() => {
                  const object = new THREE.Object3D();

                  const targetPlaneMesh = (() => {
                    const geometry = (() => {
                      const planeGeometries = [
                        new THREE.PlaneBufferGeometry(0.1, 0.1)
                          .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
                          .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0.1 / 2, 0)),
                        new THREE.PlaneBufferGeometry(0.1, 0.1)
                          .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
                          .applyMatrix(new THREE.Matrix4().makeRotationZ(-Math.PI / 2))
                          .applyMatrix(new THREE.Matrix4().makeTranslation(0.1 / 2, 0, 0)),
                        new THREE.PlaneBufferGeometry(0.1, 0.1)
                          .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
                          .applyMatrix(new THREE.Matrix4().makeRotationZ(Math.PI))
                          .applyMatrix(new THREE.Matrix4().makeTranslation(0, -0.1 / 2, 0)),
                        new THREE.PlaneBufferGeometry(0.1, 0.1)
                          .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
                          .applyMatrix(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
                          .applyMatrix(new THREE.Matrix4().makeTranslation(-0.1 / 2, 0, 0)),
                      ];

                      return geometryUtils.concatBufferGeometry(planeGeometries);
                    })();
                    const texture = new THREE.Texture(
                      targetPlaneImg,
                      THREE.UVMapping,
                      THREE.ClampToEdgeWrapping,
                      THREE.ClampToEdgeWrapping,
                      THREE.NearestFilter,
                      THREE.NearestFilter,
                      THREE.RGBAFormat,
                      THREE.UnsignedByteType,
                      16
                    );
                    texture.needsUpdate = true;
                    const material = new THREE.MeshBasicMaterial({
                      color: 0xFFFFFF,
                      map: texture,
                      side: THREE.DoubleSide,
                      transparent: true,
                      alphaTest: 0.5,
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    return mesh;
                  })();
                  object.add(targetPlaneMesh);

                  const shapeMesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.y = 0.05;

                    const backgroundMesh = (() => {
                      const geometry = new THREE.PlaneBufferGeometry(0.09, 0.09)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = new THREE.MeshPhongMaterial({
                        color: 0x808080,
                        shading: THREE.FlatShading,
                        side: THREE.DoubleSide,
                      });
                      return new THREE.Mesh(geometry, material);
                    })();
                    object.add(backgroundMesh);

                    const boxMesh = (() => {
                      const geometry = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'box';
                      return mesh;
                    })();
                    const rectangleMesh = (() => {
                      const geometry = new THREE.BoxBufferGeometry(0.01, 0.02, 0.01)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'rectangle';
                      return mesh;
                    })();
                    const triangularPyramidMesh = (() => {
                      const geometry = new THREE.CylinderBufferGeometry(0, sq(0.005), 0.01, 3, 1)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'triangularPyramid';
                      return mesh;
                    })();
                    const rectangularPyramidMesh = (() => {
                      const geometry = new THREE.CylinderBufferGeometry(0, sq(0.005), 0.01, 4, 1)
                        .applyMatrix(new THREE.Matrix4().makeRotationY(-Math.PI * (3 / 12)))
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'rectangularPyramid';
                      return mesh;
                    })();
                    const planeMesh = (() => {
                      const geometry = new THREE.PlaneBufferGeometry(0.01, 0.01);
                        // .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
                        // .applyMatrix(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'plane';
                      return mesh;
                    })();
                    const sphereMesh = (() => {
                      const geometry = new THREE.SphereBufferGeometry(0.005, 8, 8)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'sphere';
                      return mesh;
                    })();
                    const cylinderMesh = (() => {
                      const geometry = new THREE.CylinderBufferGeometry(0.005, 0.005, 0.01, 8, 1)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'cylinder';
                      return mesh;
                    })();
                    const torusMesh = (() => {
                      const geometry = new THREE.TorusBufferGeometry(0.005, 0.005 / 4, 4, 8)
                        .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                      const material = shapeMaterial;
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.shapeType = 'torus';
                      return mesh;
                    })();
                    const shapeMeshes = [
                      boxMesh,
                      rectangleMesh,
                      triangularPyramidMesh,
                      rectangularPyramidMesh,
                      planeMesh,
                      sphereMesh,
                      cylinderMesh,
                      torusMesh,
                    ];

                    const width = 0.09;
                    const height = 0.09;
                    const shapesPerRow = 4;
                    const shapesPerCol = 2;
                    const shapeWidth = width / shapesPerRow;
                    const shapeHeight = height / shapesPerCol;
                    shapeMeshes.forEach((shapeMesh, index) => {
                      const x = index % shapesPerRow;
                      const y = Math.floor(index / shapesPerRow);
                      shapeMesh.position.x = -(width / 2) + (shapeWidth / 2) + (x * (width / shapesPerRow));
                      shapeMesh.position.y = 0.01 / 2;
                      shapeMesh.position.z = -(height / 2) + (shapeHeight / 2) + (y * (height / shapesPerCol));

                      object.add(shapeMesh);
                    });
                    object.shapeMeshes = shapeMeshes;

                    return object;
                  })();
                  object.add(shapeMesh);
                  object.shapeMesh = shapeMesh;

                  const colorMesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.x = 0.05;
                    object.rotation.z = -Math.PI / 2;
                    object.rotation.order = camera.rotation.order;

                    const colorWheelMesh = (() => {
                      const size = 0.09;

                      const object = new THREE.Object3D();
                      object.size = size;

                      const planeMesh = (() => {
                        const geometry = new THREE.PlaneBufferGeometry(size, size)
                          .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

                        const texture = new THREE.Texture(
                          colorWheelImg,
                          THREE.UVMapping,
                          THREE.ClampToEdgeWrapping,
                          THREE.ClampToEdgeWrapping,
                          THREE.NearestFilter,
                          THREE.NearestFilter,
                          THREE.RGBAFormat,
                          THREE.UnsignedByteType,
                          16
                        );
                        texture.needsUpdate = true;
                        const material = new THREE.MeshBasicMaterial({
                          color: 0xFFFFFF,
                          map: texture,
                          side: THREE.DoubleSide,
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        return mesh;
                      })();
                      object.add(planeMesh);

                      const notchMesh = (() => {
                        const geometry = new THREE.CylinderBufferGeometry(0, sq(0.002), 0.005, 4, 1)
                          .applyMatrix(new THREE.Matrix4().makeRotationY(-Math.PI * (3 / 12)))
                          .applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI));
                        const material = new THREE.MeshPhongMaterial({
                          color: 0xFF0000,
                          shading: THREE.FlatShading,
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.position.y = 0.005 / 2;
                        return mesh;
                      })();
                      object.add(notchMesh);
                      object.notchMesh = notchMesh;

                      return object;
                    })();
                    object.add(colorWheelMesh);
                    object.colorWheelMesh = colorWheelMesh;

                    return object;
                  })();
                  object.add(colorMesh);
                  object.colorMesh = colorMesh;

                  const rotateMesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.y = -0.05;
                    object.rotation.x = -Math.PI / 2;
                    object.rotation.z = Math.PI;
                    object.rotation.order = camera.rotation.order;

                    const planeMesh = (() => {
                      const geometry = new THREE.PlaneBufferGeometry(0.09, 0.09);
                      const texture = new THREE.Texture(
                        rotateImg,
                        THREE.UVMapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.NearestFilter,
                        THREE.NearestFilter,
                        THREE.RGBAFormat,
                        THREE.UnsignedByteType,
                        16
                      );
                      texture.needsUpdate = true;
                      const material = new THREE.MeshBasicMaterial({
                        color: 0xFFFFFF,
                        map: texture,
                        side: THREE.DoubleSide,
                        transparent: true,
                        alphaTest: 0.5,
                      });

                      const mesh = new THREE.Mesh(geometry, material);
                      return mesh;
                    })();
                    object.add(planeMesh);

                    return object;
                  })();
                  object.add(rotateMesh);
                  object.rotateMesh = rotateMesh;

                  const scaleMesh = (() => {
                    const object = new THREE.Object3D();
                    object.position.x = -0.05;
                    object.rotation.x = -Math.PI / 2;
                    object.rotation.z = Math.PI / 2;
                    object.rotation.order = 'ZYX';

                    const planeMesh = (() => {
                      const geometry = new THREE.PlaneBufferGeometry(0.09, 0.09);
                      const texture = new THREE.Texture(
                        resizeImg,
                        THREE.UVMapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.NearestFilter,
                        THREE.NearestFilter,
                        THREE.RGBAFormat,
                        THREE.UnsignedByteType,
                        16
                      );
                      texture.needsUpdate = true;
                      const material = new THREE.MeshBasicMaterial({
                        color: 0xFFFFFF,
                        map: texture,
                        side: THREE.DoubleSide,
                        transparent: true,
                        alphaTest: 0.5,
                      });

                      const mesh = new THREE.Mesh(geometry, material);
                      return mesh;
                    })();
                    object.add(planeMesh);

                    return object;
                  })();
                  object.add(scaleMesh);
                  object.scaleMesh = scaleMesh;

                  return object;
                })();
                object.add(menuMesh);
                object.menuMesh = menuMesh;

                return object;
              })();
              entityObject.add(toolMesh);

              const meshesContainer = new THREE.Object3D();
              scene.add(meshesContainer);

              entityApi.align = () => {
                const {position} = entityApi;

                entityObject.position.set(position[0], position[1], position[2]);
                entityObject.quaternion.set(position[3], position[4], position[5], position[6]);
                entityObject.scale.set(position[7], position[8], position[9]);
              };

              entityApi.color = new THREE.Color(0x000000);
              entityApi.render = () => {
                const {color} = entityApi;
                const {coreMesh} = toolMesh;

                coreMesh.material.color.copy(color);
              };

              const _makeShapeMesh = ({
                shapeType = 'box',
              }) => {
                const {
                  menuMesh: {
                    shapeMesh: {
                      shapeMeshes,
                    },
                  },
                } = toolMesh;
                const shapeMesh = shapeMeshes.find(shapeMesh => shapeMesh.shapeType === shapeType);
                const shapeMeshClone = shapeMesh.clone();
                shapeMeshClone.position.copy(zeroVector);
                shapeMeshClone.quaternion.copy(zeroQuaternion);
                shapeMeshClone.scale.copy(oneVector);
                return shapeMeshClone;
              };
              let mesh = null;

              const meshes = [];

              entityApi.load = () => {
                const {file} = entityApi;

                if (file) {
                  file.read({
                    type: 'model',
                  })
                    .then(newMeshesContainer => {
                      const {children} = newMeshesContainer;
                      for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        meshesContainer.add(child);
                      }
                    });
                } else {
                  if (mesh) {
                    scene.remove(mesh);
                    mesh = null;
                  }

                  for (let i = 0; i < meshes.length; i++) {
                    const mesh = meshes[i];
                    scene.remove(mesh);
                  }
                  meshes.length = 0;

                  SIDES.forEach(side => {
                    const buildState = buildStates[side];
                    buildState.building = false;
                  });
                }
              };

              let dirtyFlag = false;
              entityApi.cancelSave = null;
              entityApi.save = () => {
                const {cancelSave} = entityApi;

                if (!cancelSave) {
                  const timeout = setTimeout(() => {
                    const {file} = entityApi;

                    const s = JSON.stringify(meshesContainer.toJSON(), null, 2);

                    const _cleanup = () => {
                      entityApi.cancelSave = null;

                      if (dirtyFlag) {
                        dirtyFlag = false;

                        entityApi.save();
                      }
                    };

                    file.write(s)
                      .then(() => {
                        if (live) {
                          const broadcastEvent = new CustomEvent('broadcast', { // XXX support multiplayer here
                            detail: {
                              type: 'build.update',
                              id: entityElement.getId(),
                            },
                          });
                          worldElement.dispatchEvent(broadcastEvent);

                          _cleanup();
                        }
                      })
                      .catch(err => {
                        console.warn(err);

                        _cleanup();
                      });

                    entityApi.cancelSave = () => {
                      live = false;
                    };

                    dirtyFlag = false;
                  }, DIRTY_TIME);

                  entityApi.cancelSave = () => {
                    cancelTimeout(timeout);
                  };
                }
              };

              const _makeBuildState = () => ({
                grabbed: false,
                building: false,
                pressed: false,
                touchStart: null,
                touchCurrent: null,
                menu: 'shape',
                angle: 0,
                color: '',
              });
              const buildStates = {
                left: _makeBuildState(),
                right: _makeBuildState(),
              };

              const _grab = e => {
                const {detail: {side}} = e;
                const buildState = buildStates[side];

                buildState.grabbed = true;
              };
              entityElement.addEventListener('grab', _grab);
              const _release = e => {
                const {detail: {side}} = e;
                const buildState = buildStates[side];

                buildState.grabbed = false;
                buildState.building = false;
              };
              entityElement.addEventListener('release', _release);
              const _triggerdown = e => {
                const {side} = e;
                const {file} = entityApi;

                if (file) {
                  const buildState = buildStates[side];
                  const {grabbed} = buildState;

                  if (grabbed) {
                    buildState.building = true;

                    mesh = _makeShapeMesh({
                      shapeType: 'box',
                    });
                    const {shapeMeshContainer} = toolMesh;
                    shapeMeshContainer.add(mesh);
                  }
                }
              };
              input.on('triggerdown', _triggerdown);
              const _triggerup = e => {
                const {side} = e;
                const {file} = entityApi;

                if (file) {
                  const buildState = buildStates[side];
                  const {grabbed} = buildState;

                  if (grabbed) {
                    buildState.building = false;

                    const {position, rotation, scale} = _decomposeObjectMatrixWorld(mesh);
                    meshesContainer.add(mesh);
                    mesh.position.copy(position);
                    mesh.quaternion.copy(rotation);
                    mesh.scale.copy(scale);

                    entityApi.save();
                  }
                }
              };
              input.on('triggerup', _triggerup);
              const _paddown = e => {
                const {side} = e;
                const buildState = buildStates[side];
                const {grabbed} = buildState;

                if (grabbed) {
                  buildState.pressed = true;

                  // XXX handle notch-tracking the current menu here

                  e.stopImmediatePropagation();
                }
              };
              input.on('paddown', _paddown, {
                priority: 1,
              });
              const _padup = e => {
                const {side} = e;
                const buildState = buildStates[side];
                const {grabbed} = buildState;

                if (grabbed) {
                  buildState.pressed = false;

                  // XXX handle pressing the current menu here

                  e.stopImmediatePropagation();
                }
              };
              input.on('padup', _padup, {
                priority: 1,
              });

              const menuRotationSpecs = [
                {
                  menu: 'shape',
                  angle: 0,
                },
                {
                  menu: 'color',
                  angle: Math.PI / 2 * 3,
                },
                {
                  menu: 'resize',
                  angle: Math.PI,
                },
                {
                  menu: 'scale',
                  angle: Math.PI / 2,
                },
              ];
              const _touchDiffToAngle = touchDiff => (-touchDiff.x / 2) * Math.PI;
              const _angleDiff = (a, b) => {
                let diff = b - a;
                diff = mod(diff + Math.PI, Math.PI * 2) - Math.PI;
                return Math.abs(diff);
              };
              const _update = () => {
                const {gamepads} = pose.getStatus();

                SIDES.forEach(side => {
                  const buildState = buildStates[side];
                  const {grabbed} = buildState;

                  if (grabbed) {
                    const gamepad = gamepads[side];

                    if (gamepad) {
                      const {buttons: {pad: {touched: padTouched}}} = gamepad;
                      const {touchStart} = buildState;

                      if (padTouched && !touchStart) {
                        const {axes} = gamepad;
                        buildState.touchStart = new THREE.Vector2().fromArray(axes);
                        buildState.touchCurrent = buildState.touchStart.clone();
                      } else if (!padTouched && touchStart) {
                        const {touchCurrent, angle: startAngle} = buildState;
                        const touchDiff = touchCurrent.clone().sub(touchStart);

                        const menuRotationDistanceSpecs = menuRotationSpecs.map(menuRotationSpec => {
                          const {menu, angle} = menuRotationSpec;
                          const distance = _angleDiff(startAngle + _touchDiffToAngle(touchDiff), angle);

                          return {
                            menu,
                            angle,
                            distance,
                          };
                        });
                        const closestMenuRotationSpec = menuRotationDistanceSpecs.sort((a, b) => a.distance - b.distance)[0];

                        buildState.touchStart = null;
                        buildState.menu = closestMenuRotationSpec.menu;
                        buildState.angle = closestMenuRotationSpec.angle;

                        const {menuMesh} = toolMesh;
                        menuMesh.rotation.z = closestMenuRotationSpec.angle;
                      } else if (padTouched && touchStart) {
                        const {axes} = gamepad;
                        const touchCurrent = new THREE.Vector2().fromArray(axes);
                        buildState.touchCurrent = touchCurrent;

                        const {menuMesh} = toolMesh;
                        const {menuMesh} = toolMesh;
                        const {angle: startAngle} = buildState;
                        const touchDiff = touchCurrent.clone().sub(touchStart);
                        menuMesh.rotation.z = startAngle + _touchDiffToAngle(touchDiff);
                      }
                    }
                  }
                });
              };
              render.on('update', _update);

              entityApi._cleanup = () => {
                entityObject.remove(toolMesh);
                scene.remove(meshesContainer);

                for (let i = 0; i < meshes.length; i++) {
                  const mesh = meshes[i];
                  scene.remove(mesh);
                }

                const {cancelSave} = entityApi;
                if (cancelSave) {
                  cancelSave();
                }

                entityElement.removeEventListener('grab', _grab);
                entityElement.removeEventListener('release', _release);

                input.removeListener('triggerdown', _triggerdown);
                input.removeListener('triggerup', _triggerup);
                input.removeListener('paddown', _paddown);
                input.removeListener('padup', _padup);

                render.removeListener('update', _update);
              };
            },
            entityRemovedCallback(entityElement) {
              const entityApi = entityElement.getComponentApi();
              entityApi._cleanup();
            },
            entityAttributeValueChangedCallback(entityElement, name, oldValue, newValue) {
              const entityApi = entityElement.getComponentApi();

              switch (name) {
                case 'position': {
                  entityApi.position = newValue;

                  entityApi.align();

                  break;
                }
                case 'file': {
                  entityApi.file = newValue;

                  entityApi.load();

                  if (!newValue) {
                    const {cancelSave} = entityApi;

                    if (cancelSave) {
                      cancelSave();
                      entityApi.cancelSave = null;
                    }
                  }

                  break;
                }
                case 'color': {
                  entityApi.color = new THREE.Color(newValue);

                  entityApi.render();

                  break;
                }
              }
            },
          };
          elements.registerComponent(this, buildComponent);

          this._cleanup = () => {
            elements.unregisterComponent(this, buildComponent);
          };
        }
      });
  }

  unmount() {
    this._cleanup();
  }
}

const sq = n => Math.sqrt((n * n) + (n * n));
const _concatArrayBuffers = as => {
  let length = 0;
  for (let i = 0; i < as.length; i++) {
    const e = as[i];
    length += e.length;
  }

  const result = new Uint8Array(length);
  let index = 0;
  for (let i = 0; i < as.length; i++) {
    const e = as[i];
    result.set(e, index);
    index += e.length;
  }
  return result;
};

module.exports = ZBuild;
