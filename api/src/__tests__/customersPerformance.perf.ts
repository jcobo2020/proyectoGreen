/**
 * R4-REND-1 (WI-H2-API-CLIENTES-001): p95 por debajo de 300 ms en local con 50 peticiones
 * concurrentes al listado. Es una MEDICIÓN, no una prueba de la suite: su nombre (*.perf.ts) no
 * casa con el testMatch de `npm test`, porque en una CI cargada el tiempo no es determinista. La
 * corre `npm run evidence`, que deja el resultado en PERFORMANCE_LOG_FILE. Lo determinista (qué
 * índice usa la consulta) lo comprueba customers.spec.ts.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Application } from 'express';
import { createApp } from '../app';
import { CustomerModel } from '../models/customer';

const CONCURRENT_REQUESTS = 50;
const P95_LIMIT_MS = 300;

let app: Application;
let replSet: MongoMemoryReplSet;
let token: string;

beforeAll(async () => {
  const secret = crypto.randomBytes(32).toString('hex');
  process.env['JWT_SECRET'] = secret;
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await CustomerModel.syncIndexes();
  app = createApp(mongoose);
  token = jwt.sign({ sub: 'executive-perf', exp: Math.floor(Date.now() / 1000) + 3600 }, secret, { algorithm: 'HS256' });
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

it(`${CONCURRENT_REQUESTS} GET /api/customers concurrentes con p95 < ${P95_LIMIT_MS} ms`, async () => {
  const executive = await mongoose.connection.collection('executives').insertOne({ name: 'Marta Ruiz', active: true });
  await CustomerModel.insertMany(
    Array.from({ length: 60 }, (_v, i) => ({
      code: `PRO-2026-${String(i + 1).padStart(3, '0')}`,
      personType: 'natural',
      idType: 'cedula',
      idNumber: String(4000000000 + i),
      firstNames: 'N',
      lastNames: 'A',
      email: `n${i}@example.com`,
      sourceChannel: 'web',
      accountExecutiveId: executive.insertedId,
    }))
  );
  // Calentamiento: la primera petición compila rutas y abre conexiones
  await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);

  const durations = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, async () => {
      const start = process.hrtime.bigint();
      const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      return Number(process.hrtime.bigint() - start) / 1e6;
    })
  );
  durations.sort((a, b) => a - b);
  const percentile = (p: number): number => durations[Math.ceil(durations.length * p) - 1];
  const p95 = percentile(0.95);

  const target = process.env['PERFORMANCE_LOG_FILE'];
  if (target) {
    const lines = [
      '=== R4-REND-1 — GET /api/customers (WI-H2-API-CLIENTES-001) ===',
      `Fecha: ${new Date().toISOString()}`,
      `Node: ${process.version} · MongoDB en memoria (mongodb-memory-server, wiredTiger) · 60 clientes con ejecutivo`,
      `Peticiones concurrentes: ${CONCURRENT_REQUESTS} (tras una de calentamiento)`,
      `p50: ${percentile(0.5).toFixed(1)} ms · p95: ${p95.toFixed(1)} ms · máx: ${durations[durations.length - 1].toFixed(1)} ms`,
      `Límite: p95 < ${P95_LIMIT_MS} ms → ${p95 < P95_LIMIT_MS ? 'CUMPLE' : 'NO CUMPLE'}`,
    ];
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, lines.join('\n') + '\n', 'utf8');
  }
  expect(p95).toBeLessThan(P95_LIMIT_MS);
}, 60000);
