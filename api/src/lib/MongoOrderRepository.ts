import mongoose from 'mongoose';
import { OrderModel } from '../models/order';
import {
  IOrderRepository,
  CreateOrderData,
  OrderData,
} from './ports';
import { TransactionContext, unwrapSession } from './transaction';
import { InternalError } from './errors';

/**
 * Convierte un documento IOrder de Mongoose a OrderData (tipo del dominio).
 */
function toOrderData(doc: InstanceType<typeof OrderModel>): OrderData {
  const obj = doc.toObject() as {
    _id: { toString(): string };
    code: string;
    customerId: string;
    status: 'pending_confirmation' | 'confirmed';
    items: Array<{
      productId: { toString(): string };
      sku: string;
      name: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
    }>;
    total: number;
    confirmedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  };

  return {
    id: obj._id.toString(),
    code: obj.code,
    customerId: obj.customerId,
    status: obj.status,
    items: obj.items.map((item) => ({
      productId: item.productId.toString(),
      sku: item.sku,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    total: obj.total,
    confirmedAt: obj.confirmedAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

/**
 * MongoOrderRepository — implementación de IOrderRepository sobre MongoDB/Mongoose.
 * Es la única capa que importa OrderModel y aplica sesiones de transacción.
 */
export class MongoOrderRepository implements IOrderRepository {
  async create(data: CreateOrderData): Promise<OrderData> {
    try {
      const doc = await OrderModel.create({
        code: data.code,
        customerId: data.customerId,
        status: 'pending_confirmation',
        items: data.items.map((item) => ({
          productId: new mongoose.Types.ObjectId(item.productId),
          sku: item.sku,
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
        total: data.total,
      });
      return toOrderData(doc);
    } catch (err: unknown) {
      const isE11000 =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000;
      if (isE11000) {
        // Relanzar con la señal E11000 para que OrderService pueda reintentar el código
        throw err;
      }
      throw new InternalError();
    }
  }

  async listByCustomer(
    customerId: string,
    page: number,
    pageSize: number
  ): Promise<{ items: OrderData[]; total: number }> {
    const filter = { customerId };
    const total = await OrderModel.countDocuments(filter);
    const docs = await OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .exec();

    return {
      items: docs.map(toOrderData),
      total,
    };
  }

  async findById(id: string): Promise<OrderData | null> {
    const doc = await OrderModel.findById(id).exec();
    if (!doc) return null;
    return toOrderData(doc);
  }

  async findByIdInTx(id: string, tx: TransactionContext): Promise<OrderData | null> {
    const session = unwrapSession(tx);
    const doc = await OrderModel.findById(id).session(session).exec();
    if (!doc) return null;
    return toOrderData(doc);
  }

  async confirmInTx(
    id: string,
    customerId: string,
    tx: TransactionContext
  ): Promise<OrderData | null> {
    const session = unwrapSession(tx);
    const doc = await OrderModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        customerId,
        status: 'pending_confirmation',
      },
      { status: 'confirmed', confirmedAt: new Date() },
      { new: false, session }
    ).exec();

    if (!doc) return null;
    return toOrderData(doc);
  }
}
