import mongoose from 'mongoose';
import { ProductModel, IProduct } from '../models/product';
import { IProductCatalog, PublicProduct } from '../lib/ports';
import { TransactionContext, unwrapSession } from '../lib/transaction';

export { PublicProduct };

export interface ListProductsOptions {
  page: number;
  pageSize: number;
}

export interface ListProductsResult {
  items: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
}

export function toPublicProduct(doc: IProduct): PublicProduct {
  const obj = doc.toObject() as IProduct & { _id: { toString(): string } };
  return {
    id: obj._id.toString(),
    sku: obj.sku,
    name: obj.name,
    unitPrice: Math.round(obj.unitPrice * 100) / 100,
    available: obj.available,
  };
}

export class ProductService implements IProductCatalog {
  async listActive(options: ListProductsOptions): Promise<ListProductsResult> {
    const { page, pageSize } = options;

    const filter = { active: true };
    const total = await ProductModel.countDocuments(filter);

    const docs = await ProductModel.find(filter)
      .sort({ name: 1, sku: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .exec();

    return {
      items: docs.map(toPublicProduct),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Busca productos activos por sus IDs.
   * Devuelve solo los que existen y están activos.
   */
  async findActiveByIds(ids: string[]): Promise<PublicProduct[]> {
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await ProductModel.find({
      _id: { $in: objectIds },
      active: true,
    }).exec();
    return docs.map(toPublicProduct);
  }

  /**
   * Descuenta stock de forma atómica por línea (dentro de una transacción).
   * Para cada línea hace un updateOne condicional ($inc negativo con available >= quantity).
   * Si alguna línea falla (no hay suficiente stock), devuelve {ok: false, insufficient: [...]}.
   * Lee el estado actualizado de cada producto dentro de la misma sesión.
   */
  async reserveStock(
    lines: Array<{ productId: string; quantity: number }>,
    tx: TransactionContext
  ): Promise<{ ok: true } | { ok: false; insufficient: Array<{ productId: string; requested: number; available: number }> }> {
    const session = unwrapSession(tx);

    // Leer todos los productos en una sola consulta dentro de la sesión
    const objectIds = lines.map((l) => new mongoose.Types.ObjectId(l.productId));
    const docs = await ProductModel.find({ _id: { $in: objectIds }, active: true })
      .session(session)
      .exec();

    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

    // Validar TODAS las líneas antes de escribir
    const insufficient: Array<{ productId: string; requested: number; available: number }> = [];
    for (const line of lines) {
      const doc = docMap.get(line.productId);
      if (!doc || doc.available < line.quantity) {
        insufficient.push({
          productId: line.productId,
          requested: line.quantity,
          available: doc?.available ?? 0,
        });
      }
    }

    if (insufficient.length > 0) {
      return { ok: false, insufficient };
    }

    // Descontar línea por línea con updateOne condicional
    for (const line of lines) {
      const result = await ProductModel.updateOne(
        {
          _id: new mongoose.Types.ObjectId(line.productId),
          active: true,
          available: { $gte: line.quantity },
        },
        { $inc: { available: -line.quantity } }
      )
        .session(session)
        .exec();

      if (result.modifiedCount === 0) {
        // El stock se agotó entre la lectura y el updateOne (carrera)
        // Leer el estado actual para el detalle del error
        const current = await ProductModel.findById(line.productId).session(session).exec();
        return {
          ok: false,
          insufficient: [
            {
              productId: line.productId,
              requested: line.quantity,
              available: current?.available ?? 0,
            },
          ],
        };
      }
    }

    return { ok: true };
  }
}
