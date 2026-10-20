/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/controllers/**/*.ts',
    'src/models/**/*.ts',
    'src/middlewares/**/*.ts',
    'src/validators/**/*.ts',
    'src/lib/**/*.ts',
    'src/routes/**/*.ts',
    'src/scripts/**/*.ts',
    'src/app.ts',
    // La conexión centralizada: WI-H2-API-EJECUTIVOS-003 le añadió las opciones de la siembra
    'src/config/connectDB.ts',
    // El generador de evidencia de WI-H2-API-CLIENTES-001 también es código del work item
    'scripts/**/*.js'
  ],
  coverageThreshold: {
    global: {
      lines: 80
    }
  },
  testTimeout: 60000,
  globalSetup: undefined,
  globalTeardown: undefined
};
