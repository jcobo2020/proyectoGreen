/**
 * Test de migración: crea las colecciones e índices de Product
 * y lista lo que la base de datos tiene, generando el migration_log.
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ProductModel } from '../models/product';
import fs from 'fs';
import path from 'path';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  await mongoose.connect(uri);

  // Sincronizar índices definidos en el esquema
  await ProductModel.syncIndexes();
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

describe('Migración de esquema — Product', () => {
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

    // Listar colecciones e índices para el log de migración
    const collections = await mongoose.connection.db!.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name as string);

    const logLines: string[] = [
      `=== Migration Log — WI-ORD-API-007 ===`,
      `Fecha: ${new Date().toISOString()}`,
      ``,
      `Colecciones disponibles: ${collectionNames.join(', ')}`,
      ``,
      `Índices en la colección 'products':`,
      ...indexes.map(
        (idx) =>
          `  - ${idx.name as string}: ${JSON.stringify(idx.key)}${idx.unique ? ' [UNIQUE]' : ''}`
      ),
      ``,
      `Resultado: OK — colección products creada con índices sku (único) y {active, name, sku}`,
    ];

    const logContent = logLines.join('\n');
    console.log(logContent);

    // Guardar el log de migración en la carpeta de evidencias
    const evidenceDir = path.resolve(__dirname, '../../../.sdd/evidence');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    fs.writeFileSync(path.join(evidenceDir, 'migration.log'), logContent, 'utf8');

    expect(collectionNames).toContain('products');
  });
});
