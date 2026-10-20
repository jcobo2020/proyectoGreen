/**
 * Siembra idempotente de la colección executives (RN-03, R4-ARQ-2): `npm run seed:executives`.
 * Lee la lista del equipo versionada en api/data/executives.json (o el fichero que se le pase:
 * `npm run seed:executives -- <fichero.json>`), crea con active = true los que falten y no toca a
 * los que ya existen. Antes crea la colección y sus índices, y al final lista lo que la base tiene
 * de executives (es el migration log). Falla CERRADA (RN-03 de la v6): si los datos previos repiten
 * un nombre sin distinguir mayúsculas, tildes ni la ñ, sale con 1 sin sembrar y sin intentar crear
 * el índice único; y si tras sincronizar no están los índices de §3, también. No escribe nombres en
 * la salida ni en los errores (constitución: ni los datos personales ni los tokens en los logs):
 * solo cuentas e índices.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '../config/connectDB';
import { describeErrorSafely } from '../lib/safeErrorLog';
import { ExecutiveModel, EXECUTIVE_COLLATION, EXECUTIVE_NAME_COLLATION } from '../models/executive';
import { ExecutiveService, SeedExecutivesResult } from '../services/ExecutiveService';
import { parseExecutiveSeed } from '../validators/executive.validator';
import { ValidationError } from '../lib/errors';

export type SeedLogger = (line: string) => void;

/** Error de la siembra con un mensaje escrito aquí, sin datos de la base: se puede mostrar tal cual. */
export class SeedExecutivesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedExecutivesError';
  }
}

interface RequiredIndex {
  name: string;
  key: Record<string, number>;
  unique: boolean;
  collation: { locale: string; strength: number };
}

/**
 * Los índices de §3 que la siembra tiene que dejar: {name} único con la intercalación de la
 * unicidad (sin mayúsculas, tildes ni la ñ) y {active, name} con la intercalación es del orden.
 */
const REQUIRED_INDEXES: RequiredIndex[] = [
  { name: 'name_1', key: { name: 1 }, unique: true, collation: EXECUTIVE_NAME_COLLATION },
  { name: 'active_1_name_1', key: { active: 1, name: 1 }, unique: false, collation: EXECUTIVE_COLLATION },
];

const SAME_NAME = 'el mismo nombre sin distinguir mayúsculas, tildes ni la ñ';

const DUPLICATE_NAMES_HINT =
  `Puede haber ejecutivos con ${SAME_NAME}: deja uno solo en la colección ` +
  'executives y vuelve a ejecutar npm run seed:executives.';

function hasIndex(indexes: Array<Record<string, unknown>>, required: RequiredIndex): boolean {
  return indexes.some((idx) => {
    const collation = idx['collation'] as { locale?: string; strength?: number } | undefined;
    return (
      idx['name'] === required.name &&
      JSON.stringify(idx['key']) === JSON.stringify(required.key) &&
      Boolean(idx['unique']) === required.unique &&
      collation?.locale === required.collation.locale &&
      collation?.strength === required.collation.strength
    );
  });
}

/**
 * Crea la colección y sus índices, y comprueba que quedaron (RN-03, v6).
 * 1. Antes de tocar ningún índice cuenta en la base los nombres repetidos con la equivalencia del
 *    índice único: si hay alguno, sale sin sembrar y sin intentar crear el índice (su fallo
 *    citaría el nombre repetido en el log de la propia base). Solo se dice cuántos, nunca cuáles.
 * 2. Sincroniza los índices: una base de la v4 (name_1 con la intercalación es) cambia de índice.
 * 3. Los lista y comprueba: Mongoose puede crear índices por su cuenta (autoIndex) y, con datos que
 *    los incumplen, esa creación y syncIndexes() pueden fallar sin avisar; no se fía de que no lancen.
 */
async function ensureExecutiveSchema(service: ExecutiveService): Promise<void> {
  await ExecutiveModel.createCollection();
  // Si la conexión trae autoIndex, se espera a que acabe; si falló, lo dice la comprobación del final
  await ExecutiveModel.init().catch(() => undefined);

  const repeated = await service.countDuplicateNames();
  if (repeated > 0) {
    throw new SeedExecutivesError(
      `Hay ejecutivos con ${SAME_NAME}: ${repeated} ${repeated > 1 ? 'nombres se repiten' : 'nombre se repite'} ` +
        'en la colección executives. No se ha sembrado nada ni se ha tocado el esquema. Deja uno solo de ' +
        'cada nombre y vuelve a ejecutar npm run seed:executives.'
    );
  }

  let syncFailedWithDuplicate = false;
  try {
    await ExecutiveModel.syncIndexes();
  } catch (err) {
    // El mensaje del E11000 cita el nombre repetido: no se propaga ni se registra
    syncFailedWithDuplicate = (err as { code?: unknown }).code === 11000;
    if (!syncFailedWithDuplicate) throw err;
  }

  const indexes = (await ExecutiveModel.collection.listIndexes().toArray()) as Array<Record<string, unknown>>;
  const missing = REQUIRED_INDEXES.filter((required) => !hasIndex(indexes, required)).map((r) => r.name);
  if (missing.length > 0) {
    throw new SeedExecutivesError(
      `No se pudo dejar el esquema de executives: falta${missing.length > 1 ? 'n' : ''} el índice ` +
        `${missing.join(', ')} (con su intercalación). No se ha sembrado nada. ${DUPLICATE_NAMES_HINT}`
    );
  }
}

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
  // Esquema: sin repetidos previos, crea la colección executives y sus índices declarados en el modelo, y los comprueba
  await ensureExecutiveSchema(service);

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

/**
 * Conecta con MONGODB_URI; sin ella falla con un mensaje que dice qué falta. Sin autoIndex: los
 * índices los crea la siembra, y solo después de comprobar que no hay nombres repetidos (RN-03).
 */
export async function connectForSeed(): Promise<unknown> {
  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    throw new SeedExecutivesError('MONGODB_URI no está definida: indica la base de datos en la que sembrar.');
  }
  return connectDB(uri, { autoIndex: false });
}

const defaultCliDeps: SeedExecutivesCliDeps = {
  connect: connectForSeed,
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
    } else if (err instanceof SeedExecutivesError) {
      deps.logError(`Error en seed:executives: ${err.message}`);
    } else {
      // Un error no previsto (de la base, p. ej.) se registra sin su mensaje: puede citar un nombre
      deps.logError(`Error en seed:executives: ${JSON.stringify(describeErrorSafely(err))}`);
    }
    return 1;
  }
}

if (require.main === module) {
  seedExecutivesCli(process.argv.slice(2)).then((code) => process.exit(code));
}
