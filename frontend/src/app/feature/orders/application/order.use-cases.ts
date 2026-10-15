import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { OrdersPage, PublicOrder, CreateOrderPayload } from '../domain/models/order.model';
import { ORDER_REPOSITORY } from '../domain/ports/order-repository.port';
import { ProductsPage } from '../domain/models/product.model';
import { PRODUCT_REPOSITORY } from '../domain/ports/product-repository.port';

/**
 * Caso de uso: listar pedidos del cliente autenticado.
 * pageSize fijo a 20 por R4-REND-1.
 */
@Injectable()
export class ListOrdersUseCase {
  private readonly repo = inject(ORDER_REPOSITORY);

  execute(page = 1): Observable<OrdersPage> {
    return this.repo.listOrders(page, 20);
  }
}

/**
 * Caso de uso: listar productos del catálogo.
 * pageSize fijo a 50 por R4-REND-1.
 */
@Injectable()
export class ListProductsUseCase {
  private readonly repo = inject(PRODUCT_REPOSITORY);

  execute(page = 1): Observable<ProductsPage> {
    return this.repo.listProducts(page, 50);
  }
}

/**
 * Caso de uso: crear un pedido pendiente de confirmación.
 * Envía solo productId y quantity; los precios los gestiona el servidor (R4-SEG-3).
 */
@Injectable()
export class CreateOrderUseCase {
  private readonly repo = inject(ORDER_REPOSITORY);

  execute(payload: CreateOrderPayload): Observable<PublicOrder> {
    return this.repo.createOrder(payload);
  }
}

/**
 * Caso de uso: obtener el detalle de un pedido por id.
 * Usado por /orders/:id/confirm para cargar el pedido antes de confirmarlo (§2).
 */
@Injectable()
export class GetOrderUseCase {
  private readonly repo = inject(ORDER_REPOSITORY);

  execute(id: string): Observable<PublicOrder> {
    return this.repo.getOrder(id);
  }
}

/**
 * Caso de uso: confirmar un pedido pendiente.
 * Envía POST /api/orders/:id/confirm; el backend descuenta el stock (§2).
 */
@Injectable()
export class ConfirmOrderUseCase {
  private readonly repo = inject(ORDER_REPOSITORY);

  execute(id: string): Observable<PublicOrder> {
    return this.repo.confirmOrder(id);
  }
}
