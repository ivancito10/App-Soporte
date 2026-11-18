import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TicketSoporte } from '../types/soporte.types';
import { theme } from '../../../core/theme/theme';

interface Props {
    ticket: TicketSoporte;
    onPress: () => void;
}

const obtenerColorEstado = (estado: string) => {
    switch (estado) {
        case 'FINALIZADA':
            return '#27ae60'; // Verde (Concluido)
        case 'EN_PROCESO':
            return '#8e44ad'; // Morado (En proceso por el técnico)
        case 'ASIGNADA':
            return '#3498db'; // Azul celeste (Ya asignado a técnico)
        case 'PENDIENTE':
        default:
            return '#f39c12'; // Naranja (Pendiente de asignar)
    }
};

const obtenerTextoEstado = (estado: string) => {
    if (estado === 'EN_PROCESO') return 'EN PROCESO';
    return estado;
};

const obtenerInfoPrioridad = (prioridad?: string) => {
    const p = (prioridad || '').toUpperCase();
    if (p === 'URGENTE') return { texto: 'URGENTE', dot: '#e74c3c', color: '#c0392b', bg: '#fdecea' };
    if (p === 'ALTA') return { texto: 'ALTA', dot: '#e67e22', color: '#d35400', bg: '#fef5e7' };
    if (p === 'NORMAL') return { texto: 'NORMAL', dot: '#2ecc71', color: '#27ae60', bg: '#eafaf1' };
    if (p === 'BAJA') return { texto: 'BAJA', dot: '#3498db', color: '#2980b9', bg: '#ebf5fb' };
    return null;
};

