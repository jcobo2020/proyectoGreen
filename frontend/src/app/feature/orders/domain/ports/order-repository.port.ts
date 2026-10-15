import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { OrdersPage, PublicOrder, CreateOrderPayload } from '../models/order.model';

/**
 * Puerto del repositorio de pedidos.
 * La implementación HTTP está en infrastructure/http-order.repository.ts.
 */
export interface OrderRepositoryPort {
  listOrders(page: number, pageSize: number): Observable<OrdersPage>;
  createOrder(payload: CreateOrderPayload): Observable<PublicOrder>;
  /** GET /api/orders/:id — carga el pedido para la pantalla /orders/:id/confirm */
  getOrder(id: string): Observable<PublicOrder>;
  /** POST /api/orders/:id/confirm — confirma el pedido pendiente */
  confirmOrder(id: string): Observable<PublicOrder>;
}

export const ORDER_REPOSITORY = new InjectionToken<OrderRepositoryPort>(
  'ORDER_REPOSITORY'
);
