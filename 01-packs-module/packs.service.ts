import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Pack, PackDocument } from './schemas/pack.schema';
import { ErrorCode } from '../common/exceptions/error-codes';
import { CreatePackDto } from './dto/create-pack.dto';
import { UpdatePackDto } from './dto/update-pack.dto';

@Injectable()
export class PacksService {
  constructor(@InjectModel(Pack.name) private packModel: Model<PackDocument>) {}

  private notFound(message = 'Pack not found'): NotFoundException {
    return new NotFoundException({
      errorCode: ErrorCode.PACK_NOT_FOUND,
      message,
    });
  }

  private assertObjectId(id: string): void {
    if (!isValidObjectId(id)) {
      throw this.notFound();
    }
  }

  async create(createPackDto: CreatePackDto): Promise<Pack> {
    const newPack = new this.packModel(createPackDto);
    return newPack.save();
  }

  async findAll(): Promise<Pack[]> {
    return this.packModel.find({ gallops: { $exists: false } }).exec();
  }

  async findActive(): Promise<Pack[]> {
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
    this.assertObjectId(id);
    const pack = await this.packModel.findById(id);
    if (!pack) {
      throw this.notFound();
    }
    return pack;
  }

  async findByYear(year: number): Promise<Pack> {
    const pack = await this.packModel.findOne({
      year,
      gallops: { $exists: false },
    });
    if (!pack) {
      throw this.notFound(`Pack for year ${year} not found`);
    }
    return pack;
  }

  async update(id: string, updatePackDto: UpdatePackDto): Promise<Pack> {
    this.assertObjectId(id);
    const updatedPack = await this.packModel.findByIdAndUpdate(
      id,
      updatePackDto,
      { new: true, runValidators: true },
    );
    if (!updatedPack) {
      throw this.notFound();
    }
    return updatedPack;
  }

  async remove(id: string): Promise<void> {
    this.assertObjectId(id);
    const result = await this.packModel.findByIdAndDelete(id);
    if (!result) {
      throw this.notFound();
    }
  }
}
