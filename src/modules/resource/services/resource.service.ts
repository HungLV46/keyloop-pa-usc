import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dealership } from '../entities/dealership.entity';
import { ServiceBay } from '../entities/service-bay.entity';
import { ServiceType } from '../entities/service-type.entity';
import { Technician } from '../entities/technician.entity';
import { CreateDealershipDto } from '../dto/create-dealership.dto';
import { CreateServiceBayDto } from '../dto/create-service-bay.dto';
import { CreateServiceTypeDto } from '../dto/create-service-type.dto';
import { CreateTechnicianDto } from '../dto/create-technician.dto';

@Injectable()
export class ResourceService {
  constructor(
    @InjectRepository(Dealership) private readonly dealershipRepo: Repository<Dealership>,
    @InjectRepository(ServiceBay) private readonly serviceBayRepo: Repository<ServiceBay>,
    @InjectRepository(ServiceType) private readonly serviceTypeRepo: Repository<ServiceType>,
    @InjectRepository(Technician) private readonly technicianRepo: Repository<Technician>,
  ) {}

  // ── Dealerships ──────────────────────────────────────────────────────────────

  createDealership(dto: CreateDealershipDto, tenantId: string): Promise<Dealership> {
    return this.dealershipRepo.save(this.dealershipRepo.create({ ...dto, tenantId }));
  }

  findDealerships(tenantId: string): Promise<Dealership[]> {
    return this.dealershipRepo.find({ where: { tenantId, isActive: true } });
  }

  async findDealership(id: string, tenantId: string): Promise<Dealership> {
    const d = await this.dealershipRepo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException('Dealership not found');
    return d;
  }

  async updateDealership(id: string, dto: Partial<CreateDealershipDto>, tenantId: string): Promise<Dealership> {
    await this.findDealership(id, tenantId);
    await this.dealershipRepo.update({ id, tenantId }, dto);
    return this.findDealership(id, tenantId);
  }

  async deleteDealership(id: string, tenantId: string): Promise<void> {
    await this.findDealership(id, tenantId);
    await this.dealershipRepo.update({ id, tenantId }, { isActive: false });
  }

  // ── Service Bays ─────────────────────────────────────────────────────────────

  createServiceBay(dto: CreateServiceBayDto): Promise<ServiceBay> {
    return this.serviceBayRepo.save(this.serviceBayRepo.create(dto));
  }

  findServiceBays(dealershipId: string): Promise<ServiceBay[]> {
    return this.serviceBayRepo.find({ where: { dealershipId, isActive: true } });
  }

  async deleteServiceBay(id: string): Promise<void> {
    const bay = await this.serviceBayRepo.findOne({ where: { id } });
    if (!bay) throw new NotFoundException('Service bay not found');
    await this.serviceBayRepo.update(id, { isActive: false });
  }

  // ── Service Types ─────────────────────────────────────────────────────────────

  createServiceType(dto: CreateServiceTypeDto, tenantId: string): Promise<ServiceType> {
    return this.serviceTypeRepo.save(this.serviceTypeRepo.create({ ...dto, tenantId }));
  }

  findServiceTypes(tenantId: string): Promise<ServiceType[]> {
    return this.serviceTypeRepo.find({ where: { tenantId } });
  }

  // ── Technicians ───────────────────────────────────────────────────────────────

  createTechnician(dto: CreateTechnicianDto): Promise<Technician> {
    return this.technicianRepo.save(this.technicianRepo.create(dto));
  }

  findTechnicians(dealershipId: string): Promise<Technician[]> {
    return this.technicianRepo.find({
      where: { dealershipId, isActive: true },
      relations: ['shifts'],
    });
  }

  async deleteTechnician(id: string): Promise<void> {
    const tech = await this.technicianRepo.findOne({ where: { id } });
    if (!tech) throw new NotFoundException('Technician not found');
    await this.technicianRepo.update(id, { isActive: false });
  }
}
