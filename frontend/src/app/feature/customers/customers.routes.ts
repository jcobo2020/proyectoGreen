import { Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authGuard } from '../../@core/guards/auth.guard';
import { jwtInterceptor } from '../../@core/interceptors/jwt.interceptor';
import { customersSessionInterceptor } from './infrastructure/session.interceptor';
import { CUSTOMER_REPOSITORY } from './domain/ports/customer-repository.port';
import { EXECUTIVE_REPOSITORY } from './domain/ports/executive-repository.port';
import { HttpCustomerRepository } from './infrastructure/http-customer.repository';
import { HttpExecutiveRepository } from './infrastructure/http-executive.repository';
import { CreateCustomerUseCase } from './application/customer.use-cases';
import { ListExecutivesUseCase } from './application/executive.use-cases';

/**
 * Rutas de la feature customers, montadas en /nuevo-prospecto desde app.routes.ts:
 * - authGuard protege la pantalla.
 * - HttpClient propio con jwtInterceptor + customersSessionInterceptor (sin el errorInterceptor
 *   global), para que el repositorio distinga el 400, el 401 y el 409.
 */
export const customersRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    providers: [
      provideHttpClient(withInterceptors([jwtInterceptor, customersSessionInterceptor])),
      { provide: CUSTOMER_REPOSITORY, useClass: HttpCustomerRepository },
      { provide: EXECUTIVE_REPOSITORY, useClass: HttpExecutiveRepository },
      CreateCustomerUseCase,
      ListExecutivesUseCase
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./ui/customer-new/customer-new.component').then(m => m.CustomerNewComponent)
      }
    ]
  }
];
