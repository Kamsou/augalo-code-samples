import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pack, PackDocument } from './schemas/pack.schema';
import { ErrorCode } from '../common/exceptions/error-codes';
import { CreatePackDto } from './dto/create-pack.dto';
import { UpdatePackDto } from './dto/update-pack.dto';

@Injectable()
export class PacksService {
  constructor(@InjectModel(Pack.name) private packModel: Model<PackDocument>) {}

  async create(createPackDto: CreatePackDto): Promise<Pack> {
    const newPack = new this.packModel(createPackDto);
    return newPack.save();
  }

  async findAll(): Promise<Pack[]> {
    return this.packModel.find({ gallops: { $exists: false } }).exec();
  }

  async findActive(): Promise<Pack[]> {
    // Exclut les paliers : le front actuel n'attend que les packs globaux.
    return this.packModel
      .find({ isActive: true, gallops: { $exists: false } })
      .exec();
  }

  async findActiveTiers(): Promise<Pack[]> {
    return this.packModel
      .find({ isActive: true, gallops: { $exists: true } })
      .exec();
  }

  async findOne(id: string): Promise<Pack> {
    const pack = await this.packModel.findById(id);
    if (!pack) {
      throw new NotFoundException({
        errorCode: ErrorCode.PACK_NOT_FOUND,
        message: 'Pack not found',
      });
    }
    return pack;
  }

  async findByYear(year: number): Promise<Pack> {
    const pack = await this.packModel.findOne({ year });
    if (!pack) {
      throw new NotFoundException({
        errorCode: ErrorCode.PACK_NOT_FOUND,
        message: `Pack for year ${year} not found`,
      });
    }
    return pack;
  }

  async update(id: string, updatePackDto: UpdatePackDto): Promise<Pack> {
    const updatedPack = await this.packModel.findByIdAndUpdate(
      id,
      updatePackDto,
      { new: true },
    );
    if (!updatedPack) {
      throw new NotFoundException({
        errorCode: ErrorCode.PACK_NOT_FOUND,
        message: 'Pack not found',
      });
    }
    return updatedPack;
  }

  async remove(id: string): Promise<void> {
    const result = await this.packModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException({
        errorCode: ErrorCode.PACK_NOT_FOUND,
        message: 'Pack not found',
      });
    }
  }
}
