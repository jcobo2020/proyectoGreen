import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ProductsPage } from '../models/product.model';

/**
 * Puerto del repositorio de productos.
 * La implementación HTTP está en infrastructure/http-product.repository.ts.
 */
export interface ProductRepositoryPort {
  listProducts(page: number, pageSize: number): Observable<ProductsPage>;
}

export const PRODUCT_REPOSITORY = new InjectionToken<ProductRepositoryPort>(
  'PRODUCT_REPOSITORY'
);
