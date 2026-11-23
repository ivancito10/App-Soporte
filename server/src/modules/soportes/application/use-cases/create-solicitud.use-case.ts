import { Injectable, Inject } from '@nestjs/common';
import { SoporteRepositoryPort } from '../../domain/ports/soporte.repository.port';
import { NotificationServicePort } from '../../domain/ports/notification.service.port'; // <-- 1. Importar el puerto
import { CreateSolicitudDto } from '../dtos/create-solicitud.dto';

@Injectable()
export class CreateSolicitudUseCase {
  constructor(
    @Inject('SoporteRepositoryPort')
    private readonly soporteRepository: SoporteRepositoryPort,

    @Inject('NotificationServicePort') // <-- 2. Inyectar el servicio de notificaciones
    private readonly notificationService: NotificationServicePort,
  ) { }

  async ejecutar(idUsuario: number, dto: CreateSolicitudDto) {
    // 3. Crear la solicitud en la base de datos (tu lógica original)
    // CORRECCIÓN 3: Renombrar a crearSolicitudTransaccional
    const nuevaSolicitud = await this.soporteRepository.crearSolicitudTransaccional(idUsuario, dto);

    // 4. Enviar Notificación Push a los Operadores activos
    try {
      const tokensOperadores = await this.soporteRepository.obtenerTokensOperadoresActivos();
      if (tokensOperadores && tokensOperadores.length > 0) {
        await this.notificationService.enviarNotificacion(
          tokensOperadores,
          'Nueva Solicitud de Soporte',
          `El usuario #${idUsuario} ha solicitado soporte en ${dto.oficina}.`,
          { idSolicitud: nuevaSolicitud.id?.toString() }
        );
      }
    } catch (error) {
      console.error('La solicitud se guardó, pero falló la notificación:', error);
    }

    return nuevaSolicitud;
  }
}