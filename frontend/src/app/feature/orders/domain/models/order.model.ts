/**
 * Modelo de dominio para un pedido público.
 * Solo contiene los campos que devuelve GET /api/orders (§2).
 */
export type OrderStatus = 'pending_confirmation' | 'confirmed' | 'cancelled';

export interface PublicOrder {
  code: string;
  createdAt: string;
  total: number;
  status: OrderStatus;
}

export interface OrdersPage {
  items: PublicOrder[];
  total: number;
  page: number;
  pageSize: number;
}
