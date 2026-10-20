/**
 * Siembra idempotente de la colección executives (RN-03, R4-ARQ-2): `npm run seed:executives`.
 * Lee la lista del equipo versionada en api/data/executives.json (o el fichero que se le pase:
 * `npm run seed:executives -- <fichero.json>`), crea con active = true los que falten y no toca a
 * los que ya existen. Antes crea la colección y sus índices, y al final lista lo que la base tiene
 * de executives (es el migration log). No escribe nombres en la salida: solo cuentas e índices.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '../config/connectDB';
import { ExecutiveModel } from '../models/executive';
import { ExecutiveService, SeedExecutivesResult } from '../services/ExecutiveService';
import { parseExecutiveSeed } from '../validators/executive.validator';
import { ValidationError } from '../lib/errors';

export type SeedLogger = (line: string) => void;

/** La lista del equipo versionada en el repo (§1 y RN-03 de la spec); vale desde src/ y desde dist/. */
export const TEAM_EXECUTIVES_FILE = path.resolve(__dirname, '../../data/executives.json');

export function readExecutiveSeedFile(filePath: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new ValidationError('Entrada inválida', [
      { field: 'file', message: 'No se pudo leer el fichero del seed como JSON' },
    ]);
  }
  return parseExecutiveSeed(raw);
}

export async function runSeedExecutives(
  names: string[],
  log: SeedLogger = console.log,
  service: ExecutiveService = new ExecutiveService()
): Promise<SeedExecutivesResult> {
  // Esquema: crea la colección executives y sus índices declarados en el modelo
  await ExecutiveModel.createCollection();
  await ExecutiveModel.syncIndexes();

  const result = await service.seedMissing(names);

  const collectionName = ExecutiveModel.collection.collectionName;
  const collections = await mongoose.connection.db!
    .listCollections({ name: collectionName })
    .toArray();
  const indexes = await ExecutiveModel.collection.listIndexes().toArray();
  const total = await ExecutiveModel.countDocuments();
  const active = await ExecutiveModel.countDocuments({ active: true });

  log(`=== seed:executives ===`);
  log(`Colección '${collectionName}': ${collections.length === 1 ? 'existe' : 'NO existe'}`);
  log(`Índices en '${collectionName}':`);
  for (const idx of indexes) {
    const collation = idx.collation as { locale?: string; strength?: number } | undefined;
    const collationText = collation ? ` [collation ${collation.locale} strength ${collation.strength}]` : '';
    log(`  - ${idx.name as string}: ${JSON.stringify(idx.key)}${idx.unique ? ' [UNIQUE]' : ''}${collationText}`);
  }
  log(`Nombres en la lista: ${names.length}`);
  log(`Creados: ${result.created} · Ya existían (sin tocar): ${result.unchanged}`);
  log(`Ejecutivos en la colección: ${total} · Ejecutivos activos: ${active}`);

  return result;
}

export interface SeedExecutivesCliDeps {
  connect: () => Promise<unknown>;
  disconnect: () => Promise<void>;
  log: SeedLogger;
  logError: SeedLogger;
}

const defaultCliDeps: SeedExecutivesCliDeps = {
  connect: () => connectDB(),
  disconnect: () => mongoose.disconnect(),
  log: console.log,
  logError: console.error,
};

/** Punto de entrada de línea de comandos. Sin argumento siembra la lista del equipo. Devuelve el código de salida (0 = OK). */
export async function seedExecutivesCli(
  argv: string[],
  deps: SeedExecutivesCliDeps = defaultCliDeps
): Promise<number> {
  try {
    const filePath = argv[0] ?? TEAM_EXECUTIVES_FILE;
    const names = readExecutiveSeedFile(filePath);
    await deps.connect();
    try {
      await runSeedExecutives(names, deps.log);
    } finally {
      await deps.disconnect();
    }
    return 0;
  } catch (err) {
    if (err instanceof ValidationError) {
      deps.logError(JSON.stringify({ code: err.code, message: err.message, details: err.details }));
    } else {
      deps.logError(`Error en seed:executives: ${err instanceof Error ? err.message : String(err)}`);
    }
    return 1;
  }
}

if (require.main === module) {
  seedExecutivesCli(process.argv.slice(2)).then((code) => process.exit(code));
}
