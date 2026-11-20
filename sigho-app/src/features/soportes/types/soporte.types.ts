// Reflejo exacto del enum en tu backend
export enum RolBandeja {
    USUARIO = 'USUARIO',
    OPERADOR = 'OPERADOR',
    TECNICO = 'TECNICO',
    ADMINISTRADOR = 'ADMINISTRADOR',
}

// DTO para enviar solicitudes nuevas
export interface CreateSolicitudDto {
    piso: string;
    oficina: string;
    descripcion: string;
}

// DTO para solicitar la bandeja
export interface BandejaSoporteDto {
    rol: RolBandeja;
    estado?: string;
}

// 1. Definimos cómo se ve un solo problema (ítem) reportado
export interface CrearSolicitudItemPayload {
    id_tipo_soporte: number;
    descripcion?: string; // Opcional, por si el usuario quiere dar más detalles
}

// 2. Definimos la cabecera completa de la solicitud
export interface CrearSolicitudPayload {
    piso?: string;
    oficina?: string;
    consultorio?: string;
    items: CrearSolicitudItemPayload[];
}

// Estructura del ticket que devuelve la base de datos (según tus consultas SQL)
export interface TicketSoporte {
    id?: number;
    id_solicitud: number;
    id_asignacion?: number; // Viene en la bandeja de técnico/administrador
    fecha_solicitud?: string;
    fecha_asignacion?: string;
    piso: string;
    oficina: string;
    consultorio?: string;
    estado: string;
    nombre_usuario?: string;
    username?: string;

    // Alertas (Operador)
    cantidad_resolicitudes?: number;
    ultima_resolicitud?: string;
    ultima_resolicitud_motivo?: string;

    // Métricas (Administrador)
    minutos_atencion?: number;
    cantidad_reasignaciones?: number;

    // PROPIEDADES PARA EL OPERADOR Y TÉCNICO
    id_tecnico?: number;
    prioridad?: string;
    fecha_inicio?: string;
    fecha_finalizacion?: string;
    segundos_desde_asignacion?: number;
    segundos_desde_inicio?: number;
    tiempo_resolucion?: string;
    diagnostico?: string;
    url_acta?: string;
    nombre_archivo_acta?: string;
    tipo_mime_acta?: string;
    nombre_tecnico?: string;
    ultima_reasignacion_motivo?: string;
}
