import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { SoporteRepositoryPort } from '../../domain/ports/soporte.repository.port';
import { ReasignarSoporteDto } from '../dtos/reasignar-soporte.dto';


@Injectable()
export class ReasignarSoporteUseCase {
  constructor(
    @Inject('SoporteRepositoryPort')
    private readonly soporteRepo: SoporteRepositoryPort, // <-- Cambiado aquí también
  ) {}

  async ejecutar(idAsignacion: number, idDeSoporte: number, dto: ReasignarSoporteDto) {
    if (!idDeSoporte) {
      throw new BadRequestException('Técnico actual no identificado.');
    }
    
    if (Number(idDeSoporte) === Number(dto.id_a_soporte)) {
      throw new BadRequestException('No puedes reasignarte la tarea a ti mismo.');
    }
    
    const resultado = await this.soporteRepo.reasignarSoporteTransaccional(idAsignacion, idDeSoporte, dto, 'TECNICO');

    return {
      exito: true,
      mensaje: 'El soporte ha sido reasignado correctamente.',
      datos: resultado,
    };
  }
}
