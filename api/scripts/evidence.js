#!/usr/bin/env node
/**
 * Genera la evidencia del completion report de WI-H2-API-CLIENTES-001 en
 * .sdd/evidence/WI-H2-API-CLIENTES-001/ (raíz del repositorio). Es un comando aparte
 * (`npm run evidence`): `npm test` no escribe nada versionado.
 *
 *  - test-results.txt      salida de `npm test -- --coverage ...`, el mismo comando que la plataforma
 *  - coverage-summary.json coverage/coverage-summary.json de esa corrida
 *  - migration.log         lo que la base tiene tras aplicar el esquema de Customer y Counter
 *  - performance.txt       la medición de R4-REND-1 (p95 < 300 ms con 50 peticiones concurrentes),
 *                          que no corre en la suite: en una CI cargada sería frágil
 *
 * Las rutas absolutas de la máquina se reescriben relativas a la raíz del repositorio:
 * la evidencia versionada no lleva rutas locales. Nada más se toca de la salida.
 *
 * Las funciones se exportan para la prueba de src/__tests__/evidence.spec.ts, que mide su
 * cobertura; el programa solo corre cuando se ejecuta este fichero.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORK_ITEM = 'WI-H2-API-CLIENTES-001';

const TEST_ARGV = ['npm', 'test', '--', '--coverage', '--coverageReporters=text', '--coverageReporters=json-summary'];
const MIGRATION_ARGV = ['npx', 'jest', '--runInBand', '--forceExit', '--coverage=false', 'src/__tests__/customerMigration.spec.ts'];
const PERFORMANCE_ARGV = [
  'npx',
  'jest',
  '--runInBand',
  '--forceExit',
  '--coverage=false',
  '--testMatch',
  '**/src/__tests__/**/*.perf.ts',
];

/** Las formas en que la raíz del repositorio puede aparecer escrita (macOS: /tmp ↔ /private/tmp), la más larga primero. */
function rootSpellings(repoRoot, realpath) {
  return [...new Set([repoRoot, realpath(repoRoot), repoRoot.replace(/^\/private\//, '/')])].sort(
    (a, b) => b.length - a.length
  );
}

/** Reescribe las rutas absolutas de la raíz como relativas a ella. */
function relativize(text, spellings) {
  let result = text;
  for (const root of spellings) {
    result = result.split(root + path.sep).join('').split(root).join('.');
  }
  return result;
}

/** El coverage-summary.json con sus claves relativas a la raíz del repositorio. */
function relativizeSummary(summary, repoRoot, realpath) {
  const relative = {};
  for (const [key, value] of Object.entries(summary)) {
    relative[key === 'total' ? key : path.relative(repoRoot, realpath(key))] = value;
  }
  return relative;
}

/** Ejecuta un comando en api/ y devuelve su estado y su salida (stdout + stderr). */
function runCommand(argv, options) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/**
 * Genera la evidencia. `run` ejecuta un comando ({status, output}); `log` escribe en la consola.
 * Devuelve true si todo salió bien.
 */
function generateEvidence({ apiDir, repoRoot, run, log, realpath = fs.realpathSync }) {
  const evidenceDir = path.join(repoRoot, '.sdd', 'evidence', WORK_ITEM);
  const spellings = rootSpellings(repoRoot, realpath);
  const exec = (argv, env = {}) => run(argv, { cwd: apiDir, env });
  fs.mkdirSync(evidenceDir, { recursive: true });
  let ok = true;

  // 1 · Pruebas con cobertura: el comando exacto que corre la plataforma
  const tests = exec(TEST_ARGV, { FORCE_COLOR: '0' });
  const branch = exec(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).output.trim();
  fs.writeFileSync(
    path.join(evidenceDir, 'test-results.txt'),
    `# Salida de: ${TEST_ARGV.join(' ')} (en api/, rama ${branch}; rutas relativas a la raíz del repositorio)\n\n` +
      relativize(tests.output, spellings),
    'utf8'
  );
  if (tests.status !== 0) ok = false;

  // 2 · Resumen de cobertura de esa misma corrida, con las claves relativas
  const summaryPath = path.join(apiDir, 'coverage', 'coverage-summary.json');
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    fs.writeFileSync(
      path.join(evidenceDir, 'coverage-summary.json'),
      JSON.stringify(relativizeSummary(summary, repoRoot, realpath), null, 2) + '\n',
      'utf8'
    );
  } else {
    ok = false;
  }

  // 3 · Migración de esquema: la prueba de migración escribe su listado en MIGRATION_LOG_FILE
  const migrationLog = path.join(evidenceDir, 'migration.log');
  const migration = exec(MIGRATION_ARGV, { MIGRATION_LOG_FILE: migrationLog });
  if (migration.status !== 0 || !fs.existsSync(migrationLog)) ok = false;
  log(relativize(migration.output, spellings));

  // 4 · Rendimiento (R4-REND-1): la medición escribe su resultado en PERFORMANCE_LOG_FILE
  const performanceLog = path.join(evidenceDir, 'performance.txt');
  const performance = exec(PERFORMANCE_ARGV, { PERFORMANCE_LOG_FILE: performanceLog });
  if (performance.status !== 0 || !fs.existsSync(performanceLog)) ok = false;
  log(relativize(performance.output, spellings));

  log(`Evidencia en ${path.relative(repoRoot, evidenceDir)}: ${ok ? 'OK' : 'CON FALLOS'}`);
  return ok;
}

module.exports = {
  TEST_ARGV,
  MIGRATION_ARGV,
  PERFORMANCE_ARGV,
  rootSpellings,
  relativize,
  relativizeSummary,
  runCommand,
  generateEvidence,
};

if (require.main === module) {
  const apiDir = path.resolve(__dirname, '..');
  const ok = generateEvidence({
    apiDir,
    repoRoot: path.resolve(apiDir, '..'),
    run: runCommand,
    log: (text) => console.log(text),
  });
  process.exit(ok ? 0 : 1);
}
