const path = require('node:path');
const fs = require('node:fs');
const Koa = require('koa');
const mime = require('mime');
const build = require('./faas-builder');
const { bodyParser } = require("@koa/bodyparser");

const app = new Koa();
app.use(bodyParser());

process.env.AC_APP_ID = process.env.AC_APP_ID || 'aircode-mock';
process.env.AC_MEMORY_SIZE = process.env.AC_MEMORY_SIZE || '1024';
process.env.AC_EXECUTION_TIMEOUT =process.env.AC_EXECUTION_TIMEOUT || 60;
process.env.AC_DEPLOYMENT_VERSION = -1;
process.env.AC_REGION = process.env.AC_REGION || 'local';
process.env.AC_NODE_JS_VERSION = process.version.match(/^v(\d+\.\d+)/)[1];
process.env.AC_FAAS_ROOT = process.env.AC_FAAS_ROOT || 'src';

build(process.env.AC_FAAS_ROOT);

const moduleAlias = require('module-alias');
moduleAlias.addAliases({
  'aircode': path.resolve(__dirname, 'runtime'),
});

require('aircode'); // for cache

function file(faas) {
  return path.resolve('.', process.env.AC_FAAS_ROOT, faas);
}

// response
app.use(async (ctx) => {
  const {method} = ctx.request;
  const params = method === 'GET' ? ctx.request.query : ctx.request.body;
  const context = {
    headers: ctx.request.headers,
    method,
    query: ctx.request.query,
    tirgger: 'HTTP',
    set: (field, value) => ctx.set(field, value),
    remove: (field) => ctx.remove(field),
    status: (code) => ctx.response.status = code,
  };
  const faas = ctx.request.path.slice(1);
  // console.log(faas);
  if(faas && !faas.startsWith('.')) {
    const fassname = file(faas);
    try {
      let module = require(fassname);
      if(typeof module !== 'function' && typeof module.default === 'function') {
        module = module.default;
      }
      if(typeof module === 'function') {
        try {
          const res = await module(params, context);
          ctx.body = JSON.stringify(res);
        } catch(ex) {
          console.error(ex);
        }
        return;
      }
    } catch (ex) {
      // do nothing
    }
  } else if(faas.startsWith('.files/')) {
    const filepath = file(faas);
    // console.log(filepath);
    if(fs.existsSync(filepath)) {
      const filestream = fs.createReadStream(filepath);
      // const filename = path.basename(filepath);
      // ctx.set('Content-disposition', 'attachment; filename=' + filename);
      const mimetype = mime.getType(filepath);
      ctx.set('Content-type', mimetype);
      ctx.body = filestream;
    } else {
      ctx.body = '404 Not Found File.';
    }
    return;
  }
  ctx.body = '404 Not Found.';
});

function start(port = process.env.AC_PORT || 3000) {
  app.listen(port);
  app.PORT = port;
  return app;
}

module.exports = {
  start,
  file,
};