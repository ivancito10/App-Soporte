export abstract class NotificationServicePort {
  abstract enviarNotificacion(
    destino: number | string | string[],
    titulo: string,
    mensaje: string,
    dataPayload?: Record<string, string>,
  ): Promise<boolean>;
}