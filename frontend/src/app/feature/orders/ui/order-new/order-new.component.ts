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

type ViewState = 'loading' | 'error' | 'unauthorized' | 'empty' | 'data';

interface StockError {
  productId: string;
  requested: number;
  available: number;
}

/** Snapshot de un producto seleccionado: lo que necesitamos para el resumen aunque cambie de página. */
interface CartEntry {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  available: number;
  quantity: number;
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

  /**
   * Mapa del carrito: productId → CartEntry.
   * Guarda nombre, sku, precio y disponible de cada producto elegido,
   * de modo que el resumen y «Continuar» no dependen de la página actual del catálogo.
   * R4-PRUEBAS-7: las cantidades se conservan al cambiar de página.
   */
  private readonly cartMap = signal<Record<string, CartEntry>>({});

  /** Errores de stock por productId */
  readonly stockErrors = signal<Record<string, StockError>>({});

  /** Si hay una petición de creación en vuelo */
  private creando = false;

  readonly totalPages = computed(() =>
    Math.ceil(this.totalItems() / this.pageSize()) || 1
  );

  /**
   * Líneas del resumen: entradas del carrito con quantity > 0.
   * R4-PRUEBAS-7: se construye desde cartMap, independiente de la página visible.
   */
  readonly lineasResumen = computed(() =>
    Object.values(this.cartMap())
      .filter(e => e.quantity > 0)
      .map(e => ({
        product: { id: e.productId, sku: e.sku, name: e.name, unitPrice: e.unitPrice, available: e.available },
        quantity: e.quantity,
        lineTotal: e.unitPrice * e.quantity
      }))
  );

  /**
   * Total estimado calculado en la vista (R4-REND-2).
   * No se suma precio del servidor en tiempo real: usa los unitPrice ya cargados.
   */
  readonly totalEstimado = computed(() =>
    this.lineasResumen().reduce((sum, l) => sum + l.lineTotal, 0)
  );

  /**
   * AC-06: «Continuar» deshabilitado si no hay líneas válidas o alguna está fuera de 1-99
   * o supera el disponible mostrado.
   */
  readonly continuarDeshabilitado = computed(() => {
    const entries = Object.values(this.cartMap()).filter(e => e.quantity > 0);
    if (entries.length === 0) return true;

    for (const e of entries) {
      if (e.quantity < 1 || e.quantity > 99 || e.quantity > e.available) return true;
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
        if (result.items.length === 0 && page === 1) {
          this.viewState.set('empty');
        } else {
          this.viewState.set('data');
        }
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
    // Buscar el producto en la página actual para guardar su snapshot en el carrito
    const producto = this.products().find(p => p.id === productId);
    this.cartMap.update(cart => {
      const copy = { ...cart };
      if (value > 0 && producto) {
        copy[productId] = {
          productId,
          sku: producto.sku,
          name: producto.name,
          unitPrice: producto.unitPrice,
          available: producto.available,
          quantity: value
        };
      } else if (value <= 0) {
        delete copy[productId];
      } else if (copy[productId]) {
        // Si no está en la página actual pero ya estaba en el carrito, actualizar solo la cantidad
        copy[productId] = { ...copy[productId], quantity: value };
      }
      return copy;
    });
    // Limpiar el error de stock al cambiar la cantidad
    this.stockErrors.update(e => {
      const copy = { ...e };
      delete copy[productId];
      return copy;
    });
  }

  getQuantity(productId: string): number {
    return this.cartMap()[productId]?.quantity ?? 0;
  }

  reintentar(): void {
    this.cargar(this.page());
  }

  irAPagina(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      const paginaActual = this.page();
      if (page !== paginaActual) {
        this.cargar(page);
      }
    }
  }

  continuar(): void {
    // R4-PRUEBAS-6: si ya hay una petición en vuelo, no se dispara otra
    if (this.creando || this.continuarDeshabilitado()) return;

    const items = Object.values(this.cartMap())
      .filter(e => e.quantity > 0)
      .map(e => ({ productId: e.productId, quantity: e.quantity }));

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
        } else if (err instanceof InvalidOrderInputError) {
          this.errorMessage.set('Los datos del pedido no son válidos.');
          this.viewState.set('error');
          // R4-OBS-2
          console.error(`[order_create_failed] code=VALIDATION_ERROR path=/api/orders`);
        } else if (err instanceof ProductNotFoundError) {
          this.errorMessage.set('Algunos productos no están disponibles. Por favor, recarga el catálogo.');
          this.viewState.set('error');
          // R4-OBS-2
          console.error(`[order_create_failed] code=PRODUCT_NOT_FOUND path=/api/orders`);
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
