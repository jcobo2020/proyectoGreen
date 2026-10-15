import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'orders',
    loadChildren: () =>
      import('./feature/orders/orders.routes').then(m => m.ordersRoutes)
  },
  {
    path: '',
    redirectTo: 'orders',
    pathMatch: 'full'
  }
];
