// Runs in Electron's Node utility process, never in the renderer.
const http = require('node:http');
const path = require('node:path');
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  http.Server.prototype.listen = originalListen;
  // Next's standalone entry point substitutes port 3000 for PORT=0. Override
  // only its first HTTP listen call so the OS reserves an available port.
  if (typeof args[0] === 'object') args[0] = { ...args[0], port: 0, host: '127.0.0.1' };
  else { args[0] = 0; if (typeof args[1] === 'string') args[1] = '127.0.0.1'; }
  this.once('listening', () => {
    const address = this.address();
    if (address && typeof address === 'object') process.parentPort.postMessage({ port: address.port });
  });
  return originalListen.apply(this, args);
};
const entry = process.argv[2];
process.chdir(path.dirname(entry));
require(entry);
