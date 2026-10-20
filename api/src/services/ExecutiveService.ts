import { ExecutiveModel, IExecutive, EXECUTIVE_COLLATION, EXECUTIVE_NAME_COLLATION } from '../models/executive';

/** Opción pública de un ejecutivo: un cliente guarda el value (_id), nunca el label (RN-02). */
export interface PublicExecutive {
  value: string;
  label: string;
}

export interface SeedExecutivesResult {
  created: number;
  unchanged: number;
}

export function toPublicExecutive(doc: IExecutive): PublicExecutive {
  const obj = doc.toObject() as IExecutive & { _id: { toString(): string } };
  return {
    value: obj._id.toString(),
    label: obj.name,
  };
}

/** Normaliza un nombre de ejecutivo: sin espacios en los extremos y con espacios internos simples. */
export function normalizeExecutiveName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Compara como el índice único (EXECUTIVE_NAME_COLLATION: raíz de Unicode, fuerza 1): sin distinguir
 * mayúsculas, tildes ni la ñ. sensitivity 'base' es la fuerza 1 de ICU.
 */
const executiveNameCollator = new Intl.Collator(EXECUTIVE_NAME_COLLATION.locale, { sensitivity: 'base' });

/** Los nombres normalizados, sin repetidos sin distinguir mayúsculas, tildes ni la ñ; se queda la primera forma. */
export function uniqueExecutiveNames(names: string[]): string[] {
  const unique: string[] = [];
  for (const name of names.map(normalizeExecutiveName)) {
    if (!unique.some((kept) => executiveNameCollator.compare(kept, name) === 0)) unique.push(name);
  }
  return unique;
}

export class ExecutiveService {
  /**
   * Ejecutivos activos como opciones, en orden alfabético español; lista corta, sin paginar (RN-01).
   * La intercalación es la del índice {active, name}: la consulta lo usa y no ordena en memoria (R4-REND-1).
   */
  async listActive(): Promise<PublicExecutive[]> {
    const docs = await ExecutiveModel.find({ active: true }, { name: 1 })
      .collation(EXECUTIVE_COLLATION)
      .sort({ name: 1 })
      .exec();
    return docs.map(toPublicExecutive);
  }

  /**
   * Cuántos nombres de la colección se repiten con la equivalencia del índice único (RN-03): los
   * agrupa la base con su intercalación. Solo devuelve la cuenta, nunca los nombres.
   */
  async countDuplicateNames(): Promise<number> {
    const [result] = await ExecutiveModel.aggregate<{ repeated: number }>([
      { $group: { _id: '$name', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'repeated' },
    ]).collation(EXECUTIVE_NAME_COLLATION);
    return result?.repeated ?? 0;
  }

  /**
   * Siembra (RN-03, R4-ARQ-2): crea con active = true los ejecutivos de la lista que falten y
   * nunca toca a los que ya existen (no reactiva a uno dado de baja: su baja la gobernará
   * «Administración»). La unicidad se comprueba aquí, antes de persistir, sin distinguir
   * mayúsculas, tildes ni la ñ: los repetidos de la lista se quitan primero (uniqueExecutiveNames)
   * y cada escritura busca el nombre con la intercalación del índice único, así que «daniela rios»
   * no crea otro si ya está «Daniela Ríos», ni «Nana Torres» si ya está «Ñaña Torres». Si aun así coincidieran dos escrituras, el índice único
   * rechaza la segunda: nunca queda un repetido.
   */
  async seedMissing(names: string[]): Promise<SeedExecutivesResult> {
    const unique = uniqueExecutiveNames(names);
    if (unique.length === 0) {
      return { created: 0, unchanged: 0 };
    }

    const result = await ExecutiveModel.bulkWrite(
      unique.map((name) => ({
        updateOne: {
          filter: { name },
          update: { $setOnInsert: { name, active: true } },
          upsert: true,
          collation: EXECUTIVE_NAME_COLLATION,
        },
      }))
    );

    const created = result.upsertedCount;
    return { created, unchanged: unique.length - created };
  }
}
