import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PackDocument = Pack & Document;

@Schema({ timestamps: true })
export class Pack {
  @Prop({ required: true })
  year: number;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true })
  name: string; // "Pack Premium 2024-2025"

  @Prop({ required: true })
  price: number; // 19.99

  @Prop({ required: true })
  stripeProductId: string;

  @Prop({ required: true })
  stripePriceId: string;

  @Prop({ required: true })
  appleProductId: string; // com.ionic.augalo.com.premium.2024

  @Prop({ required: true })
  androidProductId: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isLegacy: boolean;

  @Prop({ type: [Number] })
  gallops?: number[];
}

export const PackSchema = SchemaFactory.createForClass(Pack);
