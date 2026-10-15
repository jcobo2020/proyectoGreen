import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ListProductsUseCase, CreateOrderUseCase } from '../../application/order.use-cases';
import { PublicProduct } from '../../domain/models/product.model';
import {
  OrderUnauthorizedError,
  InsufficientStockError,
  ProductNotFoundError,
  InvalidOrderInputError,
  OrderInfrastructureError
} from '../../domain/errors/order.errors';
import { environment } from '../../../../../environments/environment';

type ViewState = 'loading' | 'error' | 'unauthorized' | 'data';

interface StockError {
  productId: string;
  requested: number;
  available: number;
}

/**
 * Componente de la pantalla /orders/new.
 * Permite al cliente elegir cantidades del catálogo y crear un pedido.
 * R4-SEG-3: No toma ninguna decisión de precio, total o disponibilidad.
 * R4-REND-2: El total estimado se calcula en la vista con los precios ya cargados.
 */
@Component({
  selector: 'app-order-new',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-new.component.html',
  styleUrl: './order-new.component.css'
})
export class OrderNewComponent implements OnInit {
  private readonly listProductsUseCase = inject(ListProductsUseCase);
  private readonly createOrderUseCase = inject(CreateOrderUseCase);
  private readonly router = inject(Router);

  readonly viewState = signal<ViewState>('loading');
  readonly products = signal<PublicProduct[]>([]);
  readonly page = signal(1);
  readonly totalItems = signal(0);
  readonly pageSize = signal(50);
  readonly errorMessage = signal<string>('');

  /** Cantidades seleccionadas: productId → quantity */
  readonly quantities = signal<Record<string, number>>({});

  /** Errores de stock por productId */
  readonly stockErrors = signal<Record<string, StockError>>({});

  /** Si hay una petición de creación en vuelo */
  private creando = false;

  readonly totalPages = computed(() =>
    Math.ceil(this.totalItems() / this.pageSize()) || 1
  );

  /**
   * Líneas del resumen: productos con quantity > 0.
   * R4-PRUEBAS-7: las cantidades se conservan al cambiar de página.
   */
  readonly lineasResumen = computed(() => {
    const qtys = this.quantities();
    return this.products()
      .filter(p => (qtys[p.id] ?? 0) > 0)
      .map(p => ({
        product: p,
        quantity: qtys[p.id],
        lineTotal: p.unitPrice * qtys[p.id]
      }));
  });

  /**
   * Total estimado calculado en la vista (R4-REND-2).
   * No se suma precio del servidor en tiempo real: usa los unitPrice ya cargados.
   */
  readonly totalEstimado = computed(() =>
    this.lineasResumen().reduce((sum, l) => sum + l.lineTotal, 0)
  );

  /**
   * AC-06: «Continuar» deshabilitado si alguna cantidad está fuera de 1-99
   * o supera el disponible mostrado.
   */
  readonly continuarDeshabilitado = computed(() => {
    const qtys = this.quantities();
    const productos = this.products();
    const hayAlguna = Object.values(qtys).some(q => q > 0);
    if (!hayAlguna) return true;

    // Verificar que todas las cantidades son válidas
    for (const p of productos) {
      const q = qtys[p.id] ?? 0;
      if (q === 0) continue;
      if (q < 1 || q > 99 || q > p.available) return true;
    }
    return false;
  });

  ngOnInit(): void {
    this.cargar(1);
  }

  cargar(page: number): void {
    this.viewState.set('loading');
    this.listProductsUseCase.execute(page).subscribe({
      next: (result) => {
        this.page.set(result.page);
        this.totalItems.set(result.total);
        this.pageSize.set(result.pageSize);
        this.products.set(result.items);
        this.viewState.set('data');
      },
      error: (err: Error) => {
        if (err instanceof OrderUnauthorizedError) {
          const returnUrl = encodeURIComponent('/orders/new');
          window.location.href = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
          this.viewState.set('unauthorized');
        } else {
          this.errorMessage.set('Error al cargar el catálogo. Por favor, inténtalo de nuevo.');
          this.viewState.set('error');
        }
      }
    });
  }

  setQuantity(productId: string, value: number): void {
    this.quantities.update(q => ({ ...q, [productId]: value }));
    // Limpiar el error de stock al cambiar la cantidad
    this.stockErrors.update(e => {
      const copy = { ...e };
      delete copy[productId];
      return copy;
    });
  }

  getQuantity(productId: string): number {
    return this.quantities()[productId] ?? 0;
  }

  reintentar(): void {
    this.cargar(this.page());
  }

  irAPagina(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      // R4-PRUEBAS-7: las cantidades se conservan al cambiar de página
      const paginaActual = this.page();
      if (page !== paginaActual) {
        this.cargar(page);
      }
    }
  }

  continuar(): void {
    // R4-PRUEBAS-6: si ya hay una petición en vuelo, no se dispara otra
    if (this.creando || this.continuarDeshabilitado()) return;

    const qtys = this.quantities();
    const items = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (items.length === 0) return;

    this.creando = true;
    this.stockErrors.set({});

    this.createOrderUseCase.execute({ items }).subscribe({
      next: (order) => {
        this.creando = false;
        // AC-01: navegar a /orders/:id/confirm con el pedido creado
        this.router.navigate(['/orders', order.id, 'confirm']);
      },
      error: (err: Error) => {
        this.creando = false;

        if (err instanceof InsufficientStockError) {
          // AC-03: marcar cada línea afectada con su disponible
          const errores: Record<string, StockError> = {};
          for (const d of err.details) {
            errores[d.productId] = d;
          }
          this.stockErrors.set(errores);
          // R4-OBS-2: registrar event order_create_failed
          console.error(`[order_create_failed] code=INSUFFICIENT_STOCK path=/api/orders`);
        } else if (err instanceof OrderUnauthorizedError) {
          const returnUrl = encodeURIComponent('/orders/new');
          window.location.href = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
          this.viewState.set('unauthorized');
        } else if (err instanceof ProductNotFoundError || err instanceof InvalidOrderInputError) {
          this.errorMessage.set('Algunos productos no están disponibles. Por favor, recarga el catálogo.');
          this.viewState.set('error');
          // R4-OBS-2
          const code = err instanceof ProductNotFoundError ? 'PRODUCT_NOT_FOUND' : 'VALIDATION_ERROR';
          console.error(`[order_create_failed] code=${code} path=/api/orders`);
        } else {
          this.errorMessage.set('Error al crear el pedido. Por favor, inténtalo de nuevo.');
          this.viewState.set('error');
          // R4-OBS-2
          const code = err instanceof OrderInfrastructureError ? `${err.status}` : 'UNKNOWN';
          console.error(`[order_create_failed] code=${code} path=/api/orders`);
        }
      }
    });
  }
}
