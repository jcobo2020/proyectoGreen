import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno requerida no encontrada: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  mongoUri: process.env['MONGODB_URI'] ?? '',
  jwtSecret: process.env['JWT_SECRET'] ?? '',
  jwtSecretPrevious: process.env['JWT_SECRET_PREVIOUS'] ?? '',
};

export function validateConfig(): void {
  if (!config.jwtSecret) {
    throw new Error('Variable de entorno requerida no encontrada: JWT_SECRET');
  }
  if (!config.mongoUri) {
    throw new Error('Variable de entorno requerida no encontrada: MONGODB_URI');
  }
}
