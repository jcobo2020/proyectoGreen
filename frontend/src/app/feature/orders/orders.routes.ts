import { Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authGuard } from '../../@core/guards/auth.guard';
import { jwtInterceptor } from '../../@core/interceptors/jwt.interceptor';
import { ordersSessionInterceptor } from './infrastructure/session.interceptor';
import { ORDER_REPOSITORY } from './domain/ports/order-repository.port';
import { PRODUCT_REPOSITORY } from './domain/ports/product-repository.port';
import { HttpOrderRepository } from './infrastructure/http-order.repository';
import { HttpProductRepository } from './infrastructure/http-product.repository';
import { ListOrdersUseCase, ListProductsUseCase, CreateOrderUseCase } from './application/order.use-cases';

/**
 * Rutas de la feature orders (R4-ARQ-2, R4-ARQ-6):
 * - authGuard protege todas las rutas hijas.
 * - HttpClient propio con jwtInterceptor + ordersSessionInterceptor (sin errorInterceptor global).
 * - Rutas literales ('new') antes que paramétricas (':id/confirm') — R4-ARQ-2.
 */
export const ordersRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    providers: [
      provideHttpClient(withInterceptors([jwtInterceptor, ordersSessionInterceptor])),
      { provide: ORDER_REPOSITORY, useClass: HttpOrderRepository },
      { provide: PRODUCT_REPOSITORY, useClass: HttpProductRepository },
      ListOrdersUseCase,
      ListProductsUseCase,
      CreateOrderUseCase
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./ui/order-list/order-list.component').then(m => m.OrderListComponent)
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./ui/order-new/order-new.component').then(m => m.OrderNewComponent)
      }
    ]
  }
];
