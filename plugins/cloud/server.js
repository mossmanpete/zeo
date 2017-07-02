const zlib = require('zlib');

const {
  NUM_CELLS,
  NUM_CELLS_OVERSCAN,
} = require('./lib/constants/constants');
const protocolUtils = require('./lib/utils/protocol-utils');

const NUM_POSITIONS = 20 * 1024;
const NUM_POSITIONS_CHUNK = 200 * 1024;
const CAMERA_ROTATION_ORDER = 'YXZ';

class Cloud {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {app} = archae.getCore();
    const {three, elements, utils: {random: {alea}}} = zeo;
    const {THREE} = three;

    const upVector = new THREE.Vector3(0, 1, 0);

    const rng = new alea();

    const _makeIndices = numPositions => {
      const indices = new Uint32Array(numPositions);
      for (let i = 0; i < numPositions; i++) {
        indices[i] = i;
      }
      return indices;
    };
    const _copyIndices = (src, dst, startIndexIndex, startAttributeIndex) => {
      for (let i = 0; i < src.length; i++) {
        dst[startIndexIndex + i] = src[i] + startAttributeIndex;
      }
    };

    const cloudTypes = [
      (() => {
        const geometry = new THREE.TetrahedronBufferGeometry(1, 1);
        const positions = geometry.getAttribute('position').array;
        const numPositions = positions.length / 3;
        const indices = _makeIndices(numPositions);
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        return geometry;
      })(),
      new THREE.BoxBufferGeometry(1, 1, 1),
    ];
    const _makeCloudPatchGeometry = () => {
      const cloudGeometries = [];
      const numClouds = 5 + Math.floor(Math.random() * 20);
      for (let j = 0; j < numClouds; j++) {
        const cloudType = cloudTypes[Math.floor(cloudTypes.length * Math.random())];
        const geometry = cloudType.clone()
          .applyMatrix(new THREE.Matrix4().makeScale(
            1 + (Math.random() * 8),
            1 + (Math.random() * 8),
            1 + (Math.random() * 8)
          ))
          .applyMatrix(new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(
              Math.random() * Math.PI * 2,
              Math.random() * Math.PI * 2,
              Math.random() * Math.PI * 2,
              CAMERA_ROTATION_ORDER
            )
          ))
          .applyMatrix(new THREE.Matrix4().makeTranslation(
            -25 + (Math.random() * 25),
            -5 + (Math.random() * 5),
            -25 + (Math.random() * 25)
          ));
        cloudGeometries.push(geometry);
      }

      const positions = new Float32Array(NUM_POSITIONS * 3);
      const indices = new Uint32Array(NUM_POSITIONS * 3);
      let attributeIndex = 0;
      let indexIndex = 0;
      for (let i = 0; i < cloudGeometries.length; i++) {
        const cloudGeometry = cloudGeometries[i];
        const newPositions = cloudGeometry.getAttribute('position').array;
        positions.set(newPositions, attributeIndex);
        const newIndices = cloudGeometry.index.array;
        _copyIndices(newIndices, indices, indexIndex, attributeIndex / 3);

        attributeIndex += newPositions.length;
        indexIndex += newIndices.length;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(positions.buffer, positions.byteOffset, attributeIndex), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices.buffer, indices.byteOffset, indexIndex), 1));
      return geometry;
    };
    const cloudPatchGeometries = (() => {
      const numCloudGeometries = 20;
      const result = Array(numCloudGeometries);
      for (let i = 0; i < numCloudGeometries; i++) {
        result[i] = _makeCloudPatchGeometry();
      }
      return result;
    })();

    const _makeCloudChunkMesh = (x, y, cloudPatchGeometries) => {
      const positions = new Float32Array(NUM_POSITIONS_CHUNK * 3);
      const indices = new Uint32Array(NUM_POSITIONS_CHUNK * 3);
      let attributeIndex = 0;
      let indexIndex = 0;

      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const matrix = new THREE.Matrix4();

      const cloudRng = new alea(x + ':' + y);
      const numCloudPatches = Math.floor(Math.random() * 5);
      for (let i = 0; i < numCloudPatches; i++) {
        const dx = cloudRng() * NUM_CELLS;
        const dy = cloudRng() * NUM_CELLS;
        const cloudPatchGeometry = cloudPatchGeometries[Math.floor(cloudRng() * cloudTypes.length)];

        position.set(
          (x * NUM_CELLS) + dx,
          50 + (cloudRng() * 20),
          (y * NUM_CELLS) + dy
        )
        quaternion.setFromAxisAngle(upVector, cloudRng() * Math.PI * 2);
        matrix.compose(position, quaternion, scale);
        const geometry = cloudPatchGeometry
          .clone()
          .applyMatrix(matrix);
        const newPositions = geometry.getAttribute('position').array;
        positions.set(newPositions, attributeIndex);
        const newIndices = geometry.index.array;
        _copyIndices(newIndices, indices, indexIndex, attributeIndex / 3);

        attributeIndex += newPositions.length;
        indexIndex += newIndices.length;
      }

      return {
        positions: new Float32Array(positions.buffer, positions.byteOffset, attributeIndex),
        indices: new Uint32Array(indices.buffer, indices.byteOffset, indexIndex),
      };
    };

    function cloudGenerate(req, res, next) {
      const {x: xs, y: ys} = req.query;
      const x = parseInt(xs, 10);
      const y = parseInt(ys, 10);

      if (!isNaN(x) && !isNaN(y)) {
        const cloudChunkGeometry = _makeCloudChunkMesh(x, y, cloudPatchGeometries);
        const cloudChunkBuffer = new Buffer(protocolUtils.stringifyCloudGeometry(cloudChunkGeometry));

        res.type('application/octet-stream');
        if (_acceptsEncoding(req, 'gzip')) {
          res.send(cloudChunkBuffer);
        } else {
          res.set('Content-Encoding', 'gzip');
          const cloudChunkStream = zlib.createGzip();
          cloudChunkStream.end(cloudChunkBuffer);
          cloudChunkStream.pipe(res);
        }
      } else {
        res.status(400);
        res.send();
      }
    }
    app.get('/archae/cloud/generate', cloudGenerate);

    this._cleanup = () => {
      function removeMiddlewares(route, i, routes) {
        if (route.handle.name === 'cloudGenerate') {
          routes.splice(i, 1);
        }
        if (route.route) {
          route.route.stack.forEach(removeMiddlewares);
        }
      }
      app._router.stack.forEach(removeMiddlewares);
    };
  }

  unmount() {
    this._cleanup();
  } 
};
const _acceptsEncoding = (req, encoding) => {
  const acceptEncoding = req.headers['accept-encoding'];
  return acceptEncoding ? acceptEncoding.trim().split(/ *, */).includes(encoding) : false;
};

module.exports = Cloud;
