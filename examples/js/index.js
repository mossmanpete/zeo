archae.requestEngines([
  '/core/engines/zeo',
])
  .then(([
    zeo,
  ]) => zeo.requestDeleteWorld('proteus')
    .then(() => zeo.requestChangeWorld('proteus')
      .then(world => {
        console.log('loaded world', world);

        /* world.requestMods([
          '/extra/plugins/zeo/singleplayer',
          '/extra/plugins/zeo/teleport',
          // '/extra/plugins/zeo/light',
          // '/extra/plugins/zeo/hmd',
          '/extra/plugins/zeo/physics',
          '/extra/plugins/zeo/multiplayer',
          '/extra/plugins/zeo/fog',
          '/extra/plugins/zeo/skybox',
          '/extra/plugins/zeo/ocean',
          '/extra/plugins/zeo/models',
          '/extra/plugins/zeo/keyboard',
          // '/extra/plugins/zeo/shell',
          // '/extra/plugins/zeo/clouds',
          '/extra/plugins/zeo/rain',
          '/extra/plugins/zeo/weapons',
          '/extra/plugins/zeo/youtube',
          '/extra/plugins/zeo/lens',
          '/extra/plugins/zeo/portal',
          '/extra/plugins/zeo/camera',
          // '/extra/plugins/zeo/build',
        ]) */
      })
    )
  )
  .then(() => {
    console.log('app started');
  })
  .catch(err => {
    console.warn(err);
  });
