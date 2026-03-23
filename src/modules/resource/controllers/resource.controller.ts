import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ResourceService } from '../services/resource.service';
import { CurrentTenantId } from '../../../common/decorators/current-user.decorator';
import { CreateDealershipDto } from '../dto/create-dealership.dto';
import { CreateServiceBayDto } from '../dto/create-service-bay.dto';
import { CreateServiceTypeDto } from '../dto/create-service-type.dto';
import { CreateTechnicianDto } from '../dto/create-technician.dto';

@Controller()
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  // ── Dealerships ──────────────────────────────────────────────────────────────

  @Post('dealerships')
  createDealership(@Body() dto: CreateDealershipDto, @CurrentTenantId() tenantId: string) {
    return this.resourceService.createDealership(dto, tenantId);
  }

  @Get('dealerships')
  listDealerships(@CurrentTenantId() tenantId: string) {
    return this.resourceService.findDealerships(tenantId);
  }

  @Delete('dealerships/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDealership(@Param('id') id: string, @CurrentTenantId() tenantId: string) {
    return this.resourceService.deleteDealership(id, tenantId);
  }

  // ── Service Bays ─────────────────────────────────────────────────────────────

  @Post('service-bays')
  createServiceBay(@Body() dto: CreateServiceBayDto) {
    return this.resourceService.createServiceBay(dto);
  }

  @Get('dealerships/:dealershipId/service-bays')
  listServiceBays(@Param('dealershipId') dealershipId: string) {
    return this.resourceService.findServiceBays(dealershipId);
  }

  @Delete('service-bays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteServiceBay(@Param('id') id: string) {
    return this.resourceService.deleteServiceBay(id);
  }

  // ── Service Types ─────────────────────────────────────────────────────────────

  @Post('service-types')
  createServiceType(@Body() dto: CreateServiceTypeDto, @CurrentTenantId() tenantId: string) {
    return this.resourceService.createServiceType(dto, tenantId);
  }

  @Get('service-types')
  listServiceTypes(@CurrentTenantId() tenantId: string) {
    return this.resourceService.findServiceTypes(tenantId);
  }

  // ── Technicians ───────────────────────────────────────────────────────────────

  @Post('technicians')
  createTechnician(@Body() dto: CreateTechnicianDto) {
    return this.resourceService.createTechnician(dto);
  }

  @Get('dealerships/:dealershipId/technicians')
  listTechnicians(@Param('dealershipId') dealershipId: string) {
    return this.resourceService.findTechnicians(dealershipId);
  }

  @Delete('technicians/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTechnician(@Param('id') id: string) {
    return this.resourceService.deleteTechnician(id);
  }
}
