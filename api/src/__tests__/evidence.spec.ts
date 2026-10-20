/**
 * El generador de evidencia de WI-H2-API-CLIENTES-001 (scripts/evidence.js): qué comandos corre,
 * qué escribe y que la evidencia no lleva rutas locales. Los comandos se sustituyen por uno falso:
 * esta prueba no lanza otra suite.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

interface RunOptions {
  cwd: string;
  env: Record<string, string>;
}
type Run = (argv: string[], options: RunOptions) => { status: number | null; output: string };
interface EvidenceModule {
  TEST_ARGV: string[];
  MIGRATION_ARGV: string[];
  PERFORMANCE_ARGV: string[];
  rootSpellings(repoRoot: string, realpath: (p: string) => string): string[];
  relativize(text: string, spellings: string[]): string;
  relativizeSummary(summary: Record<string, unknown>, repoRoot: string, realpath: (p: string) => string): Record<string, unknown>;
  runCommand: Run;
  generateEvidence(options: {
    apiDir: string;
    repoRoot: string;
    run: Run;
    log: (text: string) => void;
    realpath?: (p: string) => string;
  }): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const evidence = require('../../scripts/evidence.js') as EvidenceModule;

const identity = (p: string): string => p;

function makeRepo(): { repoRoot: string; apiDir: string; evidenceDir: string } {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-')));
  const apiDir = path.join(repoRoot, 'api');
  fs.mkdirSync(path.join(apiDir, 'coverage'), { recursive: true });
  fs.mkdirSync(path.join(apiDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(apiDir, 'src', 'app.ts'), '');
  return { repoRoot, apiDir, evidenceDir: path.join(repoRoot, '.sdd', 'evidence', 'WI-H2-API-CLIENTES-001') };
}

describe('scripts/evidence.js — generador de evidencia', () => {
  it('rootSpellings da las formas de la raíz, la más larga primero', () => {
    expect(evidence.rootSpellings('/private/tmp/repo', identity)).toEqual(['/private/tmp/repo', '/tmp/repo']);
    expect(evidence.rootSpellings('/home/repo', identity)).toEqual(['/home/repo']);
  });

  it('relativize reescribe las rutas de la raíz como relativas', () => {
    const spellings = evidence.rootSpellings('/private/tmp/repo', identity);
    expect(evidence.relativize('en /private/tmp/repo/api/src/app.ts y /tmp/repo', spellings)).toBe('en api/src/app.ts y .');
  });

  it('relativizeSummary deja total y pasa las demás claves a rutas relativas', () => {
    const summary = { total: { lines: { pct: 90 } }, '/r/api/src/app.ts': { lines: { pct: 80 } } };
    expect(evidence.relativizeSummary(summary, '/r', identity)).toEqual({
      total: { lines: { pct: 90 } },
      [path.join('api', 'src', 'app.ts')]: { lines: { pct: 80 } },
    });
  });

  it('runCommand devuelve el estado y la salida del comando', () => {
    const result = evidence.runCommand([process.execPath, '-e', 'console.log(process.env.EVIDENCE_TEST)'], {
      cwd: os.tmpdir(),
      env: { EVIDENCE_TEST: 'hola' },
    });
    expect(result).toEqual({ status: 0, output: 'hola\n' });
  });

  it('generateEvidence corre los cuatro comandos y escribe la evidencia sin rutas locales', () => {
    const { repoRoot, apiDir, evidenceDir } = makeRepo();
    const appFile = path.join(apiDir, 'src', 'app.ts');
    fs.writeFileSync(
      path.join(apiDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 95 } }, [appFile]: { statements: { pct: 100 } } })
    );
    const calls: string[][] = [];
    const run: Run = (argv, options) => {
      calls.push(argv);
      expect(options.cwd).toBe(apiDir);
      if (argv[0] === 'git') return { status: 0, output: 'feature/x\n' };
      if (options.env['MIGRATION_LOG_FILE']) fs.writeFileSync(options.env['MIGRATION_LOG_FILE'], 'migración OK\n');
      if (options.env['PERFORMANCE_LOG_FILE']) fs.writeFileSync(options.env['PERFORMANCE_LOG_FILE'], 'p95 OK\n');
      return { status: 0, output: `PASS ${appFile}\n` };
    };
    const logs: string[] = [];

    const ok = evidence.generateEvidence({ apiDir, repoRoot, run, log: (t) => logs.push(t) });

    expect(ok).toBe(true);
    expect(calls).toEqual([
      evidence.TEST_ARGV,
      ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
      evidence.MIGRATION_ARGV,
      evidence.PERFORMANCE_ARGV,
    ]);
    const results = fs.readFileSync(path.join(evidenceDir, 'test-results.txt'), 'utf8');
    expect(results).toContain('rama feature/x');
    expect(results).toContain(`PASS ${path.join('api', 'src', 'app.ts')}`);
    expect(results).not.toContain(repoRoot);
    const summary = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'coverage-summary.json'), 'utf8'));
    expect(Object.keys(summary)).toEqual(['total', path.join('api', 'src', 'app.ts')]);
    expect(fs.readFileSync(path.join(evidenceDir, 'migration.log'), 'utf8')).toBe('migración OK\n');
    expect(fs.readFileSync(path.join(evidenceDir, 'performance.txt'), 'utf8')).toBe('p95 OK\n');
    expect(logs[logs.length - 1]).toBe(`Evidencia en ${path.join('.sdd', 'evidence', 'WI-H2-API-CLIENTES-001')}: OK`);
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('generateEvidence avisa CON FALLOS si un comando falla o falta la cobertura', () => {
    const { repoRoot, apiDir } = makeRepo();
    const run: Run = () => ({ status: 1, output: 'FAIL\n' });
    const logs: string[] = [];

    expect(evidence.generateEvidence({ apiDir, repoRoot, run, log: (t) => logs.push(t) })).toBe(false);
    expect(logs[logs.length - 1]).toMatch(/CON FALLOS$/);
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
});
