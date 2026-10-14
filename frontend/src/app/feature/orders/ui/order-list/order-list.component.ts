import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListOrdersUseCase } from '../../application/order.use-cases';
import { PublicOrder, OrdersPage } from '../../domain/models/order.model';
import {
  InvalidOrderInputError,
  OrderUnauthorizedError,
  OrderInfrastructureError
} from '../../domain/errors/order.errors';
import { environment } from '../../../../../environments/environment';

type ViewState = 'loading' | 'empty' | 'error' | 'unauthorized' | 'data';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css'
})
export class OrderListComponent implements OnInit {
  private readonly listOrders = inject(ListOrdersUseCase);

  readonly viewState = signal<ViewState>('loading');
  readonly orders = signal<PublicOrder[]>([]);
  readonly page = signal(1);
  readonly totalItems = signal(0);
  readonly pageSize = signal(20);
  readonly errorMessage = signal<string>('');

  readonly totalPages = computed(() =>
    Math.ceil(this.totalItems() / this.pageSize()) || 1
  );

  ngOnInit(): void {
    this.cargar(1);
  }

  cargar(page: number): void {
    this.viewState.set('loading');
    this.listOrders.execute(page).subscribe({
      next: (result: OrdersPage) => {
        this.page.set(result.page);
        this.totalItems.set(result.total);
        this.pageSize.set(result.pageSize);
        if (result.items.length === 0) {
          this.viewState.set('empty');
        } else {
          this.orders.set(result.items);
          this.viewState.set('data');
        }
      },
      error: (err: Error) => {
        if (err instanceof OrderUnauthorizedError) {
          const returnUrl = encodeURIComponent('/orders');
          window.location.href = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
          this.viewState.set('unauthorized');
        } else if (err instanceof InvalidOrderInputError) {
          // 400: volver a la página 1
          if (page !== 1) {
            this.cargar(1);
          } else {
            this.errorMessage.set('Parámetros no válidos. Volviendo a la página inicial.');
            this.viewState.set('error');
          }
        } else {
          this.errorMessage.set('Error al cargar los pedidos. Por favor, inténtalo de nuevo.');
          this.viewState.set('error');
        }
      }
    });
  }

  reintentar(): void {
    this.cargar(this.page());
  }

  irAPagina(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.cargar(page);
    }
  }
}
