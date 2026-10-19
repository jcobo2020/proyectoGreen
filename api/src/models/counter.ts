import mongoose, { Schema, Model } from 'mongoose';

/** Secuencia anual del código de cliente (RN-06): _id = customers-AAAA. */
export interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  {
    collection: 'counters',
    versionKey: false,
  }
);

export const CounterModel: Model<ICounter> = mongoose.model<ICounter>('Counter', counterSchema);