const formatearFechaHora = (fechaIso?: string) => {
    if (!fechaIso) return 'No registrada';
    const d = new Date(fechaIso);
    if (isNaN(d.getTime())) return 'No registrada';
    const fecha = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${fecha} — ${hora}`;
};

const formatearSegundos = (totalSegundos: number) => {
    const segs = Math.max(0, Math.floor(totalSegundos));
    const horas = Math.floor(segs / 3600);
    const minutos = Math.floor((segs % 3600) / 60);
    const segundos = segs % 60;

    if (horas > 0) {
        return `${horas}h ${minutos}m ${segundos}s`;
    }
    return `${minutos}m ${segundos}s`;
};

const obtenerTiempoTotalAsignacion = (ticket: TicketSoporte) => {
    if (ticket.segundos_desde_asignacion !== undefined && ticket.segundos_desde_asignacion !== null) {
        return formatearSegundos(Number(ticket.segundos_desde_asignacion));
    }
    if (ticket.fecha_asignacion && ticket.fecha_finalizacion) {
        const segs = Math.floor((new Date(ticket.fecha_finalizacion).getTime() - new Date(ticket.fecha_asignacion).getTime()) / 1000);
        return formatearSegundos(segs);
    }
    return ticket.tiempo_resolucion || 'No registrado';
};

const obtenerTiempoEfectivoTrabajo = (ticket: TicketSoporte) => {
    if (ticket.segundos_desde_inicio !== undefined && ticket.segundos_desde_inicio !== null) {
        return formatearSegundos(Number(ticket.segundos_desde_inicio));
    }
    if (ticket.fecha_inicio && ticket.fecha_finalizacion) {
        const segs = Math.floor((new Date(ticket.fecha_finalizacion).getTime() - new Date(ticket.fecha_inicio).getTime()) / 1000);
        return formatearSegundos(segs);
    }
    return 'No iniciado';
};

export const CardTicket = ({ ticket, onPress }: Props) => {
    // Extraemos el ID real sin importar cómo venga de la base de datos
    const idReal = ticket.id || ticket.id_solicitud;
    const colorEstado = obtenerColorEstado(ticket.estado);
    const numInsistencias = Number(ticket.cantidad_resolicitudes || 0);
    const tieneInsistencia = numInsistencias > 0 && ticket.estado !== 'FINALIZADA';
    const infoPrioridad = obtenerInfoPrioridad(ticket.prioridad);

    return (
        <TouchableOpacity
            style={[
                styles.card,
                { borderLeftColor: tieneInsistencia ? '#e74c3c' : colorEstado },
                tieneInsistencia && { borderWidth: 1, borderColor: '#f5b7b1', backgroundColor: '#fffdfd' }
            ]}
            onPress={onPress}
        >
            <View style={styles.headerRow}>
                {/* Número de Ticket */}
                <Text style={styles.ticketId}>Ticket #{idReal}</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', flexShrink: 1, marginLeft: 8 }}>
                    {/* Etiqueta de PRIORIDAD (Punto de color nativo + Texto para evitar corte de emoji en Android) */}
                    {infoPrioridad && (
                        <View style={[styles.badge, { backgroundColor: infoPrioridad.bg, borderWidth: 1, borderColor: infoPrioridad.color, flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginBottom: 2 }]}>
                            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: infoPrioridad.dot, marginRight: 5 }} />
                            <Text style={[styles.badgeText, { color: infoPrioridad.color }]}>
                                {infoPrioridad.texto}
                            </Text>
                        </View>
                    )}

                    {/* Etiqueta de INSISTENCIA / RE-SOLICITADO */}
                    {tieneInsistencia && (
                        <View style={[styles.badge, { backgroundColor: '#e74c3c', marginLeft: 4, marginBottom: 2 }]}>
                            <Text style={styles.badgeText}>
                                🔔 INSISTENCIA ({numInsistencias})
                            </Text>
                        </View>
                    )}

                    {/* Etiqueta de Estado */}
                    <View style={[
                        styles.badge,
                        { backgroundColor: colorEstado, marginLeft: 4, marginBottom: 2 }
                    ]}>
                        <Text style={styles.badgeText}>{obtenerTextoEstado(ticket.estado)}</Text>
                    </View>
                </View>
            </View>

            <Text style={styles.title}>Oficina: {ticket.oficina}</Text>
            <Text style={styles.subtitle}>Piso: {ticket.piso}</Text>
            {ticket.estado === 'EN_PROCESO' ? (
                <Text style={[styles.tecnicoText, { color: '#8e44ad' }]}>
                    🛠️ En proceso por: {ticket.nombre_tecnico || 'Técnico asignado'}
                </Text>
            ) : ticket.nombre_tecnico ? (
                <Text style={styles.tecnicoText}>
                    🧑‍🔧 Asignado a: {ticket.nombre_tecnico}
                </Text>
            ) : null}

            {/* HORAS DE ASIGNACIÓN, INICIO DE PROCESO, FINALIZACIÓN Y TIEMPOS EN HISTORIAL (FINALIZADA) */}
            {ticket.estado === 'FINALIZADA' && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee' }}>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
                        📌 <Text style={{ fontWeight: 'bold', color: '#2980b9' }}>Asignado:</Text> {formatearFechaHora(ticket.fecha_asignacion)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
                        ▶️ <Text style={{ fontWeight: 'bold', color: '#8e44ad' }}>En Proceso:</Text> {formatearFechaHora(ticket.fecha_inicio)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
                        ✅ <Text style={{ fontWeight: 'bold', color: '#27ae60' }}>Finalizado:</Text> {formatearFechaHora(ticket.fecha_finalizacion)}
                    </Text>

                    <View style={{ paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f2f2f2' }}>
                        <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
                            ⏱️ <Text style={{ fontWeight: 'bold', color: '#2980b9' }}>1. Tiempo total desde Asignación:</Text>{' '}
                            <Text style={{ fontWeight: 'bold', color: '#333' }}>{obtenerTiempoTotalAsignacion(ticket)}</Text>
                        </Text>
                        <Text style={{ fontSize: 12, color: '#555' }}>
                            🛠️ <Text style={{ fontWeight: 'bold', color: '#8e44ad' }}>2. Tiempo efectivo de trabajo:</Text>{' '}
                            <Text style={{ fontWeight: 'bold', color: '#333' }}>{obtenerTiempoEfectivoTrabajo(ticket)}</Text>
                        </Text>
                    </View>
                </View>
            )}
            {ticket.ultima_reasignacion_motivo ? (
                <Text style={{ fontSize: 12, color: '#d35400', marginTop: 4, fontStyle: 'italic' }}>
                    🔄 Reasignado — Motivo: {ticket.ultima_reasignacion_motivo}
                </Text>
            ) : null}
            {Number(ticket.cantidad_resolicitudes || 0) > 0 && ticket.estado !== 'FINALIZADA' ? (
                <View style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fdecea', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#e74c3c' }}>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#c0392b' }}>
                        ⚠️ Insistencia: El usuario de {ticket.oficina} {ticket.piso ? `(${ticket.piso})` : ''} requiere atención demorada ({ticket.cantidad_resolicitudes})
                    </Text>
                    {ticket.ultima_resolicitud_motivo ? (
                        <Text style={{ fontSize: 12, color: '#922b21', marginTop: 2 }}>
                            Motivo: "{ticket.ultima_resolicitud_motivo}"
                        </Text>
                    ) : null}
                </View>
            ) : null}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#ffffff',
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.primary, // Línea azul lateral para darle estilo
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    ticketId: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
    },
    tecnicoText: {
        fontSize: 13,
        color: '#2980b9',
        fontWeight: '600',
        marginTop: 6,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    }
});