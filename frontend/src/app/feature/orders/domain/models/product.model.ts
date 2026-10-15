/**
 * Modelo de dominio para un producto público del catálogo.
 * Solo contiene los campos que devuelve GET /api/products (§2).
 */
export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  available: number;
}

export interface ProductsPage {
  items: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
}
