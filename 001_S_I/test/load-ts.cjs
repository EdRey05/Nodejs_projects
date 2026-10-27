const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
module.exports = function load(name) {
  const filename = path.resolve(__dirname, '../src/lib', `${name}.ts`);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  mod.require = id => id.startsWith('./') ? module.exports(id.slice(2)) : originalRequire(id);
  cache.set(filename, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return mod.exports;
};
