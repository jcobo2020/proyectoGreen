import mongoose, { ConnectOptions } from 'mongoose';
import { config } from './env';

/** Conexión centralizada. options es opcional: la siembra de executives la pide sin autoIndex. */
export async function connectDB(uri?: string, options?: ConnectOptions): Promise<typeof mongoose> {
  const mongoUri = uri ?? config.mongoUri;
  if (!mongoUri) {
    throw new Error('MONGODB_URI no está definida');
  }
  const conn = await mongoose.connect(mongoUri, options);
  return conn;
}
