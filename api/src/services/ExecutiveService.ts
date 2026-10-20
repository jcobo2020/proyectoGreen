import { ExecutiveModel, IExecutive } from '../models/executive';

/** Opción pública de un ejecutivo: un cliente guarda el value (_id), nunca el label (RN-02). */
export interface PublicExecutive {
  value: string;
  label: string;
}

export interface SeedExecutivesResult {
  created: number;
  updated: number;
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
  /** Ejecutivos activos como opciones, ordenados por nombre; lista corta, sin paginar (RN-01). */
  async listActive(): Promise<PublicExecutive[]> {
    const docs = await ExecutiveModel.find({ active: true }, { name: 1 }).sort({ name: 1 }).exec();
    return docs.map(toPublicExecutive);
  }

  /**
   * Siembra idempotente (R4-ARQ-2): upsert por name con active = true.
   * Los ejecutivos que no están en la lista no se tocan.
   */
  async seedActive(names: string[]): Promise<SeedExecutivesResult> {
    const unique = Array.from(new Set(names.map(normalizeExecutiveName)));
    if (unique.length === 0) {
      return { created: 0, updated: 0, unchanged: 0 };
    }

    const result = await ExecutiveModel.bulkWrite(
      unique.map((name) => ({
        updateOne: {
          filter: { name },
          update: { $set: { active: true }, $setOnInsert: { name } },
          upsert: true,
        },
      }))
    );

    const created = result.upsertedCount;
    const updated = result.modifiedCount;
    return { created, updated, unchanged: unique.length - created - updated };
  }
}
