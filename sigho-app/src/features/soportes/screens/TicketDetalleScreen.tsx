import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Modal, Image, Linking, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../../core/theme/theme';
import { AppIcon, NombreIcono } from '../../../core/components/AppIcon';
import { RolBandeja, TicketSoporte } from '../types/soporte.types';
import {
    resolicitarSoporte,
    asignarSoporte,
    reasignarSoporte,
    finalizarSoporte,
    obtenerDetallesSolicitud,
    agregarItemSoporte,
    obtenerTecnicos,
    ponerEnProcesoSoporte,
    reasignarSoporteOperador,
    obtenerActaSolicitud,
    construirUrlArchivo,
    obtenerBandeja
} from '../api/soporte.service';

// Opciones de tipos de soporte para el modal (con iconos vectoriales sin emojis)
const TIPOS_SOPORTE: Array<{ id: number; icono: NombreIcono; titulo: string }> = [
    { id: 1, icono: 'laptop', titulo: 'Equipos físicos' },
    { id: 2, icono: 'gear', titulo: 'Sistema SIGHO' },
    { id: 3, icono: 'globe', titulo: 'Redes e Internet' },
];

// Niveles de prioridad seleccionables por el Operador (usamos puntos de color View nativos para evitar el bug de recorte de emojis 🟠🟢 en fuentes personalizadas de Android)
const NIVELES_PRIORIDAD = [
    { valor: 'URGENTE', etiqueta: 'Urgente', dot: '#e74c3c', color: '#c0392b', bg: '#fdecea' },
    { valor: 'ALTA', etiqueta: 'Alta', dot: '#e67e22', color: '#d35400', bg: '#fef5e7' },
    { valor: 'NORMAL', etiqueta: 'Normal', dot: '#2ecc71', color: '#27ae60', bg: '#eafaf1' },
    { valor: 'BAJA', etiqueta: 'Baja', dot: '#3498db', color: '#2980b9', bg: '#ebf5fb' },
];

