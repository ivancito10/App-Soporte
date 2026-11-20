import { Platform } from 'react-native';
import { api } from '../../../core/api/axios.config';
import { BandejaSoporteDto, CreateSolicitudDto } from '../types/soporte.types';
import { CrearSolicitudPayload } from '../types/soporte.types';

// 1. Crear una nueva solicitud (Usuario)
export const crearSolicitud = async (data: CreateSolicitudDto) => {
    const response = await api.post('/soportes/solicitud', data);
    return response.data;
};

// 2. Obtener la bandeja dinámica (depende del rol)
export const obtenerBandeja = async (params: any) => {
    const response = await api.get('/soportes/bandeja', { params });

    // Si esta línea no existe, o no devuelve response.data, 
    // la pantalla recibe 'undefined' y no muestra los tickets.
    return response.data;
};

// 3. Re-solicitar o Insistir (Usuario)
export const resolicitarSoporte = async (idSolicitud: number, motivo?: string) => {
    const textoMotivo = motivo?.trim() || 'El usuario solicita atención inmediata';
    const payload = {
        motivo: textoMotivo,
        observacion: textoMotivo,
    };

    const response = await api.post(`/soportes/solicitud/${idSolicitud}/resolicitar`, payload);
    return response.data;
};

// 4. Asignar técnico (Operador) con nivel de prioridad
export const asignarSoporte = async (idSolicitud: number, idTecnico: number, prioridad: string = 'NORMAL') => {
    const response = await api.post('/soportes/asignar', { idSolicitud, idTecnico, prioridad });
    return response.data;
};

// 5. Subir acta y finalizar (Técnico) - Compatible con Web y Móvil
export const finalizarSoporte = async (idAsignacion: number, uriArchivo: string, observacion: string) => {
    const formData = new FormData();

    const filename = uriArchivo.split('/').pop() || 'acta.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    // El backend en SoportesController espera @Body('observacion') y FileInterceptor('archivo')
    formData.append('observacion', observacion || '');

    if (Platform.OS === 'web') {
        const res = await fetch(uriArchivo);
        const blob = await res.blob();
        const fileNameWeb = filename.includes('.') ? filename : 'acta.jpg';
        formData.append('archivo', blob, fileNameWeb);
    } else {
        // @ts-ignore - Sintaxis de FormData en React Native móvil
        formData.append('archivo', { uri: uriArchivo, name: filename, type });
    }

    const response = await api.post(`/soportes/asignacion/${idAsignacion}/finalizar`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return response.data;
};

// 5B. Reasignar / Derivar soporte a otro técnico (Rol TÉCNICO)
export const reasignarSoporte = async (idAsignacion: number, idASoporte: number, justificacion: string) => {
    const response = await api.post(`/soportes/asignacion/${idAsignacion}/reasignar`, {
        id_a_soporte: Number(idASoporte),
        justificacion,
    });
    return response.data;
};
// Añade esta nueva función al final:
export const crearNuevaSolicitud = async (payload: CrearSolicitudPayload) => {
    // Utilizamos tu misma instancia de axios (api) que ya tiene el token JWT configurado
    const response = await api.post('/soportes/solicitud', payload);
    return response.data;
};
export const obtenerDetallesSolicitud = async (idSolicitud: number) => {
    try {
        const response = await api.get(`/soportes/solicitud/${idSolicitud}/items`);
        // Extraemos los datos dependiendo de cómo los devuelva tu backend
        return response.data?.data || response.data?.datos || response.data || [];
    } catch (error) {
        console.error('Error al obtener los detalles del ticket:', error);
        return [];
    }
};
// Añade esto al final del archivo
export const agregarItemSoporte = async (idSolicitud: number, payload: { id_tipo_soporte: number; descripcion: string }) => {
    const response = await api.post(`/soportes/solicitud/${idSolicitud}/items`, payload);
    return response.data;
};
export const obtenerTecnicos = async () => {
    try {
        const response = await api.get('/soportes/tecnicos/disponibles');
        return response.data?.datos || [];
    } catch (error) {
        console.error('Error al obtener técnicos:', error);
        return [];
    }
};

// 6. Técnico pone el ticket EN PROCESO
export const ponerEnProcesoSoporte = async (idSolicitud: number) => {
    const response = await api.post(`/soportes/solicitud/${idSolicitud}/en-proceso`);
    return response.data;
};

// 7. Operador reasigna el ticket a otro técnico con justificación y prioridad
export const reasignarSoporteOperador = async (idSolicitud: number, idTecnico: number, justificacion: string, prioridad?: string) => {
    const response = await api.post(`/soportes/solicitud/${idSolicitud}/reasignar-operador`, {
        idTecnico,
        justificacion,
        prioridad,
    });
    return response.data;
};

// 8. Obtener el archivo de acta adjunta de una solicitud (soporte_archivos_actas)
export const obtenerActaSolicitud = async (idSolicitud: number) => {
    try {
        const response = await api.get(`/soportes/solicitud/${idSolicitud}/acta`);
        return response.data?.datos || response.data?.data || null;
    } catch (error) {
        console.error('Error al obtener el acta de la solicitud:', error);
        return null;
    }
};

// 9. Construir la URL pública completa del archivo a partir de ruta_url (ej. /uploads/soportes/actas/...)
export const construirUrlArchivo = (rutaUrl?: string | null): string | null => {
    if (!rutaUrl) return null;
    if (rutaUrl.startsWith('http://') || rutaUrl.startsWith('https://')) {
        return rutaUrl;
    }
    const baseApiUrl = api.defaults.baseURL || '';
    const baseServerUrl = baseApiUrl.replace(/\/api\/?$/, '');
    const pathLimpio = rutaUrl.startsWith('/') ? rutaUrl : `/${rutaUrl}`;
    return `${baseServerUrl}${pathLimpio}`;
};

// =========================================================
// 10. GESTIÓN DE ROLES (ADMINISTRADOR)
// =========================================================

export const obtenerUsuariosConRoles = async () => {
    const response = await api.get('/soportes/roles/usuarios');
    return response.data?.datos || response.data?.data || response.data || [];
};

export const asignarRolUsuario = async (idUsuario: number, rolSoporte: 'USUARIO' | 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR') => {
    const response = await api.post('/soportes/roles/asignar', {
        id_usuario: Number(idUsuario),
        rol_soporte: rolSoporte,
    });
    return response.data;
};

export const quitarRolUsuario = async (idUsuario: number, rolSoporte?: string) => {
    const response = await api.patch(`/soportes/roles/${Number(idUsuario)}/quitar`, {
        rol_soporte: rolSoporte,
    });
    return response.data;
};

export const obtenerMisRoles = async () => {
    const response = await api.get('/soportes/mis-roles');
    return response.data;
};