import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    ScrollView,
    Modal,
    Image,
    Linking,
    Platform,
    Keyboard,
    KeyboardAvoidingView,
    useWindowDimensions,
} from 'react-native';
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
    obtenerBandeja,
    obtenerHistorialTecnicos,
} from '../api/soporte.service';

// Opciones de tipos de soporte para el modal de añadir problemas
const TIPOS_SOPORTE: Array<{ id: number; icono: NombreIcono; titulo: string }> = [
    { id: 1, icono: 'laptop', titulo: 'Problema de Hardware' },
    { id: 2, icono: 'gear', titulo: 'Sistemas Institucionales' },
    { id: 3, icono: 'document-text', titulo: 'Programas y ofimáticas' },
    { id: 4, icono: 'globe', titulo: 'Redes e Internet' },
];

// Niveles de prioridad seleccionables
const NIVELES_PRIORIDAD = [
    { valor: 'URGENTE', etiqueta: 'Urgente', dot: '#e74c3c', color: '#c0392b', bg: '#fdecea' },
    { valor: 'ALTA', etiqueta: 'Alta', dot: '#e67e22', color: '#d35400', bg: '#fef5e7' },
    { valor: 'NORMAL', etiqueta: 'Normal', dot: '#2ecc71', color: '#27ae60', bg: '#eafaf1' },
    { valor: 'BAJA', etiqueta: 'Baja', dot: '#3498db', color: '#2980b9', bg: '#ebf5fb' },
];

