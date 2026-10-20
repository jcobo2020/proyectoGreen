import { ExecutiveModel, IExecutive, EXECUTIVE_COLLATION } from '../models/executive';

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
   * Siembra (RN-03, R4-ARQ-2): crea con active = true los ejecutivos de la lista que falten y
   * nunca toca a los que ya existen (no reactiva a uno dado de baja: su baja la gobernará
   * «Administración»). La unicidad se comprueba aquí, antes de persistir, sin distinguir
   * mayúsculas (la intercalación del índice único): «daniela ríos» no crea otro si ya está
   * «Daniela Ríos». Las escrituras van en orden, así que un repetido dentro de la misma lista
   * tampoco crea otro.
   */
  async seedMissing(names: string[]): Promise<SeedExecutivesResult> {
    const unique = Array.from(new Set(names.map(normalizeExecutiveName)));
    if (unique.length === 0) {
      return { created: 0, unchanged: 0 };
    }

    const result = await ExecutiveModel.bulkWrite(
      unique.map((name) => ({
        updateOne: {
          filter: { name },
          update: { $setOnInsert: { name, active: true } },
          upsert: true,
          collation: EXECUTIVE_COLLATION,
        },
      })),
      { ordered: true }
    );

    const created = result.upsertedCount;
    return { created, unchanged: unique.length - created };
  }
}
