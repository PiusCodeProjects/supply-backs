import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '@cscp/types';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get()
  findAll(@Query('category') category?: string) {
    return this.catalogService.findAll(category);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER')
  findMyItems(@CurrentUser() user: JwtPayload) {
    return this.catalogService.findBySupplier(user.sub);
  }

  @Get('master-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER', 'ADMIN', 'CONTRACTOR')
  findAllMasterProducts() {
    return this.catalogService.findAllMasterProducts();
  }

  @Get('master-products/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listPendingMasterProducts() {
    return this.catalogService.listPendingMasterProducts();
  }

  @Get('master-products/my-submissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER')
  listMySubmissions(@CurrentUser() user: JwtPayload) {
    return this.catalogService.listMySubmissions(user.sub);
  }

  @Post('master-products/propose')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
  }))
  proposeMasterProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      dto.imageUrl = `http://localhost:4001/uploads/${file.filename}`;
    }
    return this.catalogService.proposeMasterProduct(user.sub, dto);
  }

  @Patch('master-products/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  approveMasterProduct(@Param('id') id: string) {
    return this.catalogService.approveMasterProduct(id);
  }

  @Patch('master-products/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  rejectMasterProduct(@Param('id') id: string, @Body() dto: { reason?: string }) {
    return this.catalogService.rejectMasterProduct(id, dto?.reason);
  }

  @Post('master-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
  }))
  createMasterProduct(@Body() dto: any, @UploadedFile() file?: Express.Multer.File) {
    if (file) {
      dto.imageUrl = `http://localhost:4001/uploads/${file.filename}`;
    }
    return this.catalogService.createMasterProduct(dto);
  }

  @Patch('master-products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
  }))
  updateMasterProduct(@Param('id') id: string, @Body() dto: any, @UploadedFile() file?: Express.Multer.File) {
    if (file) {
      dto.imageUrl = `http://localhost:4001/uploads/${file.filename}`;
    }
    return this.catalogService.updateMasterProduct(id, dto);
  }

  @Delete('master-products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeMasterProduct(@Param('id') id: string) {
    return this.catalogService.removeMasterProduct(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catalogService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCatalogItemDto) {
    return this.catalogService.create(user.sub, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCatalogItemDto>,
  ) {
    return this.catalogService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPPLIER')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.catalogService.remove(id, user.sub);
  }
}
