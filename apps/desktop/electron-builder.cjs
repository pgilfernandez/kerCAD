const legacy = process.env.KERCAD_DESKTOP_VARIANT === 'legacy';
if (legacy && process.platform !== 'darwin') throw new Error('Legacy desktop builds are macOS-only.');

module.exports = {
  appId: legacy ? 'org.kercad.desktop.electron.legacy' : 'org.kercad.desktop.electron',
  productName: 'kerCAD',
  electronVersion: legacy ? '43.8.8' : '45.3.0',
  directories: { app: 'staging/app', output: `../../dist/desktop/${legacy ? 'legacy' : 'current'}`, buildResources: 'staging/icons' },
  files: ['**/*'],
  extraResources: [
    { from: 'staging/server', to: 'server' },
    // electron-builder excludes a source root's node_modules from ordinary
    // resource copies. The standalone server needs its traced dependencies.
    { from: 'staging/server/node_modules', to: 'server/node_modules' },
    { from: 'staging/icons/icon.png', to: 'icon.png' },
  ],
  asar: true,
  npmRebuild: false,
  artifactName: 'kerCAD.${ext}',
  mac: { target: ['dmg'], minimumSystemVersion: legacy ? '12.0' : '13.0', category: 'public.app-category.graphics-design' },
  win: { target: ['nsis'] },
  nsis: { artifactName: 'kerCAD installer.exe', oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
  linux: { target: ['AppImage', 'deb'], category: 'Graphics', maintainer: 'kerCAD contributors' },
};
