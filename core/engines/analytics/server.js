class Analytics {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {metadata: {server: {url: serverUrl}}} = archae;

    const cleanups = [];
    this._cleanup = () => {
      for (let i = 0; i < cleanups.length; i++) {
        const cleanup = cleanups[i];
        cleanup();
      }
    };

    let live = true;
    cleanups.push(() => {
      live = false;
    });

    const _parseUrlSpec = url => {
      const match = url.match(/^(?:([^:]+):\/\/)([^:]+)(?::([0-9]*?))?$/);
      return match && {
        protocol: match[1],
        host: match[2],
        port: match[3] ? parseInt(match[3], 10) : null,
      };
    };

    return archae.requestPlugins([
      '/core/engines/multiplayer',
      '/core/utils/network-utils',
    ]).then(([
      multiplayer,
      networkUtils,
    ]) => {
      if (live) {
        const {AutoWsClient} = networkUtils;

        const modSpecs = [];
        const fileSpecs = [];

        const {port} = _parseUrlSpec(serverUrl);
        const ws = new AutoWsClient(`wss://my-site.zeovr.io/analytics/ws?port=${port}`);
        let needsUpdate = true;
        ws.on('connect', () => {
          if (needsUpdate) {
            _sendConfig();

            for (let i = 0; i < modSpecs.length; i++) {
              _sendAddMod(modSpecs[i]);
            }
            for (let i = 0; i < fileSpecs.length; i++) {
              _sendAddFile(fileSpecs[i]);
            }

            const playerStatuses = multiplayer.getPlayerStatuses();
            const playerUsernames = multiplayer.getPlayerUsernames();
            playerStatuses.forEach((playerStatus, n) => {
              const playerUsername = playerUsernames.get(n);

              _playerEnter({
                id: String(n),
                username: playerUsername,
              });
            });

            needsUpdate = false;
          }
        });
        ws.on('message', e => {
          const m = JSON.parse(e.data);
          const {method} = m;

          switch (method) {
            case 'ping': {
              ws.send(JSON.stringify({
                method: 'pong',
                args: {},
              }));
              break;
            }
            default: {
              console.warn('analytics server got unknown message method', JSON.stringify(method));
              break;
            }
          }
        });
        ws.on('disconnect', () => {
          needsUpdate = true;
        });
        ws.on('error', err => {
          console.warn(err);
        });

        const interval = setInterval(() => {
          ws.send(JSON.stringify({
            method: 'heartbeat',
            args: {},
          }));
        }, 10 * 1000);
        cleanups.push(() => {
          clearInterval(interval);
        });

        const _sendConfig = () => {
          const {metadata: {server: {name}, maxUsers}} = archae;
          ws.send(JSON.stringify({
            method: 'config',
            args: {
              name,
              maxUsers,
            },
          }));
        };

        const _sendAddMod = modSpec => {
          const {id, name, version} = modSpec;
          ws.send(JSON.stringify({
            method: 'addMod',
            args: {
              id,
              name,
              version,
            },
          }));
        };
        const _sendRemoveMod = modSpec => {
          const {id} = modSpec;
          ws.send(JSON.stringify({
            method: 'removeMod',
            args: {
              id,
            },
          }));
        };
        const _sendAddFile = fileSpec => {
          const {id} = fileSpec;
          ws.send(JSON.stringify({
            method: 'addFile',
            args: {
              id,
            },
          }));
        };
        const _sendRemoveFile = fileSpec => {
          const {id} = fileSpec;
          ws.send(JSON.stringify({
            method: 'removeFile',
            args: {
              id,
            },
          }));
        };

        const _playerEnter = ({id, username}) => {
          ws.send(JSON.stringify({
            method: 'playerEnter',
            args: {
              id,
              username,
            },
          }));
        };
        multiplayer.on('playerEnter', _playerEnter);
        const _playerLeave = id => {
          ws.send(JSON.stringify({
            method: 'playerLeave',
            args: {
              id,
            },
          }));
        };
        multiplayer.on('playerLeave', _playerLeave);

        this._cleanup = () => {
          multiplayer.removeListener('playerEnter', _playerEnter);
          multiplayer.removeListener('playerLeave', _playerLeave);
        };

        const analyticsApi = {
          addMod(modSpec) {
            modSpecs.push(modSpec);

            if (!needsUpdate) {
              _sendAddMod(modSpec);
            }
          },
          removeMod(modSpec) {
            const index = modSpecs.findIndex(ms => ms.id === modSpec.id);
            if (index !== -1) {
              modSpecs.splice(index, 1);
            }

            if (!needsUpdate) {
              _sendRemoveMod(modSpec);
            }
          },
          addFile(fileSpec) {
            fileSpecs.push(fileSpec);

            if (!needsUpdate) {
              _sendAddFile(fileSpec);
            }
          },
          removeFile(fileSpec) {
            const index = fileSpecs.findIndex(ms => ms.id === fileSpec.id);
            if (index !== -1) {
              fileSpecs.splice(index, 1);
            }

            if (!needsUpdate) {
              _sendRemoveFile(fileSpec);
            }
          },
        };
        return analyticsApi;
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Analytics;
