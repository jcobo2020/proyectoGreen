import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { OrdersPage } from '../domain/models/order.model';
import { ORDER_REPOSITORY } from '../domain/ports/order-repository.port';

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
