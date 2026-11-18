import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// 1. IMPORTACIONES ACTUALIZADAS PARA FIREBASE ADMIN v12+
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import * as path from 'path';

import { NotificationServicePort } from '../../domain/ports/notification.service.port';
import { SoporteFcmTokenTypeOrmEntity } from '../../domain/entities/fcm-token.typeorm-entity';
import { DB_CONNECTIONS } from '../../../../config/database.constants';

@Injectable()
export class FcmNotificationService implements NotificationServicePort {
  private readonly logger = new Logger(FcmNotificationService.name);

  constructor(
    @InjectRepository(SoporteFcmTokenTypeOrmEntity, DB_CONNECTIONS.SIGHOV)
    private readonly tokenRepo: Repository<SoporteFcmTokenTypeOrmEntity>,
  ) {
    if (getApps().length === 0) {
      try {
        // 1. Buscamos el archivo JSON en la raíz del proyecto
        const serviceAccountPath = path.resolve(process.cwd(), 'firebase-adminsdk.json');
        
        // 2. Inicializamos con las credenciales físicas
        initializeApp({
          credential: cert(serviceAccountPath),
        });
        this.logger.log('Firebase Admin inicializado correctamente con credenciales físicas.');
      } catch (error) {
        this.logger.error('Error al inicializar Firebase Admin. Asegúrate de poner el firebase-adminsdk.json en la raíz del proyecto', error);
      }
    }
  }

  /**
   * Fase 3: Función genérica para enviar notificaciones Push con Firebase Admin.
   * Acepta un token FCM directo (string), un arreglo de tokens (string[]) o un id_usuario (number).
   */
  async enviarNotificacion(
    destino: number | string | string[],
    titulo: string,
    mensaje: string,
    dataPayload?: Record<string, string>,
  ): Promise<boolean> {
    try {
      let deviceTokens: string[] = [];

      if (typeof destino === 'string') {
        deviceTokens = [destino.trim()].filter(Boolean);
      } else if (Array.isArray(destino)) {
        deviceTokens = Array.from(new Set(destino.map((t) => t?.trim()).filter(Boolean)));
      } else if (typeof destino === 'number') {
        const tokens = await this.tokenRepo.find({
          where: { idUsuario: destino },
        });
        deviceTokens = Array.from(new Set(tokens.map((t) => t.tokenDispositivo).filter(Boolean)));
      }

      if (!deviceTokens || deviceTokens.length === 0) {
        this.logger.warn(`No se encontraron tokens FCM para el destino: ${JSON.stringify(destino)}.`);
        return false;
      }

      // Configuración con prioridad máxima tipo WhatsApp para Android + Multicast
      const payload: MulticastMessage = {
        notification: {
          title: titulo,
          body: mensaje,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            sound: 'default',
            priority: 'max',
            defaultVibrateTimings: true,
          },
        },
        data: dataPayload || {},
        tokens: deviceTokens,
      };

      const response = await getMessaging().sendEachForMulticast(payload);

      this.logger.log(
        `Notificación Push enviada (${response.successCount} exitosas, ${response.failureCount} fallidas): "${mensaje}"`,
      );

      if (response.failureCount > 0) {
        this.logger.warn(`Fallaron ${response.failureCount} notificaciones hacia ${JSON.stringify(destino)}.`);
      }

      return response.successCount > 0;
    } catch (error: any) {
      this.logger.error(`Error enviando notificación Push: ${error.message}`);
      return false;
    }
  }
}