const obtenerEstiloEstado = (estado?: string) => {
    switch (estado) {
        case 'FINALIZADA':
            return { texto: 'FINALIZADA', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' };
        case 'EN_PROCESO':
            return { texto: 'EN PROCESO', color: '#6d28d9', bg: '#f3e8ff', border: '#e9d5ff' };
        case 'ASIGNADA':
            return { texto: 'ASIGNADA', color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
        case 'PENDIENTE':
        default:
            return { texto: 'PENDIENTE', color: '#b45309', bg: '#fef3c7', border: '#fde68a' };
    }
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
    const hora = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    return `${fecha}  •  ${hora}`;
};

const obtenerInfoTipoSoporte = (idTipo: number | string): { icono: NombreIcono; nombre: string } => {
    const id = Number(idTipo);
    if (id === 1) return { icono: 'laptop', nombre: 'Problema de Hardware' };
    if (id === 2) return { icono: 'gear', nombre: 'Sistemas Institucionales' };
    if (id === 3) return { icono: 'document-text', nombre: 'Programas y ofimáticas' };
    if (id === 4) return { icono: 'globe', nombre: 'Redes e Internet' };
    return { icono: 'wrench', nombre: 'Otro' };
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

export const TicketDetalleScreen = ({ route, navigation }: any) => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const esEscritorio = Platform.OS === 'web' && width > 768;

    const { ticket: ticketInicial, rolUsuario } = route.params as { ticket: TicketSoporte; rolUsuario: RolBandeja };
    const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);
    const [ticket, setTicket] = useState<TicketSoporte>(ticketInicial);
    const idReal = Number(ticket.id || ticket.id_solicitud);

    const [estadoActual, setEstadoActual] = useState<string>(ticket.estado);

    const [cargando, setCargando] = useState(false);
    const [cargandoItems, setCargandoItems] = useState(true);
    const [itemsProblema, setItemsProblema] = useState<any[]>([]);

    const [observacion, setObservacion] = useState('');
    const [justificacionReasignacion, setJustificacionReasignacion] = useState('');
    const [diagnostico, setDiagnostico] = useState('');

    const [tecnicos, setTecnicos] = useState<any[]>([]);
    const [idTecnico, setIdTecnico] = useState<number | null>(null);
    const [prioridad, setPrioridad] = useState<string>(
        ticketInicial.prioridad ? ticketInicial.prioridad.toUpperCase() : 'NORMAL'
    );

    // Modal añadir otro problema
    const [modalVisible, setModalVisible] = useState(false);
    const [nuevoTipoSoporte, setNuevoTipoSoporte] = useState<number>(1);
    const [nuevaDescripcion, setNuevaDescripcion] = useState('');
    const [guardandoItem, setGuardandoItem] = useState(false);

    // Estados del Técnico (Cronómetros, Derivación, Acta)
    const [tiempoDesdeAsignacion, setTiempoDesdeAsignacion] = useState<string>('Calculando...');
    const [tiempoEnProceso, setTiempoEnProceso] = useState<string>('No iniciado');
    const [baseSegundosInicio, setBaseSegundosInicio] = useState<number | null>(
        ticket.segundos_desde_inicio !== undefined && ticket.segundos_desde_inicio !== null
            ? Number(ticket.segundos_desde_inicio)
            : null
    );
    const [timestampInicioLocal, setTimestampInicioLocal] = useState<number>(() => Date.now());
    const [modalReasignarVisible, setModalReasignarVisible] = useState(false);
    const [modalHistorialTecnicosVisible, setModalHistorialTecnicosVisible] = useState(false);
    const [historialTecnicos, setHistorialTecnicos] = useState<any[]>([]);
    const [idNuevoTecnico, setIdNuevoTecnico] = useState<number | null>(null);
    const [motivoDerivacion, setMotivoDerivacion] = useState('');
    const [guardandoReasignacion, setGuardandoReasignacion] = useState(false);
    const [archivoActaUri, setArchivoActaUri] = useState<string | null>(null);
    const [nombreArchivoActa, setNombreArchivoActa] = useState<string>('');

    // Estado para ver el acta subida
    const [rutaActaGuardada, setRutaActaGuardada] = useState<string | null>(ticket.url_acta || null);
    const [nombreActaGuardada, setNombreActaGuardada] = useState<string>(ticket.nombre_archivo_acta || '');
    const [tipoMimeActaGuardada, setTipoMimeActaGuardada] = useState<string>(ticket.tipo_mime_acta || '');
    const [modalVerActaVisible, setModalVerActaVisible] = useState<boolean>(false);

    // Detección de teclado para ocultar ondas inferiores
    const [tecladoVisible, setTecladoVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => setTecladoVisible(true));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setTecladoVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Carga de ítems y sincronización en tiempo real
    useEffect(() => {
        const cargarDatos = async () => {
            if (idReal) {
                const items = await obtenerDetallesSolicitud(idReal);
                setItemsProblema(Array.isArray(items) ? items : []);

                if (rolUsuario === RolBandeja.TECNICO && Number(ticket.cantidad_reasignaciones || 0) > 0) {
                    try {
                        const historial = await obtenerHistorialTecnicos(idReal);
                        setHistorialTecnicos(Array.isArray(historial) ? historial : []);
                    } catch (error) {
                        console.error('Error al cargar el historial de técnicos:', error);
                    }
                }

                if (estadoActual === 'FINALIZADA') {
                    const acta = await obtenerActaSolicitud(idReal);
                    if (acta?.ruta_url) {
                        setRutaActaGuardada(acta.ruta_url);
                        setNombreActaGuardada(acta.nombre_archivo || '');
                        setTipoMimeActaGuardada(acta.tipo_mime || '');
                    }
                }
            }
            if (rolUsuario === RolBandeja.OPERADOR || rolUsuario === RolBandeja.TECNICO) {
                const listaTecnicos = await obtenerTecnicos();
                setTecnicos(Array.isArray(listaTecnicos) ? listaTecnicos : []);
            }
            setCargandoItems(false);
        };
        cargarDatos();

        const intervaloSync = setInterval(async () => {
            try {
                if (!idReal) return;
                const itemsActualizados = await obtenerDetallesSolicitud(idReal);
                if (Array.isArray(itemsActualizados)) {
                    setItemsProblema(itemsActualizados);
                }

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
            } catch (_e) {}
        }, 4000);

        return () => clearInterval(intervaloSync);
    }, [idReal, rolUsuario, estadoActual, baseSegundosInicio]);

    // 2 Cronómetros en tiempo real
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

            if (segAsignacionBase !== null) {
                setTiempoDesdeAsignacion(formatearSegundos(segAsignacionBase + deltaSegundos));
            } else {
                setTiempoDesdeAsignacion('Sin asignación');
            }

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

    // Acciones
    const handleAgregarItem = async () => {
        if (!nuevaDescripcion.trim()) {
            return Alert.alert('Error', 'Debes describir el problema.');
        }

        setGuardandoItem(true);
        try {
            await agregarItemSoporte(idReal, {
                id_tipo_soporte: nuevoTipoSoporte,
                descripcion: nuevaDescripcion.trim(),
            });

            Alert.alert('Éxito', 'Se añadió el problema a tu ticket.');
            setModalVisible(false);
            setNuevaDescripcion('');

            setCargandoItems(true);
            const itemsRefresh = await obtenerDetallesSolicitud(idReal);
            setItemsProblema(Array.isArray(itemsRefresh) ? itemsRefresh : []);
            setCargandoItems(false);
        } catch (_error) {
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
            Alert.alert('Éxito', 'Tu solicitud de insistencia ha sido enviada.');
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
            Alert.alert('Atención', 'Debes escribir el motivo por el cual estás reasignando.');
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
            setEstadoActual('EN_PROCESO');
            setTimestampInicioLocal(Date.now());
            setBaseSegundosInicio(0);
            Alert.alert('En Proceso', 'Has iniciado la atención del soporte.');
        } catch (error: any) {
            console.error('Error al poner en proceso:', error);
            Alert.alert('Error', 'No se pudo cambiar el estado a En Proceso.');
        } finally {
            setCargando(false);
        }
    };

    const handleDerivarTecnico = async () => {
        if (!idNuevoTecnico) {
            Alert.alert('Atención', 'Debes seleccionar al técnico al que deseas derivar el soporte.');
            return;
        }
        if (!motivoDerivacion.trim()) {
            Alert.alert('Atención', 'La justificación de la derivación es obligatoria.');
            return;
        }
        const idAsignacion = ticket.id_asignacion;
        if (!idAsignacion) {
            Alert.alert('Error', 'No se encontró el identificador de asignación.');
            return;
        }

        setGuardandoReasignacion(true);
        try {
            await reasignarSoporte(Number(idAsignacion), Number(idNuevoTecnico), motivoDerivacion.trim());
            setModalReasignarVisible(false);
            setMotivoDerivacion('');
            Alert.alert('Soporte Derivado', 'El soporte ha sido derivado exitosamente.');
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al derivar soporte:', error);
            const msg = error?.response?.data?.message || 'No se pudo derivar el soporte.';
            Alert.alert('Error', msg);
        } finally {
            setGuardandoReasignacion(false);
        }
    };

    const handleSeleccionarActa = async (usarCamara: boolean) => {
        try {
            if (usarCamara) {
                const permiso = await ImagePicker.requestCameraPermissionsAsync();
                if (!permiso.granted) {
                    Alert.alert('Permiso requerido', 'Permite el acceso a la cámara para tomar la foto del acta.');
                    return;
                }
            } else {
                const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permiso.granted) {
                    Alert.alert('Permiso requerido', 'Permite el acceso a la galería para seleccionar la foto del acta.');
                    return;
                }
            }
            const result = usarCamara
                ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.8 })
                : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.8 });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                setArchivoActaUri(asset.uri);
                setNombreArchivoActa(asset.fileName || 'acta_soporte.jpg');
            }
        } catch (error) {
            Alert.alert('Error', usarCamara ? 'No se pudo abrir la cámara.' : 'No se pudo abrir la galería.');
        }
    };

    const handleFinalizar = async () => {
        if (!archivoActaUri) {
            Alert.alert('Acta requerida', 'Debes adjuntar la imagen/foto del Acta de Soporte para finalizar.');
            return;
        }
        if (!diagnostico.trim()) {
            Alert.alert('Diagnóstico requerido', 'Debes escribir el diagnóstico u observación del trabajo realizado.');
            return;
        }
        const idAsignacion = ticket.id_asignacion;
        if (!idAsignacion) {
            Alert.alert('Error', 'No se encontró el ID de asignación.');
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

    // Fechas formateadas
    const fechaRaw = ticket.fecha_solicitud || (ticket as any).creado_en || (ticket as any).fecha_creacion;
    const fechaObj = fechaRaw ? new Date(fechaRaw) : null;
    const fechaSolicitud = fechaObj && !isNaN(fechaObj.getTime())
        ? fechaObj.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Hoy';
    const horaSolicitud = fechaObj && !isNaN(fechaObj.getTime())
        ? fechaObj.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        : 'Reciente';

    const estiloEstado = obtenerEstiloEstado(estadoActual);
    const infoPrioridad = obtenerInfoPrioridad(ticket.prioridad || prioridad);

    return (
        <View style={styles.screenWrapper}>
            {/* 1. CABECERA FIJA SUPERIOR AZUL INSTITUCIONAL CON ONDAS */}
            <View style={[styles.topHeader, { paddingTop: Platform.OS === 'web' ? 14 : Math.max(insets.top, 14) + 6 }]}>
                <View style={[styles.topBarRow, esEscritorio && { maxWidth: 880, alignSelf: 'center' }]}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.75}
                    >
                        <AppIcon name="arrow-left" size={20} color="#ffffff" />
                    </TouchableOpacity>

                    <Text style={styles.navBarTitle} numberOfLines={1}>
                        Detalle del Soporte
                    </Text>

                    <View style={styles.headerSpacerRight} />
                </View>

                {/* Onda superior curva en la base del header */}
                <Image
                    source={require('../../../../assets/ondas-superiores.png')}
                    style={styles.headerBottomWave}
                    resizeMode="stretch"
                />
            </View>

            {/* 2. CUERPO CON SCROLL NATURAL Y EVITACIÓN DE TECLADO */}
            <KeyboardAvoidingView
                style={styles.keyboardAvoiding}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.innerContainer, { maxWidth: 760 }]}>
                        {/* BANNER INSTITUCIONAL DEL TICKET */}
                        <View style={styles.sectionBannerRow}>
                            <View style={styles.blueCircleIcon}>
                                <AppIcon name="clipboard" size={22} color="#ffffff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sectionBannerTitle}>
                                    Ticket #{idReal}
                                </Text>
                                <Text style={styles.sectionBannerSub}>
                                    Información y seguimiento de la solicitud
                                </Text>
                            </View>
                        </View>

                        {/* TARJETA 1: RESUMEN DEL TICKET */}
                        <View style={styles.card}>
                            {/* Bloque superior: Estado actual + Prioridad + Solicitante */}
                            <View style={styles.summaryBlock1}>
                                <View style={styles.summaryRow}>
                                    <View>
                                        <Text style={styles.summaryMiniLabel}>ESTADO ACTUAL</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <View style={[styles.statusBadge, { backgroundColor: estiloEstado.bg, borderColor: estiloEstado.border }]}>
                                                <Text style={[styles.statusBadgeText, { color: estiloEstado.color }]}>
                                                    {estiloEstado.texto}
                                                </Text>
                                            </View>
                                            {infoPrioridad && (
                                                <View style={[styles.priorityBadge, { backgroundColor: infoPrioridad.bg, borderColor: infoPrioridad.color }]}>
                                                    <View style={[styles.priorityDot, { backgroundColor: infoPrioridad.dot }]} />
                                                    <Text style={[styles.priorityBadgeText, { color: infoPrioridad.color }]}>
                                                        {infoPrioridad.texto}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>

                                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 }}>
                                    <Text style={styles.summaryMiniLabel}>SOLICITANTE</Text>
                                    <Text style={styles.summaryValueName}>
                                        {ticket.nombre_usuario || (ticket as any).username || 'Funcionario institucional'}
                                    </Text>
                                </View>
                            </View>

                            {/* Bloque: 2 Columnas de Fecha y Hora */}
                            <View style={styles.summaryBlock2}>
                                <View style={styles.summaryColCard}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <AppIcon name="calendar" size={14} color="#164a96" />
                                        <Text style={styles.summaryColLabel}>FECHA</Text>
                                    </View>
                                    <Text style={styles.summaryColValue}>{fechaSolicitud}</Text>
                                </View>

                                <View style={styles.summaryColCard}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <AppIcon name="clock" size={14} color="#164a96" />
                                        <Text style={styles.summaryColLabel}>
                                            {rolUsuario === RolBandeja.TECNICO && estadoActual !== 'FINALIZADA' ? 'TIEMPO' : 'HORA'}
                                        </Text>
                                    </View>
                                    <Text style={styles.summaryColValue}>
                                        {rolUsuario === RolBandeja.TECNICO && estadoActual !== 'FINALIZADA'
                                            ? tiempoDesdeAsignacion
                                            : horaSolicitud}
                                    </Text>
                                </View>
                            </View>

                            {/* Ubicación */}
                            <View style={styles.locationSection}>
                                <View style={styles.sectionHeaderRow}>
                                    <View style={styles.sectionIconPill}>
                                        <AppIcon name="location" size={15} color="#164a96" />
                                    </View>
                                    <Text style={styles.sectionCardTitle}>Ubicación</Text>
                                </View>
                                <View style={styles.infoContentBox}>
                                    <Text style={styles.locationTitle}>{ticket.oficina || 'Sin oficina'}</Text>
                                    <Text style={styles.locationSub}>
                                        {ticket.piso ? `Piso: ${ticket.piso}` : 'Piso no registrado'}
                                        {(ticket as any).consultorio ? ` • Consultorio: ${(ticket as any).consultorio}` : ''}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* TARJETA 2: PROBLEMAS REPORTADOS Y TÉCNICO */}
                        <View style={styles.card}>
                            <View style={styles.sectionHeaderRow}>
                                <View style={styles.sectionIconPill}>
                                    <AppIcon name="wrench" size={15} color="#164a96" />
                                </View>
                                <Text style={styles.sectionCardTitle}>Problemas Reportados</Text>
                            </View>

                            {cargandoItems ? (
                                <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 14 }} />
                            ) : itemsProblema.length > 0 ? (
                                itemsProblema.map((item, index) => {
                                    const infoTipo = obtenerInfoTipoSoporte(item.id_tipo_soporte);
                                    return (
                                        <View key={index} style={styles.itemBox}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                <AppIcon name={infoTipo.icono} size={15} color="#164a96" />
                                                <Text style={styles.itemType}>{infoTipo.nombre}</Text>
                                            </View>
                                            <Text style={styles.itemDesc}>{item.descripcion}</Text>
                                            {index === 0 && (item.adjuntos || []).map((adjunto: any) => {
                                                const urlImagen = construirUrlArchivo(adjunto.ruta_url);
                                                return urlImagen ? (
                                                    <TouchableOpacity key={adjunto.id} onPress={() => Linking.openURL(urlImagen)} style={styles.problemAttachment}>
                                                        <Image source={{ uri: urlImagen }} style={styles.problemAttachmentImage} resizeMode="cover" />
                                                        <Text style={styles.problemAttachmentText}>Ver imagen adjunta</Text>
                                                    </TouchableOpacity>
                                                ) : null;
                                            })}
                                        </View>
                                    );
                                })
                            ) : (
                                <Text style={styles.emptyItemsText}>No se pudieron cargar los problemas.</Text>
                            )}

                            {/* TÉCNICO ASIGNADO */}
                            {Boolean(ticket.nombre_tecnico) && (
                                <View style={styles.techAssignedBox}>
                                    <AppIcon name="user" size={16} color="#1d4ed8" />
                                    <View style={{ flex: 1, marginLeft: 8 }}>
                                        <Text style={styles.techAssignedLabel}>Técnico Asignado:</Text>
                                        <Text style={styles.techAssignedName}>{ticket.nombre_tecnico}</Text>
                                    </View>
                                </View>
                            )}

                            {rolUsuario === RolBandeja.TECNICO && Number(ticket.cantidad_reasignaciones || 0) > 0 && (
                                <TouchableOpacity
                                    style={styles.viewTechnicianHistoryButton}
                                    onPress={() => setModalHistorialTecnicosVisible(true)}
                                    activeOpacity={0.8}
                                >
                                    <AppIcon name="users" size={15} color="#1d5bbf" />
                                    <Text style={styles.viewTechnicianHistoryText}>Ver técnicos y tiempos anteriores</Text>
                                </TouchableOpacity>
                            )}

                            {/* AVISO DE REASIGNACIÓN PREVIA */}
                            {Boolean(ticket.ultima_reasignacion_motivo) && (
                                <View style={styles.warningAlertBox}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <AppIcon name="refresh" size={13} color="#d35400" />
                                        <Text style={styles.warningAlertTitle}>Ticket Reasignado / Derivado</Text>
                                    </View>
                                    <Text style={styles.warningAlertText}>
                                        Motivo: {ticket.ultima_reasignacion_motivo}
                                    </Text>
                                </View>
                            )}

                            {/* AVISO DE INSISTENCIA */}
                            {Number(ticket.cantidad_resolicitudes || 0) > 0 && estadoActual !== 'FINALIZADA' && (
                                <View style={styles.dangerAlertBox}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <AppIcon name="alert" size={13} color="#c0392b" />
                                        <Text style={styles.dangerAlertTitle}>
                                            Insistencia ({ticket.cantidad_resolicitudes}): Atención demorada
                                        </Text>
                                    </View>
                                    {ticket.ultima_resolicitud_motivo ? (
                                        <Text style={styles.dangerAlertText}>
                                            "{ticket.ultima_resolicitud_motivo}"
                                        </Text>
                                    ) : null}
                                </View>
                            )}
                        </View>

                        {/* TARJETA 3: ACCIONES SEGÚN ROL */}

                        {/* --- ROL USUARIO --- */}
                        {rolUsuario === RolBandeja.USUARIO && estadoActual !== 'FINALIZADA' && (
                            <View style={styles.card}>
                                <Text style={styles.actionSectionTitle}>¿Atención demorada?</Text>
                                <TextInput
                                    style={styles.textInputArea}
                                    placeholder="Escribe el motivo de tu insistencia (opcional)..."
                                    placeholderTextColor="#94a3b8"
                                    value={observacion}
                                    onChangeText={setObservacion}
                                    multiline
                                />

                                <TouchableOpacity
                                    style={[styles.primaryActionBtn, { backgroundColor: '#e67e22' }]}
                                    onPress={handleResolicitar}
                                    disabled={cargando}
                                >
                                    {cargando ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : (
                                        <>
                                            <AppIcon name="bell" size={16} color="#ffffff" />
                                            <Text style={styles.primaryActionBtnText}>Re-solicitar / Insistir</Text>
                                        </>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.secondaryActionBtn}
                                    onPress={() => setModalVisible(true)}
                                >
                                    <Text style={styles.secondaryActionBtnText}>+ Añadir otro problema a esta solicitud</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* --- ROL OPERADOR: ASIGNACIÓN INICIAL --- */}
                        {rolUsuario === RolBandeja.OPERADOR && estadoActual === 'PENDIENTE' && (
                            <View style={styles.card}>
                                <Text style={styles.actionSectionTitle}>Asignar a Técnico</Text>

                                <Text style={styles.inputMiniLabel}>1. Nivel de prioridad:</Text>
                                <View style={styles.priorityGrid}>
                                    {NIVELES_PRIORIDAD.map((p) => {
                                        const activo = prioridad === p.valor;
                                        return (
                                            <TouchableOpacity
                                                key={p.valor}
                                                style={[
                                                    styles.priorityOptionCard,
                                                    { borderColor: activo ? p.color : '#e2e8f0', backgroundColor: activo ? p.bg : '#ffffff' },
                                                ]}
                                                onPress={() => setPrioridad(p.valor)}
                                            >
                                                <View style={[styles.priorityDot, { backgroundColor: p.dot }]} />
                                                <Text style={[styles.priorityOptionText, { color: activo ? p.color : '#475569' }]}>
                                                    {p.etiqueta}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <Text style={styles.inputMiniLabel}>2. Selecciona al técnico disponible:</Text>
                                {tecnicos.length === 0 ? (
                                    <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 14 }} />
                                ) : (
                                    <View style={{ marginBottom: 12 }}>
                                        {tecnicos.map((tec) => (
                                            <TouchableOpacity
                                                key={tec.id}
                                                style={[
                                                    styles.selectOptionRow,
                                                    idTecnico === tec.id && styles.selectOptionRowActive,
                                                ]}
                                                onPress={() => setIdTecnico(tec.id)}
                                            >
                                                <AppIcon
                                                    name="user"
                                                    size={15}
                                                    color={idTecnico === tec.id ? '#164a96' : '#64748b'}
                                                />
                                                <Text
                                                    style={[
                                                        styles.selectOptionText,
                                                        idTecnico === tec.id && styles.selectOptionTextActive,
                                                    ]}
                                                >
                                                    {tec.nombre}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[
                                        styles.primaryActionBtn,
                                        { backgroundColor: '#164a96', opacity: idTecnico ? 1 : 0.5 },
                                    ]}
                                    onPress={handleAsignar}
                                    disabled={cargando || !idTecnico}
                                >
                                    {cargando ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : (
                                        <>
                                            <Text style={styles.primaryActionBtnText}>Asignar Ticket</Text>
                                            <AppIcon name="arrow-right" size={16} color="#ffffff" />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* --- ROL OPERADOR: REASIGNACIÓN --- */}
                        {rolUsuario === RolBandeja.OPERADOR && estadoActual === 'ASIGNADA' && (
                            <View style={styles.card}>
                                <Text style={styles.actionSectionTitle}>Reasignar a otro Técnico</Text>

                                <Text style={styles.inputMiniLabel}>1. Motivo del cambio *</Text>
                                <TextInput
                                    style={styles.textInputArea}
                                    placeholder="Explica por qué se cambia de técnico..."
                                    placeholderTextColor="#94a3b8"
                                    value={justificacionReasignacion}
                                    onChangeText={setJustificacionReasignacion}
                                    multiline
                                />

                                <Text style={styles.inputMiniLabel}>2. Nivel de prioridad:</Text>
                                <View style={styles.priorityGrid}>
                                    {NIVELES_PRIORIDAD.map((p) => {
                                        const activo = prioridad === p.valor;
                                        return (
                                            <TouchableOpacity
                                                key={p.valor}
                                                style={[
                                                    styles.priorityOptionCard,
                                                    { borderColor: activo ? p.color : '#e2e8f0', backgroundColor: activo ? p.bg : '#ffffff' },
                                                ]}
                                                onPress={() => setPrioridad(p.valor)}
                                            >
                                                <View style={[styles.priorityDot, { backgroundColor: p.dot }]} />
                                                <Text style={[styles.priorityOptionText, { color: activo ? p.color : '#475569' }]}>
                                                    {p.etiqueta}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <Text style={styles.inputMiniLabel}>3. Nuevo técnico disponible:</Text>
                                <View style={{ marginBottom: 12 }}>
                                    {tecnicos.map((tec) => {
                                        const esActual = ticket.nombre_tecnico && tec.nombre === ticket.nombre_tecnico;
                                        return (
                                            <TouchableOpacity
                                                key={tec.id}
                                                disabled={Boolean(esActual)}
                                                style={[
                                                    styles.selectOptionRow,
                                                    esActual && { opacity: 0.5, backgroundColor: '#f1f5f9' },
                                                    idTecnico === tec.id && styles.selectOptionRowActive,
                                                ]}
                                                onPress={() => setIdTecnico(tec.id)}
                                            >
                                                <AppIcon
                                                    name="user"
                                                    size={15}
                                                    color={idTecnico === tec.id ? '#164a96' : '#64748b'}
                                                />
                                                <Text
                                                    style={[
                                                        styles.selectOptionText,
                                                        idTecnico === tec.id && styles.selectOptionTextActive,
                                                    ]}
                                                >
                                                    {tec.nombre} {esActual ? '(Asignado)' : ''}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <TouchableOpacity
                                    style={[
                                        styles.primaryActionBtn,
                                        {
                                            backgroundColor: '#e67e22',
                                            opacity: idTecnico && justificacionReasignacion.trim() ? 1 : 0.5,
                                        },
                                    ]}
                                    onPress={handleReasignarOperador}
                                    disabled={cargando || !idTecnico || !justificacionReasignacion.trim()}
                                >
                                    {cargando ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : (
                                        <>
                                            <AppIcon name="refresh" size={16} color="#ffffff" />
                                            <Text style={styles.primaryActionBtnText}>Confirmar Reasignación</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* --- ROL OPERADOR: BLOQUEO EN PROCESO --- */}
                        {rolUsuario === RolBandeja.OPERADOR && estadoActual === 'EN_PROCESO' && (
                            <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#8e44ad' }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <AppIcon name="wrench" size={16} color="#8e44ad" />
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#8e44ad', marginLeft: 6 }}>
                                        Soporte En Proceso
                                    </Text>
                                </View>
                                <Text style={{ color: '#475569', fontSize: 13, lineHeight: 18 }}>
                                    Atendido actualmente por{' '}
                                    <Text style={{ fontWeight: 'bold', color: '#8e44ad' }}>
                                        {ticket.nombre_tecnico || 'el técnico'}
                                    </Text>
                                    . No se puede reasignar durante la atención.
                                </Text>
                            </View>
                        )}

                        {/* --- HISTORIAL / FINALIZADA (OPERADOR / TÉCNICO) --- */}
                        {(rolUsuario === RolBandeja.OPERADOR || rolUsuario === RolBandeja.TECNICO) && estadoActual === 'FINALIZADA' && (
                            <View style={styles.card}>
                                <Text style={styles.actionSectionTitle}>Historial y Acta de Soporte</Text>

                                <View style={styles.historyMetricsBox}>
                                    <View style={styles.historyMetricRow}>
                                        <Text style={styles.historyMetricLabel}>Técnico:</Text>
                                        <Text style={styles.historyMetricValue}>{ticket.nombre_tecnico || 'Técnico'}</Text>
                                    </View>
                                    <View style={styles.historyMetricRow}>
                                        <Text style={styles.historyMetricLabel}>Asignación:</Text>
                                        <Text style={[styles.historyMetricValue, { color: '#1d4ed8' }]}>
                                            {formatearFechaHora(ticket.fecha_asignacion)}
                                        </Text>
                                    </View>
                                    <View style={styles.historyMetricRow}>
                                        <Text style={styles.historyMetricLabel}>Finalización:</Text>
                                        <Text style={[styles.historyMetricValue, { color: '#15803d' }]}>
                                            {formatearFechaHora(ticket.fecha_finalizacion)}
                                        </Text>
                                    </View>
                                    <View style={styles.historyMetricRow}>
                                        <Text style={styles.historyMetricLabel}>Tiempo total:</Text>
                                        <Text style={[styles.historyMetricValue, { color: '#1d4ed8' }]}>
                                            {tiempoDesdeAsignacion}
                                        </Text>
                                    </View>
                                    <View style={styles.historyMetricRow}>
                                        <Text style={styles.historyMetricLabel}>Trabajo efectivo:</Text>
                                        <Text style={[styles.historyMetricValue, { color: '#6d28d9' }]}>
                                            {tiempoEnProceso}
                                        </Text>
                                    </View>
                                    {Boolean(ticket.diagnostico) && (
                                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 }}>
                                            <Text style={styles.historyMetricLabel}>Diagnóstico:</Text>
                                            <Text style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
                                                {ticket.diagnostico}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <TouchableOpacity
                                    style={[styles.primaryActionBtn, { backgroundColor: '#15803d', marginTop: 12 }]}
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
                                            Alert.alert('Sin archivo', 'No se encontró un archivo de acta adjunto.');
                                            return;
                                        }
                                        const esPdf =
                                            (tipoMimeActaGuardada && tipoMimeActaGuardada.toLowerCase().includes('pdf')) ||
                                            urlCompleta.toLowerCase().endsWith('.pdf');
                                        if (esPdf) {
                                            Linking.openURL(urlCompleta);
                                        } else {
                                            setModalVerActaVisible(true);
                                        }
                                    }}
                                >
                                    <AppIcon name="document" size={16} color="#ffffff" />
                                    <Text style={styles.primaryActionBtnText}>Ver Acta Adjunta</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* --- ROL TÉCNICO (SOPORTE ACTIVO) --- */}
                        {rolUsuario === RolBandeja.TECNICO && estadoActual !== 'FINALIZADA' && (
                            <View style={styles.card}>
                                <Text style={styles.actionSectionTitle}>Cronómetros en Vivo</Text>

                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                                    <View style={styles.timerCard}>
                                        <Text style={styles.timerCardLabel}>1. Desde Asignación</Text>
                                        <Text style={[styles.timerCardNumber, { color: '#1d4ed8' }]}>
                                            {tiempoDesdeAsignacion}
                                        </Text>
                                    </View>
                                    <View style={styles.timerCard}>
                                        <Text style={styles.timerCardLabel}>2. En Proceso</Text>
                                        <Text style={[styles.timerCardNumber, { color: '#6d28d9' }]}>
                                            {tiempoEnProceso}
                                        </Text>
                                    </View>
                                </View>

                                {estadoActual === 'ASIGNADA' && (
                                    <TouchableOpacity
                                        style={[styles.primaryActionBtn, { backgroundColor: '#6d28d9', marginBottom: 14 }]}
                                        onPress={handlePonerEnProceso}
                                        disabled={cargando}
                                    >
                                        {cargando ? (
                                            <ActivityIndicator color="#ffffff" />
                                        ) : (
                                            <>
                                                <AppIcon name="play" size={16} color="#ffffff" />
                                                <Text style={styles.primaryActionBtnText}>Poner En Proceso (Iniciar)</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}

                                {(estadoActual === 'ASIGNADA' || estadoActual === 'EN_PROCESO') && (
                                    <TouchableOpacity
                                        style={[styles.secondaryActionBtn, { borderColor: '#e67e22', marginBottom: 14 }]}
                                        onPress={() => setModalReasignarVisible(true)}
                                        disabled={cargando}
                                    >
                                        <AppIcon name="refresh" size={15} color="#e67e22" />
                                        <Text style={[styles.secondaryActionBtnText, { color: '#e67e22' }]}>Derivar a otro Técnico</Text>
                                    </TouchableOpacity>
                                )}

                                {/* FINALIZAR Y SUBIR ACTA: disponible después de iniciar */}
                                {estadoActual === 'EN_PROCESO' && <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 14 }}>
                                    <Text style={styles.actionSectionTitle}>Finalizar Soporte y Subir Acta</Text>

                                    <Text style={styles.inputMiniLabel}>1. Foto del Acta *</Text>
                                    <View style={styles.actaUploadActions}>
                                        <TouchableOpacity
                                            style={[styles.uploadActaBtn, styles.actaUploadAction, archivoActaUri && { backgroundColor: '#dcfce7', borderColor: '#15803d' }]}
                                            onPress={() => handleSeleccionarActa(false)}
                                        >
                                            <AppIcon name={archivoActaUri ? 'check' : 'folder'} size={16} color={archivoActaUri ? '#15803d' : '#164a96'} />
                                            <Text style={[styles.uploadActaBtnText, archivoActaUri && { color: '#15803d' }]} numberOfLines={1}>
                                                {archivoActaUri ? nombreArchivoActa : 'Galería'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.uploadActaBtn, styles.actaUploadAction]} onPress={() => handleSeleccionarActa(true)}>
                                            <AppIcon name="camera" size={16} color="#164a96" />
                                            <Text style={styles.uploadActaBtnText}>Tomar foto</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={styles.inputMiniLabel}>2. Diagnóstico o Solución *</Text>
                                    <TextInput
                                        style={styles.textInputArea}
                                        placeholder="Describe qué trabajo o solución técnica se realizó..."
                                        placeholderTextColor="#94a3b8"
                                        value={diagnostico}
                                        onChangeText={setDiagnostico}
                                        multiline
                                        textAlignVertical="top"
                                        onFocus={() => {
                                            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 250);
                                        }}
                                    />

                                    <TouchableOpacity
                                        style={[
                                            styles.primaryActionBtn,
                                            {
                                                backgroundColor: '#15803d',
                                                opacity: archivoActaUri && diagnostico.trim() ? 1 : 0.5,
                                            },
                                        ]}
                                        onPress={handleFinalizar}
                                        disabled={cargando || !archivoActaUri || !diagnostico.trim()}
                                    >
                                        {cargando ? (
                                            <ActivityIndicator color="#ffffff" />
                                        ) : (
                                            <>
                                                <AppIcon name="check" size={16} color="#ffffff" />
                                                <Text style={styles.primaryActionBtnText}>Subir Acta y Finalizar</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>}
                            </View>
                        )}
                    </View>

                    {/* 3. ONDAS INFERIORES DECORATIVAS (OCULTAS CUANDO EL TECLADO ESTÁ ABIERTO) */}
                    {!tecladoVisible && (
                        <View style={styles.bottomWavesWrapper} pointerEvents="none">
                            <Image
                                source={require('../../../../assets/ondas-inferiores.png')}
                                style={styles.bottomWavesImg}
                                resizeMode="stretch"
                            />
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            {/* MODAL INTERNO: AÑADIR PROBLEMA */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Añadir otro problema</Text>

                        <Text style={styles.inputMiniLabel}>Tipo de Problema</Text>
                        <View style={styles.optionsRow}>
                            {TIPOS_SOPORTE.map((tipo) => (
                                <TouchableOpacity
                                    key={tipo.id}
                                    style={[
                                        styles.miniOption,
                                        nuevoTipoSoporte === tipo.id && styles.miniOptionActive,
                                    ]}
                                    onPress={() => setNuevoTipoSoporte(tipo.id)}
                                >
                                    <AppIcon
                                        name={tipo.icono}
                                        size={18}
                                        color={nuevoTipoSoporte === tipo.id ? '#164a96' : '#64748b'}
                                    />
                                    <Text
                                        style={[
                                            styles.miniOptionText,
                                            nuevoTipoSoporte === tipo.id && styles.miniOptionTextActive,
                                        ]}
                                    >
                                        {tipo.titulo}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputMiniLabel}>Descripción</Text>
                        <TextInput
                            style={[styles.textInputArea, { height: 90 }]}
                            multiline
                            placeholder="Describe el nuevo problema..."
                            placeholderTextColor="#94a3b8"
                            value={nuevaDescripcion}
                            onChangeText={setNuevaDescripcion}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.modalBtnCancel}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.modalBtnSubmit}
                                onPress={handleAgregarItem}
                                disabled={guardandoItem}
                            >
                                {guardandoItem ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.modalBtnSubmitText}>Guardar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL INTERNO: DERIVAR TÉCNICO */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalReasignarVisible}
                onRequestClose={() => setModalReasignarVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Derivar Soporte a otro Técnico</Text>

                        <Text style={styles.inputMiniLabel}>1. Selecciona al técnico *</Text>
                        <View style={{ maxHeight: 160, marginBottom: 12 }}>
                            <ScrollView>
                                {tecnicos.map((tec) => {
                                    const esMismo = ticket.nombre_tecnico && tec.nombre === ticket.nombre_tecnico;
                                    return (
                                        <TouchableOpacity
                                            key={tec.id}
                                            disabled={Boolean(esMismo)}
                                            style={[
                                                styles.selectOptionRow,
                                                esMismo && { opacity: 0.5, backgroundColor: '#f1f5f9' },
                                                idNuevoTecnico === tec.id && styles.selectOptionRowActive,
                                            ]}
                                            onPress={() => setIdNuevoTecnico(tec.id)}
                                        >
                                            <AppIcon
                                                name="user"
                                                size={15}
                                                color={idNuevoTecnico === tec.id ? '#164a96' : '#64748b'}
                                            />
                                            <Text
                                                style={[
                                                    styles.selectOptionText,
                                                    idNuevoTecnico === tec.id && styles.selectOptionTextActive,
                                                ]}
                                            >
                                                {tec.nombre} {esMismo ? '(Tú)' : ''}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        <Text style={styles.inputMiniLabel}>2. Justificación *</Text>
                        <TextInput
                            style={[styles.textInputArea, { height: 80 }]}
                            multiline
                            placeholder="Explica el motivo de la derivación..."
                            placeholderTextColor="#94a3b8"
                            value={motivoDerivacion}
                            onChangeText={setMotivoDerivacion}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.modalBtnCancel}
                                onPress={() => setModalReasignarVisible(false)}
                            >
                                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.modalBtnSubmit,
                                    {
                                        backgroundColor: '#e67e22',
                                        opacity: idNuevoTecnico && motivoDerivacion.trim() ? 1 : 0.5,
                                    },
                                ]}
                                onPress={handleDerivarTecnico}
                                disabled={guardandoReasignacion || !idNuevoTecnico || !motivoDerivacion.trim()}
                            >
                                {guardandoReasignacion ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.modalBtnSubmitText}>Confirmar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL: HISTORIAL DE TÉCNICOS Y CRONÓMETROS */}
            <Modal
                animationType="slide"
                transparent
                visible={modalHistorialTecnicosVisible}
                onRequestClose={() => setModalHistorialTecnicosVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.historyModalHeader}>
                            <Text style={styles.modalTitle}>Técnicos involucrados</Text>
                            <TouchableOpacity onPress={() => setModalHistorialTecnicosVisible(false)}>
                                <AppIcon name="close" size={18} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 440 }}>
                            {historialTecnicos.map((etapa, index) => (
                                <View key={etapa.id_asignacion || index} style={styles.technicianHistoryCard}>
                                    <Text style={styles.technicianHistoryTitle}>Paso {index + 1} · {etapa.tipo_movimiento || 'MOVIMIENTO HISTÓRICO'}</Text>
                                    <Text style={styles.technicianHistoryLine}>
                                        Flujo: {etapa.nombre_actor || 'Actor no identificado'} ({etapa.rol_actor || 'ROL NO REGISTRADO'}) → {etapa.fecha_asignacion ? `${etapa.nombre_tecnico || 'Técnico'} (TÉCNICO)` : `${etapa.nombre_destino || 'Técnico receptor'} (TÉCNICO)`}
                                    </Text>
                                    <Text style={styles.technicianHistoryLine}>Asignado: {etapa.fecha_asignacion ? formatearFechaHora(etapa.fecha_asignacion) : 'No registrada en el historial anterior'}</Text>
                                    <Text style={styles.technicianHistoryLine}>Tiempo asignado: {etapa.segundos_desde_asignacion === null ? 'No disponible en el registro anterior' : formatearSegundos(Number(etapa.segundos_desde_asignacion || 0))}</Text>
                                    <Text style={styles.technicianHistoryLine}>Proceso: {etapa.fecha_inicio ? formatearFechaHora(etapa.fecha_inicio) : 'No iniciado'}</Text>
                                    <Text style={styles.technicianHistoryLine}>Tiempo en proceso: {etapa.segundos_en_proceso === null ? (etapa.fecha_asignacion ? 'No iniciado' : 'No disponible en el registro anterior') : formatearSegundos(Number(etapa.segundos_en_proceso || 0))}</Text>
                                    {etapa.fecha_derivacion && etapa.nombre_destino ? (
                                        <Text style={styles.technicianHistoryLine}>
                                            Siguiente paso: {etapa.nombre_tecnico || 'Técnico'} (TÉCNICO) → {etapa.nombre_destino} (TÉCNICO) · {etapa.rol_derivacion === 'OPERADOR' ? 'Reasignado por OPERADOR' : etapa.rol_derivacion === 'TECNICO' ? 'Derivado por TÉCNICO' : 'Rol de derivación no registrado'} · {formatearFechaHora(etapa.fecha_derivacion)}
                                        </Text>
                                    ) : null}
                                    {etapa.motivo_derivacion ? (
                                        <Text style={styles.technicianHistoryReason}>Motivo del siguiente paso: {etapa.motivo_derivacion}</Text>
                                    ) : etapa.motivo_entrada ? (
                                        <Text style={styles.technicianHistoryReason}>Motivo registrado: {etapa.motivo_entrada}</Text>
                                    ) : null}
                                </View>
                            ))}
                            {historialTecnicos.length === 0 && <Text style={styles.emptyItemsText}>No se encontró el historial de asignaciones.</Text>}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* MODAL INTERNO: VER ACTA ADJUNTA */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVerActaVisible}
                onRequestClose={() => setModalVerActaVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxWidth: 620 }]}>
                        <Text style={styles.modalTitle}>Acta de Soporte Adjunta</Text>
                        {Boolean(nombreActaGuardada) && (
                            <Text style={{ textAlign: 'center', color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                                {nombreActaGuardada}
                            </Text>
                        )}

                        {construirUrlArchivo(rutaActaGuardada || ticket.url_acta) ? (
                            <View style={{ alignItems: 'center', marginBottom: 14 }}>
                                <Image
                                    source={{ uri: construirUrlArchivo(rutaActaGuardada || ticket.url_acta)! }}
                                    style={{ width: '100%', height: 400, borderRadius: 12, backgroundColor: '#f1f5f9' }}
                                    resizeMode="contain"
                                />
                            </View>
                        ) : (
                            <Text style={styles.emptyItemsText}>No se pudo cargar la imagen del acta.</Text>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalBtnCancel, { marginRight: 'auto' }]}
                                onPress={() => {
                                    const url = construirUrlArchivo(rutaActaGuardada || ticket.url_acta);
                                    if (url) Linking.openURL(url);
                                }}
                            >
                                <Text style={{ color: '#164a96', fontWeight: 'bold', fontSize: 13 }}>
                                    Abrir / Descargar
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.modalBtnSubmit}
                                onPress={() => setModalVerActaVisible(false)}
                            >
                                <Text style={styles.modalBtnSubmitText}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    screenWrapper: {
        flex: 1,
        backgroundColor: '#f4f7fb',
    },

    // CABECERA FIJA SUPERIOR
    topHeader: {
        backgroundColor: '#164a96',
        paddingBottom: 0,
        position: 'relative',
    },
    topBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 8,
        width: '100%',
    },
    backButton: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    navBarTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        flex: 1,
        marginHorizontal: 12,
    },
    headerSpacerRight: {
        width: 38,
        height: 38,
    },
    headerBottomWave: {
        width: '100%',
        height: 24,
        marginTop: 4,
    },

    // SCROLL Y CONTENEDOR
    keyboardAvoiding: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 14,
        paddingBottom: 40,
    },
    innerContainer: {
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 16,
    },

    // BANNER INSTITUCIONAL
    sectionBannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    blueCircleIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1d68d8',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        elevation: 2,
    },
    sectionBannerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f294a',
    },
    sectionBannerSub: {
        fontSize: 12.5,
        color: '#475569',
        marginTop: 1,
    },

    // TARJETAS
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        elevation: 2,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },

    // RESUMEN BLOQUE 1
    summaryBlock1: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    summaryMiniLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748b',
        letterSpacing: 0.5,
    },
    summaryValueName: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#0f294a',
        marginTop: 3,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
    },
    statusBadgeText: {
        fontSize: 11.5,
        fontWeight: 'bold',
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
    },
    priorityDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        marginRight: 5,
    },
    priorityBadgeText: {
        fontSize: 11,
        fontWeight: 'bold',
    },

    // RESUMEN BLOQUE 2 (2 COLUMNAS)
    summaryBlock2: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    summaryColCard: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 12,
    },
    summaryColLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748b',
        letterSpacing: 0.3,
    },
    summaryColValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f294a',
        marginTop: 4,
    },

    // UBICACIÓN
    locationSection: {
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 12,
        marginTop: 2,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    sectionIconPill: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: '#eef4ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    sectionCardTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#0f294a',
    },
    infoContentBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    locationTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    locationSub: {
        fontSize: 12.5,
        color: '#64748b',
        marginTop: 2,
    },

    // ÍTEMS DEL PROBLEMA
    itemBox: {
        backgroundColor: '#f8fafc',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 8,
    },
    itemType: {
        fontSize: 13.5,
        fontWeight: 'bold',
        color: '#0f294a',
        marginLeft: 6,
    },
    itemDesc: {
        fontSize: 13,
        color: '#475569',
        marginTop: 2,
        lineHeight: 18,
    },
    problemAttachment: { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'flex-start' },
    problemAttachmentImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#e2e8f0' },
    problemAttachmentText: { marginLeft: 9, color: '#1d5bbf', fontSize: 12, fontWeight: '600' },
    emptyItemsText: {
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 13,
        paddingVertical: 10,
        fontStyle: 'italic',
    },

    // FICHAS INFORMATIVAS
    techAssignedBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#eff6ff',
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        marginTop: 6,
    },
    techAssignedLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#1d4ed8',
    },
    techAssignedName: {
        fontSize: 13.5,
        fontWeight: 'bold',
        color: '#1e3a8a',
    },
    viewTechnicianHistoryButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#eef4ff' },
    viewTechnicianHistoryText: { marginLeft: 6, color: '#1d5bbf', fontSize: 12, fontWeight: '600' },
    historyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    technicianHistoryCard: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', marginBottom: 9 },
    technicianHistoryTitle: { color: '#0f294a', fontSize: 14, fontWeight: '700', marginBottom: 6 },
    technicianHistoryLine: { color: '#475569', fontSize: 12, marginTop: 3 },
    technicianHistoryReason: { color: '#c2410c', fontSize: 12, fontWeight: '600', marginTop: 7 },
    warningAlertBox: {
        backgroundColor: '#fff8e1',
        borderRadius: 8,
        padding: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#f39c12',
        marginTop: 8,
    },
    warningAlertTitle: {
        fontSize: 12.5,
        fontWeight: 'bold',
        color: '#d35400',
        marginLeft: 5,
    },
    warningAlertText: {
        fontSize: 12,
        color: '#555',
        marginTop: 2,
    },
    dangerAlertBox: {
        backgroundColor: '#fdecea',
        borderRadius: 8,
        padding: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#e74c3c',
        marginTop: 8,
    },
    dangerAlertTitle: {
        fontSize: 12.5,
        fontWeight: 'bold',
        color: '#c0392b',
        marginLeft: 5,
        flex: 1,
    },
    dangerAlertText: {
        fontSize: 12,
        color: '#922b21',
        marginTop: 2,
    },

    // ACCIONES
    actionSectionTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#0f294a',
        marginBottom: 10,
    },
    inputMiniLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 6,
    },
    textInputArea: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        padding: 10,
        fontSize: 13.5,
        color: '#1e293b',
        backgroundColor: '#ffffff',
        minHeight: 70,
        textAlignVertical: 'top',
        marginBottom: 12,
    },
    primaryActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#164a96',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    primaryActionBtnText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    secondaryActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: '#164a96',
        borderRadius: 10,
        paddingVertical: 10,
        marginTop: 10,
        backgroundColor: 'transparent',
    },
    secondaryActionBtnText: {
        color: '#164a96',
        fontWeight: 'bold',
        fontSize: 13,
    },

    // GRILLA PRIORIDAD
    priorityGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    priorityOptionCard: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    priorityOptionText: {
        fontSize: 13,
        fontWeight: 'bold',
    },

    // SELECTORES
    selectOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
        marginBottom: 6,
    },
    selectOptionRowActive: {
        borderColor: '#164a96',
        backgroundColor: '#eff6ff',
    },
    selectOptionText: {
        fontSize: 13,
        color: '#334155',
        marginLeft: 8,
    },
    selectOptionTextActive: {
        color: '#164a96',
        fontWeight: 'bold',
    },

    // CRONÓMETROS
    timerCard: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center',
    },
    timerCardLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
    },
    timerCardNumber: {
        fontSize: 15,
        fontWeight: 'bold',
        marginTop: 4,
    },
    uploadActaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderStyle: 'dashed',
        backgroundColor: '#f8fafc',
        marginBottom: 12,
    },
    actaUploadActions: { flexDirection: 'row', gap: 8 },
    actaUploadAction: { flex: 1, marginBottom: 12, minWidth: 0 },
    uploadActaBtnText: {
        fontSize: 13,
        color: '#164a96',
        fontWeight: '600',
    },

    // HISTORIAL METRICAS
    historyMetricsBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 6,
    },
    historyMetricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    historyMetricLabel: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
    },
    historyMetricValue: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#1e293b',
    },

    // ONDAS INFERIORES
    bottomWavesWrapper: {
        height: 44,
        width: '100%',
        overflow: 'hidden',
        marginTop: 10,
    },
    bottomWavesImg: {
        width: '100%',
        height: 44,
    },

    // MODALES INTERNOS
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxWidth: 480,
        alignSelf: 'center',
        elevation: 6,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#0f294a',
        marginBottom: 12,
        textAlign: 'center',
    },
    optionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    miniOption: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
    },
    miniOptionActive: {
        borderColor: '#164a96',
        backgroundColor: '#eff6ff',
    },
    miniOptionText: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 4,
        textAlign: 'center',
    },
    miniOptionTextActive: {
        color: '#164a96',
        fontWeight: 'bold',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
    },
    modalBtnCancel: {
        paddingVertical: 8,
        paddingHorizontal: 14,
    },
    modalBtnCancelText: {
        color: '#64748b',
        fontWeight: '600',
        fontSize: 14,
    },
    modalBtnSubmit: {
        backgroundColor: '#164a96',
        borderRadius: 8,
        paddingVertical: 9,
        paddingHorizontal: 18,
    },
    modalBtnSubmitText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
