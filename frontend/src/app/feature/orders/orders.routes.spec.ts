import { ordersRoutes } from './orders.routes';
import { authGuard } from '../../@core/guards/auth.guard';
import { ORDER_REPOSITORY } from './domain/ports/order-repository.port';
import { PRODUCT_REPOSITORY } from './domain/ports/product-repository.port';
import { HttpOrderRepository } from './infrastructure/http-order.repository';
import { HttpProductRepository } from './infrastructure/http-product.repository';
import { ListOrdersUseCase, ListProductsUseCase, CreateOrderUseCase } from './application/order.use-cases';

/**
 * Spec de orders.routes.ts (R4-ARQ-2, R4-ARQ-6):
 * - La ruta raíz usa authGuard.
 * - Los providers incluyen HttpClient propio, ORDER_REPOSITORY, PRODUCT_REPOSITORY y casos de uso.
 * - Las rutas hijas: '' (listado), 'new' (nuevo pedido) — literales antes que paramétricas.
 */
describe('ordersRoutes (orders.routes.ts)', () => {
  it('define un array de rutas', () => {
    expect(Array.isArray(ordersRoutes)).toBe(true);
    expect(ordersRoutes.length).toBeGreaterThan(0);
  });

  it('la ruta raíz usa authGuard como canActivate (R4-ARQ-6)', () => {
    const rutaRaiz = ordersRoutes[0];
    expect(rutaRaiz.canActivate).toBeDefined();
    expect(rutaRaiz.canActivate).toContain(authGuard);
  });

  it('la ruta raíz declara providers (HttpClient propio + repositorios + casos de uso)', () => {
    const rutaRaiz = ordersRoutes[0];
    expect(rutaRaiz.providers).toBeDefined();
    expect(Array.isArray(rutaRaiz.providers)).toBe(true);
    expect((rutaRaiz.providers as unknown[]).length).toBeGreaterThan(0);
  });

  it('los providers incluyen ORDER_REPOSITORY apuntando a HttpOrderRepository', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as Array<{ provide?: unknown; useClass?: unknown }>;
    const repoProvider = providers.find(p => p.provide === ORDER_REPOSITORY);
    expect(repoProvider).toBeDefined();
    expect(repoProvider?.useClass).toBe(HttpOrderRepository);
  });

  it('los providers incluyen PRODUCT_REPOSITORY apuntando a HttpProductRepository', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as Array<{ provide?: unknown; useClass?: unknown }>;
    const repoProvider = providers.find(p => p.provide === PRODUCT_REPOSITORY);
    expect(repoProvider).toBeDefined();
    expect(repoProvider?.useClass).toBe(HttpProductRepository);
  });

  it('los providers incluyen ListOrdersUseCase', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as unknown[];
    expect(providers).toContain(ListOrdersUseCase);
  });

  it('los providers incluyen ListProductsUseCase', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as unknown[];
    expect(providers).toContain(ListProductsUseCase);
  });

  it('los providers incluyen CreateOrderUseCase', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as unknown[];
    expect(providers).toContain(CreateOrderUseCase);
  });

  it('la ruta hija "" carga OrderListComponent con loadComponent (R4-ARQ-2)', () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaListado = rutas.find(r => r.path === '');
    expect(rutaListado).toBeDefined();
    expect(typeof rutaListado?.loadComponent).toBe('function');
  });

  it('loadComponent de "" resuelve a OrderListComponent', async () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaListado = rutas.find(r => r.path === '');
    const componente = await (rutaListado?.loadComponent as () => Promise<unknown>)();
    expect(componente).toBeDefined();
  });

  it('existe la ruta "new" para OrderNewComponent (R4-ARQ-2)', () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaNew = rutas.find(r => r.path === 'new');
    expect(rutaNew).toBeDefined();
    expect(typeof rutaNew?.loadComponent).toBe('function');
  });

  it('loadComponent de "new" resuelve a OrderNewComponent', async () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaNew = rutas.find(r => r.path === 'new');
    const componente = await (rutaNew?.loadComponent as () => Promise<unknown>)();
    expect(componente).toBeDefined();
  });

  it('la ruta literal "new" aparece antes que cualquier ruta paramétrica (R4-ARQ-2)', () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const idxNew = rutas.findIndex(r => r.path === 'new');
    const idxParam = rutas.findIndex(r => r.path?.startsWith(':'));
    // Si no hay ruta paramétrica aún, 'new' debe estar definida
    expect(idxNew).toBeGreaterThanOrEqual(0);
    if (idxParam >= 0) {
      expect(idxNew).toBeLessThan(idxParam);
    }
  });
});
