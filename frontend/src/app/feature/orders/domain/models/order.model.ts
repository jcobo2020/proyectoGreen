/**
 * Modelo de dominio para un pedido público.
 * Contiene los campos que devuelven GET /api/orders y POST /api/orders (§2).
 */
export type OrderStatus = 'pending_confirmation' | 'confirmed' | 'cancelled';

export interface OrderLine {
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
  status: OrderStatus;
  items: OrderLine[];
  total: number;
  createdAt: string;
  updatedAt: string;
  /** Presente cuando status === 'confirmed' (POST /api/orders/:id/confirm, §2) */
  confirmedAt?: string;
}

export interface OrdersPage {
  items: PublicOrder[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Payload para crear un pedido (POST /api/orders).
 */
export interface CreateOrderPayload {
  items: Array<{ productId: string; quantity: number }>;
}