const formatearFechaHora = (fechaIso?: string) => {
    if (!fechaIso) return 'No registrada';
    const d = new Date(fechaIso);
    if (isNaN(d.getTime())) return 'No registrada';
    const fecha = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${fecha} — ${hora}`;
};

// Función auxiliar para mostrar el texto e icono en lugar del ID numérico
const obtenerInfoTipoSoporte = (idTipo: number | string): { icono: NombreIcono; nombre: string } => {
    const id = Number(idTipo);
    if (id === 1) return { icono: 'laptop', nombre: 'Equipos físicos' };
    if (id === 2) return { icono: 'gear', nombre: 'Sistema SIGHO' };
    if (id === 3) return { icono: 'globe', nombre: 'Redes e Internet' };
    return { icono: 'wrench', nombre: 'Otro' };
};

// Función auxiliar para formatear segundos en "Xh Ym Zs" o "Ym Zs"
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

export const TicketDetalleScreen = ({ route, navigation }: any) => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const esEscritorio = Platform.OS === 'web' && width > 768;
    const paddingInferiorSeguro = Platform.OS === 'web' ? 40 : Math.max(insets.bottom, 48) + 32;

    const { ticket: ticketInicial, rolUsuario } = route.params as { ticket: TicketSoporte, rolUsuario: RolBandeja };
    const [ticket, setTicket] = useState<TicketSoporte>(ticketInicial);
    const idReal = (ticket.id || ticket.id_solicitud) as number; // Usamos el ID seguro

    const [estadoActual, setEstadoActual] = useState<string>(ticket.estado);

    const [cargando, setCargando] = useState(false);
    const [cargandoItems, setCargandoItems] = useState(true);
    const [itemsProblema, setItemsProblema] = useState<any[]>([]);

    const [observacion, setObservacion] = useState('');
    const [justificacionReasignacion, setJustificacionReasignacion] = useState('');
    const [diagnostico, setDiagnostico] = useState('');

    const [tecnicos, setTecnicos] = useState<any[]>([]);
    // idTecnico cambiará a número en lugar de string vacío
    const [idTecnico, setIdTecnico] = useState<number | null>(null);
    const [prioridad, setPrioridad] = useState<string>(
        ticketInicial.prioridad ? ticketInicial.prioridad.toUpperCase() : 'NORMAL'
    );

    const [modalVisible, setModalVisible] = useState(false);
    const [nuevoTipoSoporte, setNuevoTipoSoporte] = useState<number>(1);
    const [nuevaDescripcion, setNuevaDescripcion] = useState('');
    const [guardandoItem, setGuardandoItem] = useState(false);

    // ESTADOS DEL TÉCNICO: 2 Cronómetros (Desde Asignación y Desde Inicio En Proceso), Derivación y Acta
    const [tiempoDesdeAsignacion, setTiempoDesdeAsignacion] = useState<string>('Calculando...');
    const [tiempoEnProceso, setTiempoEnProceso] = useState<string>('No iniciado');
    const [baseSegundosInicio, setBaseSegundosInicio] = useState<number | null>(
        ticket.segundos_desde_inicio !== undefined && ticket.segundos_desde_inicio !== null
            ? Number(ticket.segundos_desde_inicio)
            : null
    );
    const [timestampInicioLocal, setTimestampInicioLocal] = useState<number>(() => Date.now());
    const [modalReasignarVisible, setModalReasignarVisible] = useState(false);
    const [idNuevoTecnico, setIdNuevoTecnico] = useState<number | null>(null);
    const [motivoDerivacion, setMotivoDerivacion] = useState('');
    const [guardandoReasignacion, setGuardandoReasignacion] = useState(false);
    const [archivoActaUri, setArchivoActaUri] = useState<string | null>(null);
    const [nombreArchivoActa, setNombreArchivoActa] = useState<string>('');

    // ESTADO PARA VER EL ACTA SUBIDA (administracion.soporte_archivos_actas)
    const [rutaActaGuardada, setRutaActaGuardada] = useState<string | null>(ticket.url_acta || null);
    const [nombreActaGuardada, setNombreActaGuardada] = useState<string>(ticket.nombre_archivo_acta || '');
    const [tipoMimeActaGuardada, setTipoMimeActaGuardada] = useState<string>(ticket.tipo_mime_acta || '');
    const [modalVerActaVisible, setModalVerActaVisible] = useState<boolean>(false);

    // CARGAMOS LOS DETALLES DEL TICKET Y TÉCNICOS AL ENTRAR A LA PANTALLA + SINCRONIZACIÓN EN TIEMPO REAL
    useEffect(() => {
        const cargarDatos = async () => {
            if (idReal) {
                const items = await obtenerDetallesSolicitud(idReal);
                setItemsProblema(items);

                // Si el soporte está finalizado, consultamos soporte_archivos_actas para asegurar tener ruta_url
                if (estadoActual === 'FINALIZADA') {
                    const acta = await obtenerActaSolicitud(idReal);
                    if (acta && acta.ruta_url) {
                        setRutaActaGuardada(acta.ruta_url);
                        setNombreActaGuardada(acta.nombre_archivo || '');
                        setTipoMimeActaGuardada(acta.tipo_mime || '');
                    }
                }
            }
            // Cargar lista de técnicos tanto para OPERADOR como para TÉCNICO (para poder derivar)
            if (rolUsuario === RolBandeja.OPERADOR || rolUsuario === RolBandeja.TECNICO) {
                const listaTecnicos = await obtenerTecnicos();
                setTecnicos(listaTecnicos);
            }
            setCargandoItems(false);
        };
        cargarDatos();

        // Sincronización automática en segundo plano cada 4 segundos mientras el soporte no haya concluido
        const intervaloSync = setInterval(async () => {
            try {
                if (!idReal) return;

                // 1. Refrescar ítems del problema por si el usuario añadió uno nuevo
                const itemsActualizados = await obtenerDetallesSolicitud(idReal);
                if (Array.isArray(itemsActualizados)) {
                    setItemsProblema(itemsActualizados);
                }

                // 2. Refrescar el estado y datos del ticket desde la bandeja del rol actual
                const respuestaBandeja = await obtenerBandeja({ rol: rolUsuario });
                const lista = respuestaBandeja?.data || respuestaBandeja?.datos || respuestaBandeja || [];
                if (Array.isArray(lista)) {
                    const encontrado = lista.find(
                        (t: any) => Number(t.id_solicitud || t.id) === Number(idReal)
                    );
                    if (encontrado) {
                        setTicket((prev) => ({ ...prev, ...encontrado }));
                        if (encontrado.estado && encontrado.estado !== estadoActual) {
                            setEstadoActual(encontrado.estado);
                        }
                        if (
                            encontrado.segundos_desde_inicio !== undefined &&
                            encontrado.segundos_desde_inicio !== null &&
                            baseSegundosInicio === null
                        ) {
                            setTimestampInicioLocal(Date.now());
                            setBaseSegundosInicio(Number(encontrado.segundos_desde_inicio));
                        }
                        if (encontrado.url_acta) {
                            setRutaActaGuardada(encontrado.url_acta);
                        }
                    }
                }
            } catch (_e) {
                // Ignoramos errores silenciosos de red durante el polling
            }
        }, 4000);

        return () => clearInterval(intervaloSync);
    }, [idReal, rolUsuario, estadoActual, baseSegundosInicio]);

    // 2 CRONÓMETROS EN TIEMPO REAL (1: Desde fecha_asignacion | 2: Desde fecha_inicio)
    // Ambos corren en tiempo real y SOLO se detienen cuando el soporte está en FINALIZADA
    useEffect(() => {
        const montoPantallaMs = Date.now();
        const segAsignacionBase =
            ticket.segundos_desde_asignacion !== undefined && ticket.segundos_desde_asignacion !== null
                ? Number(ticket.segundos_desde_asignacion)
                : ticket.fecha_asignacion
                    ? Math.max(0, Math.floor((Date.now() - new Date(ticket.fecha_asignacion).getTime()) / 1000))
                    : null;

        if (estadoActual === 'FINALIZADA') {
            if (segAsignacionBase !== null) {
                setTiempoDesdeAsignacion(formatearSegundos(segAsignacionBase));
            } else if (ticket.tiempo_resolucion) {
                setTiempoDesdeAsignacion(ticket.tiempo_resolucion);
            }
            if (baseSegundosInicio !== null) {
                setTiempoEnProceso(formatearSegundos(baseSegundosInicio));
            }
            return;
        }

        const actualizarRelojes = () => {
            const ahora = Date.now();
            const deltaSegundos = Math.floor((ahora - montoPantallaMs) / 1000);

            // Reloj 1: Desde que fue asignado (nunca se detiene al poner En Proceso, solo al finalizar)
            if (segAsignacionBase !== null) {
                setTiempoDesdeAsignacion(formatearSegundos(segAsignacionBase + deltaSegundos));
            } else {
                setTiempoDesdeAsignacion('Sin asignación');
            }

            // Reloj 2: Desde que el técnico puso En Proceso (fecha_inicio)
            if (baseSegundosInicio !== null) {
                const deltaInicio = Math.floor((ahora - timestampInicioLocal) / 1000);
                setTiempoEnProceso(formatearSegundos(baseSegundosInicio + deltaInicio));
            } else if (ticket.fecha_inicio) {
                const segs = Math.max(0, Math.floor((ahora - new Date(ticket.fecha_inicio).getTime()) / 1000));
                setTiempoEnProceso(formatearSegundos(segs));
            } else {
                setTiempoEnProceso('Aún no iniciado');
            }
        };

        actualizarRelojes();
        const intervalo = setInterval(actualizarRelojes, 1000);
        return () => clearInterval(intervalo);
    }, [ticket.fecha_asignacion, ticket.fecha_inicio, ticket.segundos_desde_asignacion, estadoActual, baseSegundosInicio, timestampInicioLocal]);

    const handleAgregarItem = async () => {
        if (!nuevaDescripcion.trim()) {
            return Alert.alert('Error', 'Debes describir el problema.');
        }

        setGuardandoItem(true);
        try {
            await agregarItemSoporte(idReal, {
                id_tipo_soporte: nuevoTipoSoporte,
                descripcion: nuevaDescripcion.trim()
            });

            Alert.alert('Éxito', 'Se añadió el problema a tu ticket.');
            setModalVisible(false);
            setNuevaDescripcion('');

            // Recargamos la lista de problemas para que aparezca el nuevo
            setCargandoItems(true);
            const itemsRefresh = await obtenerDetallesSolicitud(idReal);
            setItemsProblema(itemsRefresh);
            setCargandoItems(false);

        } catch (error) {
            Alert.alert('Error', 'No se pudo añadir el problema.');
        } finally {
            setGuardandoItem(false);
        }
    };

    const handleResolicitar = async () => {
        setCargando(true);
        try {
            await resolicitarSoporte(idReal, observacion);
            setObservacion('');
            // Volvemos inmediatamente a la pantalla principal (Bandeja)
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al resolicitar soporte:', error);
            Alert.alert('Error', 'No se pudo enviar la solicitud de insistencia.');
        } finally {
            setCargando(false);
        }
    };

    const handleAsignar = async () => {
        if (!idTecnico) {
            Alert.alert('Atención', 'Por favor selecciona un técnico disponible.');
            return;
        }

        setCargando(true);
        try {
            await asignarSoporte(Number(idReal), Number(idTecnico), prioridad);
            Alert.alert('Éxito', `El ticket ha sido asignado al técnico con prioridad ${prioridad}.`);
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al asignar técnico:', error);
            Alert.alert('Error', 'No se pudo asignar el técnico al ticket.');
        } finally {
            setCargando(false);
        }
    };

    const handleReasignarOperador = async () => {
        if (!idTecnico) {
            Alert.alert('Atención', 'Por favor selecciona al nuevo técnico.');
            return;
        }
        if (!justificacionReasignacion.trim()) {
            Alert.alert('Atención', 'Debes escribir el motivo por el cual estás seleccionando al nuevo técnico.');
            return;
        }

        setCargando(true);
        try {
            await reasignarSoporteOperador(Number(idReal), Number(idTecnico), justificacionReasignacion.trim(), prioridad);
            Alert.alert('Éxito', 'El ticket fue reasignado al nuevo técnico correctamente.');
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al reasignar técnico:', error);
            const msg = error?.response?.data?.message || 'No se pudo reasignar el técnico.';
            Alert.alert('Error', msg);
        } finally {
            setCargando(false);
        }
    };

    const handlePonerEnProceso = async () => {
        setCargando(true);
        try {
            await ponerEnProcesoSoporte(Number(idReal));
            // Actualizamos en vivo en la pantalla sin detener el primer cronómetro y arrancando el segundo desde 0m 0s
            setEstadoActual('EN_PROCESO');
            setTimestampInicioLocal(Date.now());
            setBaseSegundosInicio(0);
            Alert.alert('En Proceso', 'Has iniciado la atención del soporte. El segundo cronómetro ha comenzado a correr y ambos se detendrán únicamente al finalizar.');
        } catch (error: any) {
            console.error('Error al poner en proceso:', error);
            Alert.alert('Error', 'No se pudo cambiar el estado a En Proceso.');
        } finally {
            setCargando(false);
        }
    };

    // TÉCNICO: Derivar soporte a otro técnico con justificación obligatoria
    const handleDerivarTecnico = async () => {
        if (!idNuevoTecnico) {
            Alert.alert('Atención', 'Debes seleccionar al técnico al que deseas derivar el soporte.');
            return;
        }
        if (!motivoDerivacion.trim()) {
            Alert.alert('Atención', 'La justificación de la reasignación es obligatoria.');
            return;
        }
        const idAsignacion = ticket.id_asignacion;
        if (!idAsignacion) {
            Alert.alert('Error', 'No se encontró el identificador de asignación de este ticket.');
            return;
        }

        setGuardandoReasignacion(true);
        try {
            await reasignarSoporte(Number(idAsignacion), Number(idNuevoTecnico), motivoDerivacion.trim());
            setModalReasignarVisible(false);
            setMotivoDerivacion('');
            Alert.alert('Soporte Derivado', 'El soporte ha sido derivado exitosamente al otro técnico.');
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al derivar soporte:', error);
            const msg = error?.response?.data?.message || 'No se pudo derivar el soporte.';
            Alert.alert('Error', msg);
        } finally {
            setGuardandoReasignacion(false);
        }
    };

    // TÉCNICO: Seleccionar imagen/foto del acta
    const handleSeleccionarActa = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            setArchivoActaUri(asset.uri);
            setNombreArchivoActa(asset.fileName || 'acta_soporte.jpg');
        }
    };

    // TÉCNICO: Subir acta y finalizar soporte
    const handleFinalizar = async () => {
        if (!archivoActaUri) {
            Alert.alert('Acta requerida', 'Debes adjuntar la imagen/foto del Acta de Soporte para poder finalizar.');
            return;
        }
        if (!diagnostico.trim()) {
            Alert.alert('Diagnóstico requerido', 'Debes escribir el diagnóstico u observación del trabajo realizado antes de finalizar.');
            return;
        }
        const idAsignacion = ticket.id_asignacion;
        if (!idAsignacion) {
            Alert.alert('Error', 'No se encontró el ID de asignación de este soporte.');
            return;
        }

        setCargando(true);
        try {
            await finalizarSoporte(Number(idAsignacion), archivoActaUri, diagnostico.trim());
            Alert.alert('¡Soporte Finalizado!', 'El acta y el registro del soporte se guardaron correctamente.');
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al finalizar soporte:', error);
            const msg = error?.response?.data?.message || 'No se pudo finalizar el soporte.';
            Alert.alert('Error', msg);
        } finally {
            setCargando(false);
        }
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={esEscritorio ? { width: '100%', maxWidth: 820, alignSelf: 'center', paddingBottom: 40 } : { paddingBottom: paddingInferiorSeguro }}
        >
            {/* CABECERA DEL TICKET */}
            <View style={styles.cardHeader}>
                <Text style={styles.title}>Ticket #{idReal}</Text>
                <Text style={styles.subtitle}>Oficina: {ticket.oficina} | Piso: {ticket.piso}</Text>
                <Text style={[
                    styles.status,
                    {
                        color: estadoActual === 'FINALIZADA'
                            ? '#27ae60'
                            : estadoActual === 'EN_PROCESO'
                                ? '#8e44ad'
                                : estadoActual === 'ASIGNADA'
                                    ? '#3498db'
                                    : '#f39c12'
                    }
                ]}>
                    Estado actual: {estadoActual === 'EN_PROCESO' ? 'EN PROCESO' : estadoActual}
                </Text>
                {Boolean(ticket.prioridad) && (() => {
                    const pUpper = (ticket.prioridad || 'NORMAL').toUpperCase();
                    const pInfo = NIVELES_PRIORIDAD.find((item) => item.valor === pUpper) || NIVELES_PRIORIDAD[2];
                    return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#555', marginRight: 6 }}>
                                Nivel de Prioridad:
                            </Text>
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: pInfo.bg,
                                borderWidth: 1,
                                borderColor: pInfo.color,
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 4,
                            }}>
                                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: pInfo.dot, marginRight: 5 }} />
                                <Text style={{ fontWeight: 'bold', fontSize: 12, color: pInfo.color }}>
                                    {pInfo.valor}
                                </Text>
                            </View>
                        </View>
                    );
                })()}
                {estadoActual === 'EN_PROCESO' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <AppIcon name="wrench" size={15} color="#8e44ad" />
                        <Text style={{ marginLeft: 6, color: '#8e44ad', fontWeight: 'bold', fontSize: 14 }}>
                            En proceso por el técnico: {ticket.nombre_tecnico || 'Técnico asignado'}
                        </Text>
                    </View>
                )}
                {ticket.ultima_reasignacion_motivo && (
                    <View style={{ marginTop: 10, padding: 10, backgroundColor: '#fff8e1', borderRadius: 6, borderLeftWidth: 4, borderLeftColor: '#f39c12' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <AppIcon name="refresh" size={14} color="#d35400" />
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#d35400', marginLeft: 6 }}>
                                Ticket Reasignado / Derivado
                            </Text>
                        </View>
                        <Text style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                            Motivo: {ticket.ultima_reasignacion_motivo}
                        </Text>
                    </View>
                )}
                {Number(ticket.cantidad_resolicitudes || 0) > 0 && estadoActual !== 'FINALIZADA' && (
                    <View style={{ marginTop: 10, padding: 10, backgroundColor: '#fdecea', borderRadius: 6, borderLeftWidth: 4, borderLeftColor: '#e74c3c' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <AppIcon name="alert" size={14} color="#c0392b" />
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#c0392b', marginLeft: 6, flex: 1 }}>
                                Insistencia: El usuario de {ticket.oficina} {ticket.piso ? `(${ticket.piso})` : ''} requiere atención demorada
                            </Text>
                        </View>
                        {ticket.ultima_resolicitud_motivo && (
                            <Text style={{ fontSize: 13, color: '#922b21', marginTop: 2 }}>
                                Mensaje del usuario: "{ticket.ultima_resolicitud_motivo}"
                            </Text>
                        )}
                    </View>
                )}
            </View>

            {/* NUEVA SECCIÓN: DETALLES DEL PROBLEMA */}
            <View style={styles.itemsSection}>
                <Text style={styles.sectionTitle}>Problemas Reportados</Text>

                {cargandoItems ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 10 }} />
                ) : itemsProblema.length > 0 ? (
                    itemsProblema.map((item, index) => {
                        const infoTipo = obtenerInfoTipoSoporte(item.id_tipo_soporte);
                        return (
                            <View key={index} style={styles.itemBox}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <AppIcon name={infoTipo.icono} size={17} color="#164a96" />
                                    <Text style={[styles.itemType, { marginBottom: 0, marginLeft: 7 }]}>{infoTipo.nombre}</Text>
                                </View>
                                <Text style={styles.itemDesc}>{item.descripcion}</Text>
                            </View>
                        );
                    })
                ) : (
                    <Text style={styles.emptyItemsText}>No se pudieron cargar los detalles del problema.</Text>
                )}
            </View>

            {/* 1. Vista de USUARIO */}
            {rolUsuario === RolBandeja.USUARIO && ticket.estado !== 'FINALIZADA' && (
                <View style={styles.actionSection}>
                    <Text style={styles.sectionTitle}>¿Atención demorada?</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Escribe el motivo de tu insistencia (opcional)..."
                        value={observacion}
                        onChangeText={setObservacion}
                        multiline
                    />

                    <TouchableOpacity style={[styles.button, { backgroundColor: '#e67e22', flexDirection: 'row', justifyContent: 'center', gap: 8 }]} onPress={handleResolicitar} disabled={cargando}>
                        {cargando ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <AppIcon name="bell" size={17} color="#ffffff" />
                                <Text style={styles.buttonText}>Re-solicitar / Insistir</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {/* BOTÓN QUE ABRE EL MODAL */}
                    <TouchableOpacity
                        style={styles.addMoreButton}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text style={styles.addMoreButtonText}>+ Añadir otro problema a esta solicitud</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* 2A. Vista de OPERADOR: Primera asignación (Ticket PENDIENTE) */}
            {rolUsuario === RolBandeja.OPERADOR && ticket.estado === 'PENDIENTE' && (
                <View style={styles.actionSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <AppIcon name="user" size={18} color="#333" />
                        <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 7 }]}>Asignar a Técnico</Text>
                    </View>

                    <Text style={styles.label}>Selecciona el nivel de prioridad:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
                        {NIVELES_PRIORIDAD.map((p) => {
                            const activo = prioridad === p.valor;
                            return (
                                <TouchableOpacity
                                    key={p.valor}
                                    style={{
                                        width: '48.5%',
                                        marginBottom: 8,
                                        paddingVertical: 10,
                                        paddingHorizontal: 10,
                                        borderRadius: 6,
                                        borderWidth: activo ? 2 : 1,
                                        borderColor: activo ? p.color : '#ddd',
                                        backgroundColor: activo ? p.bg : '#f9f9f9',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onPress={() => setPrioridad(p.valor)}
                                >
                                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.dot, marginRight: 7 }} />
                                    <Text style={{
                                        fontWeight: 'bold',
                                        fontSize: 14,
                                        color: activo ? p.color : '#444',
                                    }}>
                                        {p.etiqueta}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Selecciona el técnico disponible:</Text>

                    {tecnicos.length === 0 ? (
                        <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                        <View style={{ marginBottom: 16 }}>
                            {tecnicos.map(tec => (
                                <TouchableOpacity
                                    key={tec.id}
                                    style={[
                                        styles.itemBox,
                                        { flexDirection: 'row', alignItems: 'center' },
                                        idTecnico === tec.id && { borderColor: theme.colors.primary, backgroundColor: '#eef2f9' }
                                    ]}
                                    onPress={() => setIdTecnico(tec.id)}
                                >
                                    <AppIcon name="user" size={16} color={idTecnico === tec.id ? theme.colors.primary : '#333'} />
                                    <Text style={{ fontWeight: 'bold', color: idTecnico === tec.id ? theme.colors.primary : '#333', marginLeft: 8 }}>
                                        {tec.nombre}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: theme.colors.primary, opacity: idTecnico ? 1 : 0.5, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                        onPress={handleAsignar}
                        disabled={cargando || !idTecnico}
                    >
                        {cargando ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>Asignar Ticket</Text>
                                <AppIcon name="arrow-right" size={18} color="#ffffff" />
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* 2B. Vista de OPERADOR: Reasignar Técnico (Ticket ASIGNADA pero aún no EN_PROCESO) */}
            {rolUsuario === RolBandeja.OPERADOR && ticket.estado === 'ASIGNADA' && (
                <View style={styles.actionSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <AppIcon name="refresh" size={18} color="#333" />
                        <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 7 }]}>Reasignar a otro Técnico</Text>
                    </View>

                    <View style={[styles.itemBox, { backgroundColor: '#eef7fc', borderColor: '#3498db', marginBottom: 14 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <AppIcon name="user" size={15} color="#2980b9" />
                            <Text style={{ fontSize: 13, color: '#2980b9', fontWeight: 'bold', marginLeft: 6 }}>
                                Técnico asignado actualmente: {ticket.nombre_tecnico || 'Técnico'}
                            </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                            El técnico aún no ha puesto el soporte en proceso. Si necesitas cambiarlo, indica el motivo y selecciona al nuevo técnico:
                        </Text>
                    </View>

                    <Text style={styles.label}>1. Motivo por el que se cambia de técnico *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Escribe por qué se está seleccionando al nuevo técnico..."
                        value={justificacionReasignacion}
                        onChangeText={setJustificacionReasignacion}
                        multiline
                    />

                    <Text style={styles.label}>2. Nivel de prioridad del soporte:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
                        {NIVELES_PRIORIDAD.map((p) => {
                            const activo = prioridad === p.valor;
                            return (
                                <TouchableOpacity
                                    key={p.valor}
                                    style={{
                                        width: '48.5%',
                                        marginBottom: 8,
                                        paddingVertical: 10,
                                        paddingHorizontal: 10,
                                        borderRadius: 6,
                                        borderWidth: activo ? 2 : 1,
                                        borderColor: activo ? p.color : '#ddd',
                                        backgroundColor: activo ? p.bg : '#f9f9f9',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onPress={() => setPrioridad(p.valor)}
                                >
                                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.dot, marginRight: 7 }} />
                                    <Text style={{
                                        fontWeight: 'bold',
                                        fontSize: 14,
                                        color: activo ? p.color : '#444',
                                    }}>
                                        {p.etiqueta}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>3. Selecciona al nuevo técnico disponible:</Text>
                    {tecnicos.length === 0 ? (
                        <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                        <View style={{ marginBottom: 16 }}>
                            {tecnicos.map(tec => {
                                const esActual = (ticket.id_tecnico && Number(tec.id) === Number(ticket.id_tecnico)) ||
                                    (ticket.nombre_tecnico && tec.nombre === ticket.nombre_tecnico);
                                return (
                                    <TouchableOpacity
                                        key={tec.id}
                                        disabled={Boolean(esActual)}
                                        style={[
                                            styles.itemBox,
                                            { flexDirection: 'row', alignItems: 'center' },
                                            esActual && { opacity: 0.5, backgroundColor: '#eee' },
                                            idTecnico === tec.id && { borderColor: theme.colors.primary, backgroundColor: '#eef2f9' }
                                        ]}
                                        onPress={() => setIdTecnico(tec.id)}
                                    >
                                        <AppIcon name="user" size={16} color={idTecnico === tec.id ? theme.colors.primary : '#333'} />
                                        <Text style={{ fontWeight: 'bold', color: idTecnico === tec.id ? theme.colors.primary : '#333', marginLeft: 8 }}>
                                            {tec.nombre} {esActual ? '(Asignado actualmente)' : ''}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    <TouchableOpacity
                        style={[
                            styles.button,
                            {
                                backgroundColor: '#e67e22',
                                opacity: idTecnico && justificacionReasignacion.trim() ? 1 : 0.5,
                                flexDirection: 'row',
                                justifyContent: 'center',
                                gap: 8,
                            }
                        ]}
                        onPress={handleReasignarOperador}
                        disabled={cargando || !idTecnico || !justificacionReasignacion.trim()}
                    >
                        {cargando ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <AppIcon name="refresh" size={17} color="#ffffff" />
                                <Text style={styles.buttonText}>Confirmar Reasignación</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* 2C. Vista de OPERADOR: Bloqueado cuando el técnico ya puso el soporte EN_PROCESO */}
            {rolUsuario === RolBandeja.OPERADOR && ticket.estado === 'EN_PROCESO' && (
                <View style={[styles.actionSection, { borderLeftWidth: 4, borderLeftColor: '#8e44ad' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <AppIcon name="wrench" size={18} color="#8e44ad" />
                        <Text style={[styles.sectionTitle, { color: '#8e44ad', marginBottom: 0, marginLeft: 7 }]}>Soporte En Proceso</Text>
                    </View>
                    <Text style={{ color: '#444', fontSize: 14, lineHeight: 20 }}>
                        Este soporte está siendo atendido actualmente por el técnico{' '}
                        <Text style={{ fontWeight: 'bold', color: '#8e44ad' }}>
                            {ticket.nombre_tecnico || 'asignado'}
                        </Text>
                        . No es posible reasignarlo a otro técnico mientras se encuentra en proceso.
                    </Text>
                </View>
            )}

            {/* NUEVO: VISTA DE HISTORIAL PARA OPERADOR Y TÉCNICO (Tickets Concluidos) */}
            {(rolUsuario === RolBandeja.OPERADOR || rolUsuario === RolBandeja.TECNICO) && estadoActual === 'FINALIZADA' && (
                <View style={styles.actionSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <AppIcon name="clipboard" size={18} color="#333" />
                        <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 7 }]}>Acta de Soporte (Historial Concluido)</Text>
                    </View>

                    <View style={styles.itemBox}>
                        <Text style={styles.label}>Técnico Asignado:</Text>
                        <Text style={{ marginBottom: 10, color: '#333', fontWeight: 'bold' }}>{ticket.nombre_tecnico || 'Técnico'}</Text>

                        <Text style={styles.label}>Hora de Asignación:</Text>
                        <Text style={{ marginBottom: 10, color: '#2980b9', fontWeight: 'bold' }}>{formatearFechaHora(ticket.fecha_asignacion)}</Text>

                        <Text style={styles.label}>Hora de Inicio En Proceso:</Text>
                        <Text style={{ marginBottom: 10, color: '#8e44ad', fontWeight: 'bold' }}>{formatearFechaHora(ticket.fecha_inicio)}</Text>

                        <Text style={styles.label}>Hora de Finalización:</Text>
                        <Text style={{ marginBottom: 10, color: '#27ae60', fontWeight: 'bold' }}>{formatearFechaHora(ticket.fecha_finalizacion)}</Text>

                        <Text style={styles.label}>1. Tiempo total desde Asignación:</Text>
                        <Text style={{ marginBottom: 10, color: '#2980b9', fontWeight: 'bold' }}>{tiempoDesdeAsignacion}</Text>

                        <Text style={styles.label}>2. Tiempo efectivo de trabajo:</Text>
                        <Text style={{ marginBottom: 10, color: '#8e44ad', fontWeight: 'bold' }}>{tiempoEnProceso}</Text>

                        <Text style={styles.label}>Diagnóstico / Solución:</Text>
                        <Text style={{ marginBottom: 10, color: '#333' }}>{ticket.diagnostico || 'Sin detalles registrados'}</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: '#27ae60', marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                        onPress={async () => {
                            let ruta = rutaActaGuardada || ticket.url_acta || null;
                            if (!ruta && idReal) {
                                const acta = await obtenerActaSolicitud(idReal);
                                if (acta?.ruta_url) {
                                    ruta = acta.ruta_url;
                                    setRutaActaGuardada(acta.ruta_url);
                                    setNombreActaGuardada(acta.nombre_archivo || '');
                                    setTipoMimeActaGuardada(acta.tipo_mime || '');
                                }
                            }
                            const urlCompleta = construirUrlArchivo(ruta);
                            if (!urlCompleta) {
                                Alert.alert('Sin archivo adjunto', 'No se encontró un archivo de acta registrado para este soporte.');
                                return;
                            }
                            const esPdf = (tipoMimeActaGuardada && tipoMimeActaGuardada.toLowerCase().includes('pdf')) ||
                                urlCompleta.toLowerCase().endsWith('.pdf');
                            if (esPdf) {
                                Linking.openURL(urlCompleta);
                            } else {
                                setModalVerActaVisible(true);
                            }
                        }}
                    >
                        <AppIcon name="document" size={17} color="#ffffff" />
                        <Text style={styles.buttonText}>Ver Acta Adjunta</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* 3. Vista de TÉCNICO */}
            {rolUsuario === RolBandeja.TECNICO && estadoActual !== 'FINALIZADA' && (
                <View style={styles.actionSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <AppIcon name="clock" size={18} color="#333" />
                        <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 7 }]}>Tiempos del Soporte (En Vivo)</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                        {/* CRONÓMETRO 1: Desde fecha_asignacion */}
                        <View style={[styles.itemBox, { flex: 1, backgroundColor: '#eef7fc', borderColor: '#3498db', alignItems: 'center', marginBottom: 0 }]}>
                            <Text style={{ fontSize: 12, color: '#2980b9', textAlign: 'center', fontWeight: '600' }}>
                                1. Desde Asignación
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                <AppIcon name="clock" size={16} color="#2980b9" />
                                <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#2980b9', marginLeft: 5 }}>
                                    {tiempoDesdeAsignacion}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 10, color: '#666', marginTop: 2, textAlign: 'center' }}>
                                (fecha_asignacion)
                            </Text>
                        </View>

                        {/* CRONÓMETRO 2: Desde fecha_inicio */}
                        <View style={[styles.itemBox, { flex: 1, backgroundColor: '#f5eef8', borderColor: '#8e44ad', alignItems: 'center', marginBottom: 0 }]}>
                            <Text style={{ fontSize: 12, color: '#8e44ad', textAlign: 'center', fontWeight: '600' }}>
                                2. En Proceso (Trabajo)
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                <AppIcon name="wrench" size={16} color="#8e44ad" />
                                <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#8e44ad', marginLeft: 5 }}>
                                    {tiempoEnProceso}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 10, color: '#666', marginTop: 2, textAlign: 'center' }}>
                                (fecha_inicio)
                            </Text>
                        </View>
                    </View>

                    {/* Botón para Poner EN PROCESO si aún está en ASIGNADA */}
                    {estadoActual === 'ASIGNADA' ? (
                        <View style={{ marginBottom: 18 }}>
                            <Text style={{ color: '#555', marginBottom: 10, lineHeight: 20 }}>
                                Presiona <Text style={{ fontWeight: 'bold' }}>Poner En Proceso</Text> para iniciar el 2do cronómetro (<Text style={{ fontWeight: 'bold' }}>fecha_inicio</Text>) y bloquear reasignaciones del operador:
                            </Text>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: '#8e44ad', flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                                onPress={handlePonerEnProceso}
                                disabled={cargando}
                            >
                                {cargando ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <AppIcon name="play" size={16} color="#ffffff" />
                                        <Text style={styles.buttonText}>Poner En Proceso (Iniciar Soporte)</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={[styles.itemBox, { borderLeftWidth: 4, borderLeftColor: '#8e44ad', marginBottom: 18 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <AppIcon name="wrench" size={16} color="#8e44ad" />
                                <Text style={{ fontWeight: 'bold', color: '#8e44ad', marginLeft: 6 }}>Soporte actualmente En Proceso</Text>
                            </View>
                            <Text style={{ color: '#555', fontSize: 13, marginTop: 4 }}>
                                Ambos cronómetros están corriendo y solo se detendrán cuando subas el acta y finalices el soporte.
                            </Text>
                        </View>
                    )}

                    {/* SECCIÓN PARA FINALIZAR SOPORTE Y SUBIR ACTA */}
                    <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <AppIcon name="check" size={18} color="#27ae60" />
                            <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 7 }]}>Finalizar Soporte y Subir Acta</Text>
                        </View>

                        <Text style={styles.label}>1. Acta de Soporte (Imagen / Foto) *</Text>
                        <TouchableOpacity
                            style={[
                                styles.addMoreButton,
                                { marginTop: 4, marginBottom: 12, borderStyle: 'dashed', backgroundColor: archivoActaUri ? '#eafaf1' : '#f9f9f9', borderColor: archivoActaUri ? '#27ae60' : theme.colors.primary, flexDirection: 'row', justifyContent: 'center', gap: 8 }
                            ]}
                            onPress={handleSeleccionarActa}
                        >
                            <AppIcon name={archivoActaUri ? 'check' : 'camera'} size={17} color={archivoActaUri ? '#27ae60' : theme.colors.primary} />
                            <Text style={{ color: archivoActaUri ? '#27ae60' : theme.colors.primary, fontWeight: 'bold' }}>
                                {archivoActaUri ? `Acta seleccionada: ${nombreArchivoActa}` : 'Seleccionar Foto / Imagen del Acta'}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.label}>2. Diagnóstico / Observación *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Describe obligatoriamente qué trabajo o diagnóstico se realizó..."
                            value={diagnostico}
                            onChangeText={setDiagnostico}
                            multiline
                        />

                        <TouchableOpacity
                            style={[
                                styles.button,
                                {
                                    backgroundColor: '#27ae60',
                                    opacity: archivoActaUri && diagnostico.trim() ? 1 : 0.5,
                                    flexDirection: 'row',
                                    justifyContent: 'center',
                                    gap: 8,
                                }
                            ]}
                            onPress={handleFinalizar}
                            disabled={cargando || !archivoActaUri || !diagnostico.trim()}
                        >
                            {cargando ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <AppIcon name="check" size={18} color="#ffffff" />
                                    <Text style={styles.buttonText}>Subir Acta y Finalizar Soporte</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* BOTÓN PARA DERIVAR A OTRO TÉCNICO */}
                    <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, marginTop: 20 }}>
                        <TouchableOpacity
                            style={[styles.addMoreButton, { borderColor: '#e67e22', marginTop: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                            onPress={() => setModalReasignarVisible(true)}
                        >
                            <AppIcon name="refresh" size={16} color="#e67e22" />
                            <Text style={[styles.addMoreButtonText, { color: '#e67e22' }]}>
                                Derivar soporte a otro Técnico
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* MODAL EMERGENTE DEL TÉCNICO PARA DERIVAR / REASIGNAR SOPORTE */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalReasignarVisible}
                onRequestClose={() => setModalReasignarVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Derivar Soporte a otro Técnico</Text>

                        <Text style={styles.label}>1. Selecciona al Técnico al que derivarás *</Text>
                        {tecnicos.length === 0 ? (
                            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
                        ) : (
                            <View style={{ maxHeight: 180, marginBottom: 12 }}>
                                <ScrollView>
                                    {tecnicos.map((tec) => {
                                        const esMismoTecnico = ticket.nombre_tecnico && tec.nombre === ticket.nombre_tecnico;
                                        return (
                                            <TouchableOpacity
                                                key={tec.id}
                                                disabled={Boolean(esMismoTecnico)}
                                                style={[
                                                    styles.itemBox,
                                                    { flexDirection: 'row', alignItems: 'center' },
                                                    esMismoTecnico && { opacity: 0.5, backgroundColor: '#eee' },
                                                    idNuevoTecnico === tec.id && { borderColor: theme.colors.primary, backgroundColor: '#eef2f9' }
                                                ]}
                                                onPress={() => setIdNuevoTecnico(tec.id)}
                                            >
                                                <AppIcon name="user" size={16} color={idNuevoTecnico === tec.id ? theme.colors.primary : '#333'} />
                                                <Text style={{ fontWeight: 'bold', color: idNuevoTecnico === tec.id ? theme.colors.primary : '#333', marginLeft: 8 }}>
                                                    {tec.nombre} {esMismoTecnico ? '(Tú)' : ''}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        )}

                        <Text style={styles.label}>2. Justificación de la derivación *</Text>
                        <TextInput
                            style={[styles.input, { height: 90 }]}
                            multiline
                            placeholder="Explica por qué estás derivando este soporte a otro técnico..."
                            value={motivoDerivacion}
                            onChangeText={setMotivoDerivacion}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalReasignarVisible(false)}>
                                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtnSubmit, { backgroundColor: '#e67e22', opacity: idNuevoTecnico && motivoDerivacion.trim() ? 1 : 0.5 }]}
                                onPress={handleDerivarTecnico}
                                disabled={guardandoReasignacion || !idNuevoTecnico || !motivoDerivacion.trim()}
                            >
                                {guardandoReasignacion ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnSubmitText}>Confirmar Derivación</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 4. EL MODAL EMERGENTE */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Añadir otro problema</Text>

                        <Text style={styles.label}>Tipo de Problema</Text>
                        <View style={styles.optionsRow}>
                            {TIPOS_SOPORTE.map((tipo) => (
                                <TouchableOpacity
                                    key={tipo.id}
                                    style={[styles.miniOption, nuevoTipoSoporte === tipo.id && styles.miniOptionActive]}
                                    onPress={() => setNuevoTipoSoporte(tipo.id)}
                                >
                                    <View style={{ marginBottom: 6 }}>
                                        <AppIcon name={tipo.icono} size={20} color={nuevoTipoSoporte === tipo.id ? theme.colors.primary : '#666'} />
                                    </View>
                                    <Text style={[styles.miniOptionText, nuevoTipoSoporte === tipo.id && styles.miniOptionTextActive]}>{tipo.titulo}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.label}>Descripción detallada</Text>
                        <TextInput
                            style={[styles.input, { height: 100 }]}
                            multiline
                            placeholder="Describe el nuevo problema..."
                            value={nuevaDescripcion}
                            onChangeText={setNuevaDescripcion}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalBtnSubmit} onPress={handleAgregarItem} disabled={guardandoItem}>
                                {guardandoItem ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnSubmitText}>Guardar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 5. MODAL PARA VISUALIZAR EL ARCHIVO DEL ACTA ADJUNTA */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVerActaVisible}
                onRequestClose={() => setModalVerActaVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxWidth: 650, width: '100%', alignSelf: 'center' }]}>
                        <Text style={styles.modalTitle}>📄 Acta de Soporte Adjunta</Text>
                        {Boolean(nombreActaGuardada) && (
                            <Text style={{ textAlign: 'center', color: '#666', fontSize: 13, marginBottom: 10 }}>
                                Archivo: {nombreActaGuardada}
                            </Text>
                        )}

                        {construirUrlArchivo(rutaActaGuardada || ticket.url_acta) ? (
                            <View style={{ alignItems: 'center', marginBottom: 16 }}>
                                <Image
                                    source={{ uri: construirUrlArchivo(rutaActaGuardada || ticket.url_acta)! }}
                                    style={{ width: '100%', height: 420, borderRadius: 8, backgroundColor: '#f2f4f8' }}
                                    resizeMode="contain"
                                />
                            </View>
                        ) : (
                            <Text style={styles.emptyItemsText}>No se pudo cargar la vista previa del archivo.</Text>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalBtnCancel, { marginRight: 'auto' }]}
                                onPress={() => {
                                    const url = construirUrlArchivo(rutaActaGuardada || ticket.url_acta);
                                    if (url) Linking.openURL(url);
                                }}
                            >
                                <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>🔗 Abrir original / Descargar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalBtnSubmit, { backgroundColor: '#27ae60' }]}
                                onPress={() => setModalVerActaVisible(false)}
                            >
                                <Text style={styles.modalBtnSubmitText}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
    cardHeader: { backgroundColor: '#ffffff', padding: theme.spacing.lg, borderRadius: 8, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    title: { fontSize: theme.typography.sizes.xl, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
    subtitle: { fontSize: theme.typography.sizes.md, color: theme.colors.textSecondary, marginBottom: 4 },
    status: { fontSize: theme.typography.sizes.md, fontWeight: 'bold' },

    // ESTILOS PARA LOS ÍTEMS DEL PROBLEMA
    itemsSection: { backgroundColor: '#ffffff', padding: 16, borderRadius: 8, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    itemBox: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#eee', marginBottom: 10 },
    itemType: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
    itemDesc: { fontSize: 14, color: '#666' },
    emptyItemsText: { textAlign: 'center', color: '#999', marginTop: 10, fontStyle: 'italic' },

    actionSection: { backgroundColor: '#ffffff', padding: 16, borderRadius: 8, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, marginBottom: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
    label: { fontSize: 14, color: '#333', marginBottom: 6, fontWeight: '500' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 12, marginBottom: 16, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#fdfdfd' },
    button: { padding: 14, borderRadius: 6, alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    addMoreButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.primary, padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 12 },
    addMoreButtonText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 14 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 5, width: '100%', maxWidth: 520, alignSelf: 'center' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 16, textAlign: 'center' },
    optionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    miniOption: { flex: 1, alignItems: 'center', padding: 10, borderWidth: 1, borderColor: '#eee', borderRadius: 6, marginHorizontal: 4, backgroundColor: '#f9f9f9' },
    miniOptionActive: { borderColor: theme.colors.primary, backgroundColor: '#eef2f9' },
    miniOptionIcon: { fontSize: 20, marginBottom: 4 },
    miniOptionText: { fontSize: 10, textAlign: 'center', color: '#666' },
    miniOptionTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
    modalBtnCancel: { padding: 12, marginRight: 10 },
    modalBtnCancelText: { color: '#666', fontWeight: 'bold' },
    modalBtnSubmit: { backgroundColor: theme.colors.primary, padding: 12, borderRadius: 6, paddingHorizontal: 20 },
    modalBtnSubmitText: { color: '#fff', fontWeight: 'bold' }
});