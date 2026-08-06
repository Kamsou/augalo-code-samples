import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';
import { Pack, PackSchema } from './schemas/pack.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Pack.name, schema: PackSchema }]),
  ],
  controllers: [PacksController],
  providers: [PacksService],
  exports: [PacksService],
})
export class PacksModule {}
