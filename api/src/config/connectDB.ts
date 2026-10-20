import mongoose from 'mongoose';
import { config } from './env';

export async function connectDB(uri?: string): Promise<typeof mongoose> {
  const mongoUri = uri ?? config.mongoUri;
  if (!mongoUri) {
    throw new Error('MONGODB_URI no está definida');
  }
  const conn = await mongoose.connect(mongoUri);
  return conn;
}
