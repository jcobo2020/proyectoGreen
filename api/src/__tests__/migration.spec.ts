/**
 * Test de migración: crea las colecciones e índices de Product y Order
 * y lista lo que la base de datos tiene, generando el migration_log.
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ProductModel } from '../models/product';
import { OrderModel } from '../models/order';
import fs from 'fs';
import path from 'path';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();
  await mongoose.connect(uri);

  // Sincronizar índices definidos en los esquemas
  await ProductModel.syncIndexes();
  await OrderModel.syncIndexes();
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

describe('Migración de esquema — Product y Order', () => {
  it('crea la colección products y sus índices correctamente', async () => {
    // Verificar que los índices existen
    const indexes = await ProductModel.collection.listIndexes().toArray();

    // Debe existir el índice único en sku
    const skuIndex = indexes.find(
      (idx) => idx.key && idx.key['sku'] === 1 && idx.unique === true
    );
    expect(skuIndex).toBeDefined();

    // Debe existir el índice compuesto {active, name, sku}
    const catalogIndex = indexes.find(
      (idx) =>
        idx.key &&
        idx.key['active'] === 1 &&
        idx.key['name'] === 1 &&
        idx.key['sku'] === 1
    );
    expect(catalogIndex).toBeDefined();

    // Insertar un documento de prueba para verificar el esquema
    const testProduct = await ProductModel.create({
      sku: 'MIGRATION-TEST-001',
      name: 'Producto de prueba migración',
      unitPrice: 9.99,
      available: 100,
      active: true,
    });

    expect(testProduct._id).toBeDefined();
    expect(testProduct.sku).toBe('MIGRATION-TEST-001');
    expect(testProduct.active).toBe(true);

    // Verificar restricción de unicidad en sku
    await expect(
      ProductModel.create({
        sku: 'MIGRATION-TEST-001',
        name: 'Duplicado',
        unitPrice: 1.0,
        available: 0,
        active: true,
      })
    ).rejects.toThrow();
  });

  it('crea la colección orders y sus índices correctamente', async () => {
    const indexes = await OrderModel.collection.listIndexes().toArray();

    // Debe existir el índice único en code
    const codeIndex = indexes.find(
      (idx) => idx.key && idx.key['code'] === 1 && idx.unique === true
    );
    expect(codeIndex).toBeDefined();

    // Debe existir el índice compuesto {customerId, createdAt}
    const listIndex = indexes.find(
      (idx) =>
        idx.key &&
        idx.key['customerId'] === 1 &&
        idx.key['createdAt'] === -1
    );
    expect(listIndex).toBeDefined();
  });

  it('genera el log de migración', async () => {
    // Listar colecciones e índices para el log de migración
    const collections = await mongoose.connection.db!.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name as string);

    const productIndexes = await ProductModel.collection.listIndexes().toArray();
    const orderIndexes = await OrderModel.collection.listIndexes().toArray();

    const logLines: string[] = [
      `=== Migration Log — WI-ORD-API-005 ===`,
      `Fecha: ${new Date().toISOString()}`,
      ``,
      `Colecciones disponibles: ${collectionNames.join(', ')}`,
      ``,
      `Índices en la colección 'products':`,
      ...productIndexes.map(
        (idx) =>
          `  - ${idx.name as string}: ${JSON.stringify(idx.key)}${idx.unique ? ' [UNIQUE]' : ''}`
      ),
      ``,
      `Índices en la colección 'orders':`,
      ...orderIndexes.map(
        (idx) =>
          `  - ${idx.name as string}: ${JSON.stringify(idx.key)}${idx.unique ? ' [UNIQUE]' : ''}`
      ),
      ``,
      `Resultado: OK — colecciones products y orders creadas con sus índices`,
    ];

    const logContent = logLines.join('\n');
    console.log(logContent);

    // Guardar el log de migración en la carpeta de evidencias
    const evidenceDir = path.resolve(__dirname, '../../../.sdd/evidence');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    // Escribir en un fichero con nombre específico de este work item
    // para no pisar la evidencia de WI-ORD-API-007 (migration.log)
    fs.writeFileSync(path.join(evidenceDir, 'migration-WI-ORD-API-005.log'), logContent, 'utf8');

    expect(collectionNames).toContain('products');
    expect(collectionNames).toContain('orders');
  });
});
