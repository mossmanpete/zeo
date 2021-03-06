const path = require('path');

class ZCake {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {express, app} = archae.getCore();

    const zCakeAudioStatic = express.static(path.join(__dirname, 'lib/audio'));
    function serveZCakeAudio(req, res, next) {
      zCakeAudioStatic(req, res, next);
    }
    app.use('/archae/z-cake/audio', serveZCakeAudio);

    this._cleanup = () => {
      function removeMiddlewares(route, i, routes) {
        if (route.handle.name === 'serveZCakeAudio') {
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
}

module.exports = ZCake;
