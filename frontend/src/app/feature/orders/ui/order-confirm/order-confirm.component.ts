import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GetOrderUseCase, ConfirmOrderUseCase } from '../../application/order.use-cases';
import { PublicOrder } from '../../domain/models/order.model';
import {
  OrderNotFoundError,
  OrderForbiddenError,
  OrderUnauthorizedError,
  InsufficientStockError,
  InvalidOrderInputError,
  OrderInfrastructureError
} from '../../domain/errors/order.errors';
import { environment } from '../../../../../environments/environment';

type ViewState = 'loading' | 'data' | 'error' | 'forbidden' | 'not-found';

/**
 * Pantalla /orders/:id/confirm — AC-02, AC-04 (§2).
 *
 * Estados:
 *  - loading: mientras se carga el pedido.
 *  - data:    pedido cargado (pending_confirmation o confirmed).
 *  - error:   error genérico (red, 500).
 *  - forbidden: el pedido es de otro cliente (403).
 *  - not-found: el pedido no existe (404).
 *
 * El botón «Confirmar pedido» solo se muestra cuando el pedido está en
 * pending_confirmation; una vez confirmado desaparece (AC-02).
 * R4-PRUEBAS-6: un segundo clic mientras la petición está en vuelo no dispara otra.
 * R4-SEG-3: no se toma ninguna decisión de precio, total o disponibilidad en el cliente.
 * R4-OBS-2: se registra order_confirm_failed con el código de error y la ruta.
 */
@Component({
  selector: 'app-order-confirm',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  templateUrl: './order-confirm.component.html',
  styleUrl: './order-confirm.component.css'
})
export class OrderConfirmComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly getOrderUseCase = inject(GetOrderUseCase);
  private readonly confirmOrderUseCase = inject(ConfirmOrderUseCase);

  readonly viewState = signal<ViewState>('loading');
  readonly order = signal<PublicOrder | null>(null);
  readonly confirmando = signal(false);
  readonly errorMessage = signal<string>('');
  readonly stockError = signal<string>('');

  private orderId = '';

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id') ?? '';
    this.cargar();
  }

  cargar(): void {
    this.viewState.set('loading');
    this.getOrderUseCase.execute(this.orderId).subscribe({
      next: (pedido) => {
        this.order.set(pedido);
        this.viewState.set('data');
      },
      error: (err: Error) => this.manejarErrorCarga(err)
    });
  }

  reintentar(): void {
    this.cargar();
  }

  confirmar(): void {
    // R4-PRUEBAS-6: si ya hay una petición en vuelo, no se dispara otra.
    if (this.confirmando()) return;

    this.confirmando.set(true);
    this.stockError.set('');

    this.confirmOrderUseCase.execute(this.orderId).subscribe({
      next: (pedidoConfirmado) => {
        // AC-02: mostrar pedido confirmado con código; el botón desaparece.
        this.order.set(pedidoConfirmado);
        this.confirmando.set(false);
      },
      error: (err: Error) => {
        this.confirmando.set(false);
        this.manejarErrorConfirmacion(err);
      }
    });
  }

  private manejarErrorCarga(err: Error): void {
    if (err instanceof OrderForbiddenError) {
      // AC-04: pedido de otro cliente → estado forbidden
      this.viewState.set('forbidden');
    } else if (err instanceof OrderNotFoundError) {
      // AC-04: pedido inexistente → estado not-found
      this.viewState.set('not-found');
    } else if (err instanceof OrderUnauthorizedError) {
      const returnUrl = encodeURIComponent(`/orders/${this.orderId}/confirm`);
      window.location.href = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
      this.viewState.set('error');
    } else {
      const msg = err instanceof InvalidOrderInputError
        ? 'El identificador del pedido no es válido.'
        : 'Error al cargar el pedido. Por favor, inténtalo de nuevo.';
      this.errorMessage.set(msg);
      this.viewState.set('error');
    }
  }

  private manejarErrorConfirmacion(err: Error): void {
    if (err instanceof InsufficientStockError) {
      // R4-OBS-2
      console.error(`[order_confirm_failed] code=INSUFFICIENT_STOCK path=/api/orders/${this.orderId}/confirm`);
      this.stockError.set('No hay disponibilidad suficiente para confirmar el pedido.');
    } else if (err instanceof OrderForbiddenError) {
      // R4-OBS-2
      console.error(`[order_confirm_failed] code=ORDER_FORBIDDEN path=/api/orders/${this.orderId}/confirm`);
      this.viewState.set('forbidden');
    } else if (err instanceof OrderNotFoundError) {
      // R4-OBS-2
      console.error(`[order_confirm_failed] code=ORDER_NOT_FOUND path=/api/orders/${this.orderId}/confirm`);
      this.viewState.set('not-found');
    } else if (err instanceof OrderUnauthorizedError) {
      const returnUrl = encodeURIComponent(`/orders/${this.orderId}/confirm`);
      window.location.href = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
    } else {
      const code = err instanceof OrderInfrastructureError ? `${err.status}` : 'UNKNOWN';
      // R4-OBS-2
      console.error(`[order_confirm_failed] code=${code} path=/api/orders/${this.orderId}/confirm`);
      this.errorMessage.set('Error al confirmar el pedido. Por favor, inténtalo de nuevo.');
      this.viewState.set('error');
    }
  }
}
