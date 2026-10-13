import { ProductModel, IProduct } from '../models/product';

export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  available: number;
}

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

export class ProductService {
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
}
