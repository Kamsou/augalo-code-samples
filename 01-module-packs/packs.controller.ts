import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PacksService } from './packs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CreatePackDto } from './dto/create-pack.dto';
import { UpdatePackDto } from './dto/update-pack.dto';

@Controller('api/packs')
@UseGuards(JwtAuthGuard)
export class PacksController {
  constructor(private packsService: PacksService) {}

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() createPackDto: CreatePackDto) {
    const pack = await this.packsService.create(createPackDto);
    return {
      message: 'The pack has been created.',
      data: pack,
    };
  }

  @Public()
  @Get()
  async findAll() {
    return this.packsService.findAll();
  }

  @Public()
  @Get('active')
  async findActive() {
    return this.packsService.findActive();
  }

  @Public()
  @Get('tiers')
  async findActiveTiers() {
    return this.packsService.findActiveTiers();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const pack = await this.packsService.findOne(id);
    return {
      message: 'The pack has been retrieved.',
      data: pack,
    };
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() updatePackDto: UpdatePackDto) {
    const updatedPack = await this.packsService.update(id, updatePackDto);
    return {
      message: 'The pack has been modified.',
      data: updatedPack,
    };
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    await this.packsService.remove(id);
    return { message: 'The pack has been deleted.' };
  }
}
