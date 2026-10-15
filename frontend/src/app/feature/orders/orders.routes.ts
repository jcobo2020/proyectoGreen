import { Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authGuard } from '../../@core/guards/auth.guard';
import { jwtInterceptor } from '../../@core/interceptors/jwt.interceptor';
import { ordersSessionInterceptor } from './infrastructure/session.interceptor';
import { ORDER_REPOSITORY } from './domain/ports/order-repository.port';
import { HttpOrderRepository } from './infrastructure/http-order.repository';
import { ListOrdersUseCase } from './application/order.use-cases';

/**
 * Rutas de la feature orders (R4-ARQ-2, R4-ARQ-6):
 * - authGuard protege todas las rutas hijas.
 * - HttpClient propio con jwtInterceptor + ordersSessionInterceptor (sin errorInterceptor global).
 * - Las rutas 'new' y ':id/confirm' pertenecen a WI-ORD-UX-002 y WI-ORD-UX-003
 *   y se añadirán en esos work items con sus componentes correspondientes.
 * - Este work item solo define la ruta '' (listado /orders).
 */
export const ordersRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    providers: [
      provideHttpClient(withInterceptors([jwtInterceptor, ordersSessionInterceptor])),
      { provide: ORDER_REPOSITORY, useClass: HttpOrderRepository },
      ListOrdersUseCase
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./ui/order-list/order-list.component').then(m => m.OrderListComponent)
      }
    ]
  }
];
