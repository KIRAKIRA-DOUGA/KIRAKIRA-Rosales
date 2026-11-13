const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/** Load real TypeScript source with explicit dependencies and no application startup. */
function loadService(relativePath, dependencies = {}, globals = {}) {
	const filename = path.resolve(__dirname, '../..', relativePath);
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		fileName: filename,
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			esModuleInterop: true,
		},
	}).outputText;
	const module = { exports: {} };
	vm.runInNewContext(compiled, {
		module,
		exports: module.exports,
		Buffer,
		console: { error() {}, warn() {}, info() {}, log() {} },
		process: { env: {}, exit(code) { throw new Error(`Unexpected process.exit(${code})`); } },
		...globals,
		require(specifier) {
			if (!Object.hasOwn(dependencies, specifier)) {
				throw new Error(`Unmocked dependency in ${relativePath}: ${specifier}`);
			}
			return dependencies[specifier];
		},
	}, { filename });
	return module.exports;
}

module.exports = { loadService };
