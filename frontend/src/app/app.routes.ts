import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'orders',
    loadChildren: () =>
      import('./feature/orders/orders.routes').then(m => m.ordersRoutes)
  },
  {
    path: 'nuevo-prospecto',
    loadChildren: () =>
      import('./feature/customers/customers.routes').then(m => m.customersRoutes)
  },
  {
    path: '',
    redirectTo: 'orders',
    pathMatch: 'full'
  }
];
