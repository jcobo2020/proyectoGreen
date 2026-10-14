import { TransactionContext } from './transaction';

/**
 * Resultado público de un producto, para uso interno entre servicios.
 */
export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  available: number;
}

/**
 * Datos necesarios para crear un pedido en el repositorio.
 */
export interface CreateOrderData {
  code: string;
  customerId: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  total: number;
}

/**
 * Datos de un pedido leídos del repositorio (en el dominio).
 */
export interface OrderData {
  id: string;
  code: string;
  customerId: string;
  status: 'pending_confirmation' | 'confirmed';
  items: Array<{
    productId: string;
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
}

/**
 * Puerto IOrderRepository: lo implementa MongoOrderRepository en infraestructura.
 * OrderService solo depende de este puerto, nunca de OrderModel ni de Mongoose.
 */
export interface IOrderRepository {
  /** Persiste un nuevo pedido y devuelve sus datos. Lanza InternalError si falla. */
  create(data: CreateOrderData): Promise<OrderData>;
  /** Lista los pedidos de un cliente con paginación, ordenados por createdAt desc. */
  listByCustomer(
    customerId: string,
    page: number,
    pageSize: number
  ): Promise<{ items: OrderData[]; total: number }>;
  /** Busca un pedido por id. Devuelve null si no existe. */
  findById(id: string): Promise<OrderData | null>;
  /** Busca un pedido por id dentro de una transacción. Devuelve null si no existe. */
  findByIdInTx(id: string, tx: TransactionContext): Promise<OrderData | null>;
  /**
   * Intenta marcar el pedido como confirmed (solo si está pending_confirmation).
   * Devuelve el documento ANTERIOR (antes del update) o null si no aplicó
   * (el pedido ya no está pending_confirmation).
   */
  confirmInTx(
    id: string,
    customerId: string,
    tx: TransactionContext
  ): Promise<OrderData | null>;
}

/**
 * Puerto IProductCatalog: lo implementa ProductService.
 * OrderService solo depende de este puerto, nunca de ProductModel.
 */
export interface IProductCatalog {
  findActiveByIds(ids: string[]): Promise<PublicProduct[]>;
  reserveStock(
    lines: Array<{ productId: string; quantity: number }>,
    tx: TransactionContext
  ): Promise<{ ok: true } | { ok: false; insufficient: Array<{ productId: string; requested: number; available: number }> }>;
}

/**
 * Puerto IUnitOfWork: lo implementa MongoUnitOfWork en infraestructura.
 */
export interface IUnitOfWork {
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
