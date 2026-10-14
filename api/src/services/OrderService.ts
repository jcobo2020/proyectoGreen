import {
  IProductCatalog,
  IUnitOfWork,
  IOrderRepository,
  OrderData,
} from '../lib/ports';
import { TransactionContext } from '../lib/transaction';
import {
  InvalidOrderIdError,
  OrderForbiddenError,
  OrderNotFoundError,
  ProductNotFoundError,
  InsufficientStockError,
  InternalError,
} from '../lib/errors';
import mongoose from 'mongoose';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PublicOrderItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface PublicOrder {
  id: string;
  code: string;
  status: 'pending_confirmation' | 'confirmed';
  items: PublicOrderItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

export interface CreateOrderInput {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface ListOrdersOptions {
  customerId: string;
  page: number;
  pageSize: number;
}

export interface ListOrdersResult {
  items: PublicOrder[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Proyección pública ───────────────────────────────────────────────────────

export function toPublicOrder(data: OrderData): PublicOrder {
  const result: PublicOrder = {
    id: data.id,
    code: data.code,
    status: data.status,
    items: data.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unitPrice: Math.round(item.unitPrice * 100) / 100,
      quantity: item.quantity,
      lineTotal: Math.round(item.lineTotal * 100) / 100,
    })),
    total: Math.round(data.total * 100) / 100,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
  };
  if (data.status === 'confirmed' && data.confirmedAt) {
    result.confirmedAt = data.confirmedAt.toISOString();
  }
  return result;
}

// ─── Generación del código del pedido ────────────────────────────────────────

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateOrderCode(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const random = Array.from({ length: 6 }, () =>
    CROCKFORD_ALPHABET[Math.floor(Math.random() * CROCKFORD_ALPHABET.length)]
  ).join('');
  return `ORD-${yyyy}${mm}${dd}-${random}`;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export class OrderService {
  constructor(
    private readonly productCatalog: IProductCatalog,
    private readonly unitOfWork: IUnitOfWork,
    private readonly orderRepository: IOrderRepository
  ) {}

  // ── Crear pedido ──────────────────────────────────────────────────────────

  async create(input: CreateOrderInput): Promise<PublicOrder> {
    const { customerId, items } = input;

    // Buscar productos activos
    const productIds = items.map((i) => i.productId);
    const products = await this.productCatalog.findActiveByIds(productIds);

    // Verificar que todos los productos existen y están activos
    const foundIds = new Set(products.map((p) => p.id));
    const missingIds = productIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new ProductNotFoundError(
        'Algún producto no existe o no está activo',
        missingIds.map((id) => ({ productId: id }))
      );
    }

    // Comprobar disponibilidad (bloqueante pero sin reservar)
    const productMap = new Map(products.map((p) => [p.id, p]));
    const insufficientLines: Array<{ productId: string; requested: number; available: number }> = [];
    for (const item of items) {
      const product = productMap.get(item.productId)!;
      if (product.available < item.quantity) {
        insufficientLines.push({
          productId: item.productId,
          requested: item.quantity,
          available: product.available,
        });
      }
    }
    if (insufficientLines.length > 0) {
      throw new InsufficientStockError(
        'Alguna línea supera la disponibilidad',
        insufficientLines
      );
    }

    // Calcular líneas y total con precios del catálogo
    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = Math.round(product.unitPrice * 100) / 100;
      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      return {
        productId: item.productId,
        sku: product.sku,
        name: product.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      };
    });

    const total = Math.round(
      orderItems.reduce((sum, i) => sum + i.lineTotal, 0) * 100
    ) / 100;

    // Intentar insertar con código único: hasta MAX_CODE_ATTEMPTS veces.
    // Al cuarto fallo (todos E11000) → InternalError (500).
    const MAX_CODE_ATTEMPTS = 4;
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateOrderCode();
      try {
        const orderData = await this.orderRepository.create({
          code,
          customerId,
          items: orderItems,
          total,
        });

        // Evento de negocio
        console.log(
          JSON.stringify({
            event: 'order_created',
            orderId: orderData.id,
            customerId,
          })
        );

        return toPublicOrder(orderData);
      } catch (err: unknown) {
        const isE11000 =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: number }).code === 11000;

        if (isE11000 && attempt < MAX_CODE_ATTEMPTS) {
          // Código duplicado: reintentar con nuevo código
          continue;
        }
        if (isE11000) {
          // Agotados los reintentos
          throw new InternalError();
        }
        // Cualquier otro error (incluido InternalError del repositorio)
        throw err;
      }
    }

    // Agotados los intentos sin éxito
    throw new InternalError();
  }

  // ── Listar pedidos ────────────────────────────────────────────────────────

  async list(options: ListOrdersOptions): Promise<ListOrdersResult> {
    const { customerId, page, pageSize } = options;

    const { items, total } = await this.orderRepository.listByCustomer(
      customerId,
      page,
      pageSize
    );

    return {
      items: items.map(toPublicOrder),
      total,
      page,
      pageSize,
    };
  }

  // ── Obtener detalle ───────────────────────────────────────────────────────

  async getById(orderId: string, customerId: string): Promise<PublicOrder> {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new InvalidOrderIdError();
    }

    const data = await this.orderRepository.findById(orderId);
    if (!data) {
      throw new OrderNotFoundError();
    }
    if (data.customerId !== customerId) {
      throw new OrderForbiddenError();
    }

    return toPublicOrder(data);
  }

  // ── Confirmar pedido ──────────────────────────────────────────────────────

  async confirm(orderId: string, customerId: string): Promise<PublicOrder> {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new InvalidOrderIdError();
    }

    // Verificar existencia y dueño ANTES de la transacción
    const preCheck = await this.orderRepository.findById(orderId);
    if (!preCheck) {
      throw new OrderNotFoundError();
    }
    if (preCheck.customerId !== customerId) {
      throw new OrderForbiddenError();
    }

    return this.unitOfWork.run(async (tx: TransactionContext) => {
      // 0) Intentar marcar el pedido como confirmed (solo si está pending_confirmation)
      const previousData = await this.orderRepository.confirmInTx(orderId, customerId, tx);

      if (!previousData) {
        // El pedido no estaba pending_confirmation dentro de la transacción.
        // Leer el estado actual para decidir si es idempotente o un error.
        const current = await this.orderRepository.findByIdInTx(orderId, tx);

        if (!current) {
          throw new OrderNotFoundError();
        }
        if (current.customerId !== customerId) {
          throw new OrderForbiddenError();
        }
        if (current.status === 'confirmed') {
          // Idempotente: ya confirmado → devolver sin descontar
          console.log(
            JSON.stringify({
              event: 'order_confirmed',
              orderId: current.id,
              customerId,
              idempotent: true,
            })
          );
          return toPublicOrder(current);
        }
        // Estado inesperado
        throw new InternalError();
      }

      // El pedido estaba pending_confirmation: ahora descontar el stock
      const lines = previousData.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));

      const stockResult = await this.productCatalog.reserveStock(lines, tx);

      if (!stockResult.ok) {
        // Stock insuficiente: abortar la transacción con el error
        console.log(
          JSON.stringify({
            event: 'stock_insufficient',
            orderId,
            customerId,
            insufficient: stockResult.insufficient,
          })
        );
        throw new InsufficientStockError(
          'Ya no hay disponibilidad para alguna línea',
          stockResult.insufficient
        );
      }

      // Leer el documento actualizado para devolver el estado final
      const confirmed = await this.orderRepository.findByIdInTx(orderId, tx);
      if (!confirmed) {
        throw new InternalError();
      }

      // Evento de negocio
      console.log(
        JSON.stringify({
          event: 'order_confirmed',
          orderId: confirmed.id,
          customerId,
        })
      );

      return toPublicOrder(confirmed);
    });
  }
}
