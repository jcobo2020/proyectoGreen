#!/usr/bin/env node
/**
 * Genera la evidencia del completion report de WI-H2-API-CLIENTES-001 en
 * .sdd/evidence/WI-H2-API-CLIENTES-001/ (raíz del repositorio). Es un comando aparte
 * (`npm run evidence`): `npm test` no escribe nada versionado.
 *
 *  - test-results.txt      salida de `npm test -- --coverage ...`, el mismo comando que la plataforma
 *  - coverage-summary.json coverage/coverage-summary.json de esa corrida
 *  - migration.log         lo que la base tiene tras aplicar el esquema de Customer y Counter
 *
 * Las rutas absolutas de la máquina se reescriben relativas a la raíz del repositorio:
 * la evidencia versionada no lleva rutas locales. Nada más se toca de la salida.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiDir, '..');
const evidenceDir = path.join(repoRoot, '.sdd', 'evidence', 'WI-H2-API-CLIENTES-001');

/** Las formas en que la raíz del repositorio puede aparecer escrita (macOS: /tmp ↔ /private/tmp). */
const rootSpellings = [...new Set([repoRoot, fs.realpathSync(repoRoot), repoRoot.replace(/^\/private\//, '/')])].sort(
  (a, b) => b.length - a.length
);

function relativize(text) {
  let result = text;
  for (const root of rootSpellings) {
    result = result.split(root + path.sep).join('').split(root).join('.');
  }
  return result;
}

function run(argv, env) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: apiDir,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

fs.mkdirSync(evidenceDir, { recursive: true });
let failed = false;

// 1 · Pruebas con cobertura: el comando exacto que corre la plataforma
const testArgv = ['npm', 'test', '--', '--coverage', '--coverageReporters=text', '--coverageReporters=json-summary'];
const tests = run(testArgv, { FORCE_COLOR: '0' });
const branch = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).output.trim();
fs.writeFileSync(
  path.join(evidenceDir, 'test-results.txt'),
  `# Salida de: ${testArgv.join(' ')} (en api/, rama ${branch}; rutas relativas a la raíz del repositorio)\n\n` +
    relativize(tests.output),
  'utf8'
);
if (tests.status !== 0) failed = true;

// 2 · Resumen de cobertura de esa misma corrida, con las claves relativas
const summaryPath = path.join(apiDir, 'coverage', 'coverage-summary.json');
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const relative = {};
  for (const [key, value] of Object.entries(summary)) {
    relative[key === 'total' ? key : path.relative(repoRoot, fs.realpathSync(key))] = value;
  }
  fs.writeFileSync(path.join(evidenceDir, 'coverage-summary.json'), JSON.stringify(relative, null, 2) + '\n', 'utf8');
} else {
  failed = true;
}

// 3 · Migración de esquema: la prueba de migración escribe su listado en MIGRATION_LOG_FILE
const migrationLog = path.join(evidenceDir, 'migration.log');
const migration = run(
  ['npx', 'jest', '--runInBand', '--forceExit', '--coverage=false', 'src/__tests__/customerMigration.spec.ts'],
  { MIGRATION_LOG_FILE: migrationLog }
);
if (migration.status !== 0 || !fs.existsSync(migrationLog)) failed = true;

console.log(relativize(migration.output));
console.log(`Evidencia en ${path.relative(repoRoot, evidenceDir)}: ${failed ? 'CON FALLOS' : 'OK'}`);
process.exit(failed ? 1 : 0);
