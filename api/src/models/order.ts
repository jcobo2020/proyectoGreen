import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IOrderItem {
  productId: Types.ObjectId;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface IOrder extends Document {
  code: string;
  customerId: string;
  status: 'pending_confirmation' | 'confirmed';
  items: IOrderItem[];
  total: number;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    code: { type: String, required: true, unique: true },
    customerId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending_confirmation', 'confirmed'],
      required: true,
      default: 'pending_confirmation',
    },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    confirmedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Índice único en code (ya en el schema)
// Índice compuesto para listado por cliente ordenado por fecha
orderSchema.index({ customerId: 1, createdAt: -1 });

export const OrderModel: Model<IOrder> = mongoose.model<IOrder>('Order', orderSchema);
