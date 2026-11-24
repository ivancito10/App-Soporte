import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    TextInput,
    Modal,
    ScrollView,
    KeyboardAvoidingView,
    Image,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obtenerItem, eliminarItem } from '../../../core/utils/storage';
import { dispararAlertaInsistenciaDispositivo } from '../../../core/utils/notifications';
import { theme } from '../../../core/theme/theme';
import { crearSoporteManual, obtenerBandeja } from '../api/soporte.service';
import { TicketSoporte, RolBandeja } from '../types/soporte.types';
import { CardTicket } from '../components/CardTicket';
import { MenuLateralModal } from '../../../core/components/MenuLateralModal';
import { AppIcon } from '../../../core/components/AppIcon';
import { AppAlert } from '../../../core/components/AlertaGlobalModal';
import { NotificacionesCampana } from '../../../core/components/NotificacionesCampana';

export const BandejaScreen = ({ navigation, onLogout, rolActivo, rolesDisponibles = [], onCambiarRol, solicitudDesdeNotificacion, onNotificacionAbierta, onNotificacionSeleccionada }: any) => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const esEscritorio = Platform.OS === 'web' && width > 768;
    const paddingBottomNav = Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 12);

    const [tickets, setTickets] = useState<TicketSoporte[]>([]);
    const [ticketsDerivadas, setTicketsDerivadas] = useState<TicketSoporte[]>([]);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [rolUsuario, setRolUsuario] = useState<RolBandeja>((rolActivo as RolBandeja) || RolBandeja.USUARIO);
    const [tabActivo, setTabActivo] = useState<'PENDIENTES' | 'CONCLUIDAS'>('PENDIENTES');
    const [filtroKpi, setFiltroKpi] = useState<'PENDIENTES' | 'ASIGNADAS' | 'EN_PROCESO' | 'DERIVADAS' | 'FINALIZADAS' | 'ACTIVOS' | 'TODOS' | null>(null);
    const [menuLateralVisible, setMenuLateralVisible] = useState(false);
    const [modalSoporteManual, setModalSoporteManual] = useState(false);
    const [guardandoSoporteManual, setGuardandoSoporteManual] = useState(false);
    const [errorSoporteManual, setErrorSoporteManual] = useState('');
    const [formSoporteManual, setFormSoporteManual] = useState({
        solicitante_nombre: '',
        sede: '',
        oficina: '',
        piso: '',
        consultorio: '',
        descripcion: '',
        prioridad: 'MEDIA' as 'BAJA' | 'MEDIA' | 'ALTA',
    });
    const [nombreUsuario, setNombreUsuario] = useState('');
    const mostrarMenuCuenta = rolesDisponibles.length > 0;

    // ESTADOS DE LA CAMPANA DE NOTIFICACIONES Y ALERTA TIPO WHATSAPP
    const [alertaEmergente, setAlertaEmergente] = useState<{
        ticket: TicketSoporte;
        mensaje: string;
    } | null>(null);
    const mapaInsistenciasRef = useRef<Record<number, number>>({});
    const primeraCargaRef = useRef<boolean>(true);
    const solicitudNotificacionProcesadaRef = useRef<number | null>(null);
    const manualScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

    useEffect(() => {
        if (!alertaEmergente) return;
        const timer = setTimeout(() => {
            setAlertaEmergente(null);
        }, 5000);
        return () => clearTimeout(timer);
    }, [alertaEmergente]);

    const manejarCerrarSesion = async () => {
        await eliminarItem('jwtToken');
        await eliminarItem('userData');
        if (onLogout) onLogout();
    };

    const cargarDatos = useCallback(async (silencioso = false) => {
        try {
            const userDataStr = await obtenerItem('userData');
            if (userDataStr) {
                const userData = JSON.parse(userDataStr);
                setNombreUsuario(userData.nombreCompleto || userData.nombre_completo || userData.nombre || userData.username || '');
                const rol = (rolActivo || userData.rol || RolBandeja.OPERADOR) as RolBandeja;
                setRolUsuario(rol);

                const respuesta = await obtenerBandeja({ rol });

                if (!silencioso) {
                    console.log('DATOS QUE LLEGAN DEL BACKEND:', JSON.stringify(respuesta, null, 2));
                }

                const arregloTickets: TicketSoporte[] = Array.isArray(respuesta?.data || respuesta?.datos || respuesta)
                    ? (respuesta?.data || respuesta?.datos || respuesta)
                    : [];

                if (rol === RolBandeja.TECNICO) {
                    try {
                        const respuestaDerivadas = await obtenerBandeja({ rol, estado: 'DERIVADA' });
                        const listaDerivadas = respuestaDerivadas?.data || respuestaDerivadas?.datos || respuestaDerivadas;
                        setTicketsDerivadas(Array.isArray(listaDerivadas) ? listaDerivadas : []);
                    } catch (error) {
                        console.error('Error al cargar soportes derivados:', error);
                        setTicketsDerivadas([]);
                    }
                } else {
                    setTicketsDerivadas([]);
                }

                if (rol === RolBandeja.OPERADOR || rol === RolBandeja.TECNICO) {
                    arregloTickets.forEach((t) => {
                        const idT = Number(t.id_solicitud || t.id);
                        const cantActual = Number(t.cantidad_resolicitudes || 0);
                        const cantPrevia = mapaInsistenciasRef.current[idT] ?? 0;

                        if (!primeraCargaRef.current && cantActual > cantPrevia && t.estado !== 'FINALIZADA') {
                            const msg = `⚠️ Insistencia: El usuario de ${t.oficina} ${t.piso ? `(${t.piso})` : ''} requiere atención demorada`;
                            setAlertaEmergente({ ticket: t, mensaje: msg });
                            dispararAlertaInsistenciaDispositivo(`🔔 Ticket ${t.codigo_ticket || `#${idT}`} Re-solicitado`, msg);
                        }
                        mapaInsistenciasRef.current[idT] = cantActual;
                    });
                    primeraCargaRef.current = false;
                }

                setTickets(arregloTickets);
            }
        } catch (error) {
            if (!silencioso) {
                console.error('Error al cargar la bandeja:', error);
                setTickets([]);
            }
        } finally {
            if (!silencioso) {
                setCargando(false);
            }
            setRefrescando(false);
        }
    }, [rolActivo]);

    useEffect(() => {
        cargarDatos(false);

        let intervalo: ReturnType<typeof setInterval> | null = setInterval(() => {
            cargarDatos(true);
        }, 4000);

        const unsubscribeFocus = navigation.addListener('focus', () => {
            cargarDatos(true);
            if (!intervalo) {
                intervalo = setInterval(() => {
                    cargarDatos(true);
                }, 4000);
            }
        });

        const unsubscribeBlur = navigation.addListener('blur', () => {
            if (intervalo) {
                clearInterval(intervalo);
                intervalo = null;
            }
        });

        return () => {
            if (intervalo) clearInterval(intervalo);
            unsubscribeFocus();
            unsubscribeBlur();
        };
    }, [navigation, cargarDatos]);

    const onRefresh = useCallback(() => {
        setRefrescando(true);
        cargarDatos(true);
    }, [cargarDatos]);

    const guardarSoporteManual = async () => {
        const sedeLimpia = formSoporteManual.sede.trim();
        const oficinaLimpia = formSoporteManual.oficina.trim();
        if (!formSoporteManual.solicitante_nombre.trim() || !sedeLimpia || !formSoporteManual.descripcion.trim()) {
            setErrorSoporteManual('Completa el nombre de quien solicitó, la sede y el problema.');
            return;
        }

        const ubicacionCombinada = [sedeLimpia, oficinaLimpia].filter(Boolean).join(' - ').slice(0, 100);

        setGuardandoSoporteManual(true);
        setErrorSoporteManual('');
        try {
            await crearSoporteManual({
                solicitante_nombre: formSoporteManual.solicitante_nombre.trim(),
                oficina: ubicacionCombinada,
                piso: formSoporteManual.piso.trim() || undefined,
                consultorio: formSoporteManual.consultorio.trim() || undefined,
                descripcion: formSoporteManual.descripcion.trim(),
                prioridad: formSoporteManual.prioridad,
            });
            setModalSoporteManual(false);
            setFormSoporteManual({ solicitante_nombre: '', sede: '', oficina: '', piso: '', consultorio: '', descripcion: '', prioridad: 'MEDIA' });
            setTabActivo('PENDIENTES');
            setFiltroKpi(null);
            await cargarDatos(true);
            AppAlert.alert('Soporte registrado', 'El soporte quedó registrado y está en proceso.');
        } catch (error: any) {
            setErrorSoporteManual(error?.response?.data?.message || 'No se pudo registrar el soporte manual.');
        } finally {
            setGuardandoSoporteManual(false);
        }
    };

    // Métricas para las 3 tarjetas superiores de resumen (KPIs)
    const totalPendientes = tickets.filter((t) => t.estado === 'PENDIENTE').length;
    const totalAsignadas = tickets.filter((t) => t.estado === 'ASIGNADA').length;
    const totalEnProceso = tickets.filter((t) => t.estado === 'EN_PROCESO').length;
    const totalActivos = tickets.filter((t) => t.estado !== 'FINALIZADA').length;
    const totalFinalizados = tickets.filter((t) => t.estado === 'FINALIZADA').length;

    const ticketsFiltrados = filtroKpi === 'DERIVADAS' ? ticketsDerivadas : tickets.filter((ticket) => {
        if (filtroKpi === 'PENDIENTES') return rolUsuario === RolBandeja.TECNICO ? ticket.estado === 'ASIGNADA' : ticket.estado === 'PENDIENTE';
        if (filtroKpi === 'ASIGNADAS') return ticket.estado === 'ASIGNADA';
        if (filtroKpi === 'EN_PROCESO') return ticket.estado === 'EN_PROCESO';
        if (filtroKpi === 'FINALIZADAS') return ticket.estado === 'FINALIZADA';
        if (filtroKpi === 'ACTIVOS') return ticket.estado !== 'FINALIZADA';
        if (filtroKpi === 'TODOS') return true;
        if (tabActivo === 'PENDIENTES') {
            return ticket.estado !== 'FINALIZADA';
        } else {
            return ticket.estado === 'FINALIZADA';
        }
    });

    const ticketsConInsistencia = tickets.filter(
        (t) => t.estado !== 'FINALIZADA' && Number(t.cantidad_resolicitudes || 0) > 0
    );

    const kpis =
        rolUsuario === RolBandeja.USUARIO
            ? [
                { valor: totalActivos, etiqueta: 'En proceso', filtro: 'ACTIVOS' as const, tab: 'PENDIENTES' as const },
                { valor: totalFinalizados, etiqueta: 'Concluidas', filtro: 'FINALIZADAS' as const, tab: 'CONCLUIDAS' as const },
                { valor: tickets.length, etiqueta: 'Total solicitudes', filtro: 'TODOS' as const, tab: 'PENDIENTES' as const },
            ]
            : rolUsuario === RolBandeja.OPERADOR
                ? [
                    { valor: totalPendientes, etiqueta: 'Pendientes', filtro: 'PENDIENTES' as const, tab: 'PENDIENTES' as const },
                    { valor: totalAsignadas, etiqueta: 'Asignadas', filtro: 'ASIGNADAS' as const, tab: 'PENDIENTES' as const },
                    { valor: totalEnProceso, etiqueta: 'En proceso', filtro: 'EN_PROCESO' as const, tab: 'PENDIENTES' as const },
                    { valor: totalFinalizados, etiqueta: 'Finalizadas', filtro: 'FINALIZADAS' as const, tab: 'CONCLUIDAS' as const },
                ]
                : [
                    { valor: totalAsignadas, etiqueta: 'Pendientes', filtro: 'PENDIENTES' as const, tab: 'PENDIENTES' as const },
                    { valor: totalEnProceso, etiqueta: 'En proceso', filtro: 'EN_PROCESO' as const, tab: 'PENDIENTES' as const },
                    { valor: ticketsDerivadas.length, etiqueta: 'Derivadas', filtro: 'DERIVADAS' as const, tab: 'CONCLUIDAS' as const },
                    { valor: totalFinalizados, etiqueta: 'Finalizadas', filtro: 'FINALIZADAS' as const, tab: 'CONCLUIDAS' as const },
                ];

    useEffect(() => {
        if (!solicitudDesdeNotificacion) {
            solicitudNotificacionProcesadaRef.current = null;
            return;
        }
        const idObjetivo = Number(solicitudDesdeNotificacion);
        if (solicitudNotificacionProcesadaRef.current === idObjetivo) return;
        const listaCombinada = [...tickets, ...ticketsDerivadas];
        const ticketObjetivo = listaCombinada.find(
            (ticket) => Number(ticket.id_solicitud || ticket.id) === idObjetivo
        );
        if (!ticketObjetivo) return;
        solicitudNotificacionProcesadaRef.current = idObjetivo;
        navigation.navigate('TicketDetalle', { ticket: ticketObjetivo, rolUsuario });
        onNotificacionAbierta?.();
    }, [solicitudDesdeNotificacion, rolUsuario, tickets, ticketsDerivadas, navigation, onNotificacionAbierta]);

    const renderCabecera = () => (
        <View style={styles.topHeader}>
            <View
                style={[
                    styles.topBarRow,
                    esEscritorio && { maxWidth: 880, alignSelf: 'center' },
                ]}
            >
                {/* Izquierda: [ ☰ ] + [ Logo SSU ] */}
                <View style={styles.leftBarGroup}>
                    {mostrarMenuCuenta && (
                        <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => setMenuLateralVisible(true)}
                            activeOpacity={0.75}
                        >
                            <AppIcon name="menu" size={20} color="#ffffff" />
                        </TouchableOpacity>
                    )}

                    <Image
                        source={require('../../../../assets/7.png')}
                        style={{
                            width: esEscritorio ? 90 : 70,
                            height: esEscritorio ? 36 : 28,
                        }}
                        resizeMode="contain"
                    />
                </View>

                {/* Centro: Título limpio */}
                <Text style={styles.navBarTitle} numberOfLines={1}>
                    Bandeja de Soportes
                </Text>

                {/* Derecha: Campana + Icono Salir */}
                <View style={styles.rightBarGroup}>
                    <NotificacionesCampana
                        buttonStyle={[
                            styles.iconActionBtn,
                            ticketsConInsistencia.length > 0 && { backgroundColor: '#ef4444' },
                        ]}
                        insistencias={ticketsConInsistencia.map((ticket) => {
                            const id = Number(ticket.id_solicitud || ticket.id);
                            return {
                                id,
                                titulo: `Ticket ${ticket.codigo_ticket || `#${id}`} — ${ticket.oficina || 'Soporte'}`,
                                mensaje: `El usuario requiere atención (${ticket.cantidad_resolicitudes} insistencia(s)).`,
                                detalle: ticket.ultima_resolicitud_motivo ? `Motivo: ${ticket.ultima_resolicitud_motivo}` : undefined,
                            };
                        })}
                        onSeleccionarInsistencia={(id) => {
                            const ticket = tickets.find((item) => Number(item.id_solicitud || item.id) === id);
                            if (ticket) navigation.navigate('TicketDetalle', { ticket, rolUsuario });
                        }}
                        onSeleccionar={(notificacion) => onNotificacionSeleccionada?.(notificacion)}
                    />

                    <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={manejarCerrarSesion}
                        activeOpacity={0.75}
                    >
                        <AppIcon name="logout" size={19} color="#ffffff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Onda superior curva en la base de la barra azul */}
            <Image
                source={require('../../../../assets/ondas-superiores.png')}
                style={styles.headerBottomWave}
                resizeMode="stretch"
            />
        </View>
    );

    const renderEncabezadoLista = () => (
        <View>
            {/* 1. Título de sección con icono circular azul */}
            <View style={styles.sectionBannerRow}>
                <View style={styles.blueCircleIcon}>
                    <AppIcon name="home" size={20} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.sectionBannerTitle}>
                        {rolUsuario === RolBandeja.OPERADOR
                            ? 'Gestión y asignación de soportes'
                            : rolUsuario === RolBandeja.TECNICO
                                ? 'Mis soportes técnicos asignados'
                                : 'Mis solicitudes de soporte'}
                    </Text>
                    <Text style={styles.sectionBannerSub}>
                        Modo activo: {rolUsuario}
                    </Text>
                </View>
            </View>

            {/* 2. Tres tarjetas KPI de resumen */}
            <View style={[styles.kpiRow, kpis.length === 4 && styles.kpiGridFour]}>
                {kpis.map((item, idx) => (
                    <TouchableOpacity
                        key={idx}
                        style={[styles.kpiCard, kpis.length === 4 && styles.kpiCardFour, filtroKpi === item.filtro && styles.kpiCardActive]}
                        onPress={() => {
                            setFiltroKpi((actual) => actual === item.filtro ? null : item.filtro);
                            setTabActivo(item.tab);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: filtroKpi === item.filtro }}
                        activeOpacity={0.78}
                    >
                        <Text style={[styles.kpiNumber, kpis.length === 4 && width < 390 && styles.kpiNumberCompact]}>{item.valor}</Text>
                        <Text style={[styles.kpiLabel, kpis.length === 4 && width < 390 && styles.kpiLabelCompact]}>{item.etiqueta}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {rolUsuario === RolBandeja.TECNICO && (
                <TouchableOpacity
                    style={styles.manualSupportButton}
                    onPress={() => {
                        setErrorSoporteManual('');
                        setModalSoporteManual(true);
                    }}
                    activeOpacity={0.82}
                >
                    <AppIcon name="plus" size={17} color="#ffffff" />
                    <Text style={styles.manualSupportButtonText}>Registrar soporte manual</Text>
                </TouchableOpacity>
            )}

            {/* 3. Subtítulo de la lista activa */}
            <Text style={styles.listHeadingText}>
                {filtroKpi === 'DERIVADAS'
                    ? 'Soportes derivados por ti'
                    : filtroKpi === 'PENDIENTES'
                        ? rolUsuario === RolBandeja.OPERADOR ? 'Solicitudes pendientes de asignación' : 'Soportes pendientes de atención'
                    : filtroKpi === 'ASIGNADAS'
                        ? 'Soportes asignados a técnicos'
                        : filtroKpi === 'EN_PROCESO'
                            ? 'Soportes en proceso'
                            : tabActivo === 'PENDIENTES'
                    ? rolUsuario === RolBandeja.OPERADOR
                        ? 'Nuevos y pendientes de atención'
                        : 'Soportes en proceso'
                    : rolUsuario === RolBandeja.OPERADOR
                        ? 'Últimos soportes finalizados y actas'
                        : 'Historial de soportes concluidos'}
            </Text>
        </View>
    );

    if (cargando) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderCabecera()}

            {/* BANNER FLOTANTE CUANDO LLEGA UNA NUEVA INSISTENCIA */}
            {alertaEmergente && (
                <View
                    style={[
                        styles.emergentAlertBanner,
                        esEscritorio && { width: '100%', maxWidth: 880, alignSelf: 'center' },
                    ]}
                >
                    <TouchableOpacity
                        style={{ flex: 1, marginRight: 10 }}
                        onPress={() => {
                            const t = alertaEmergente.ticket;
                            setAlertaEmergente(null);
                            navigation.navigate('TicketDetalle', { ticket: t, rolUsuario });
                        }}
                    >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                            🔔 Nueva Notificación de Insistencia (Ticket {alertaEmergente.ticket.codigo_ticket || `#${alertaEmergente.ticket.id_solicitud || alertaEmergente.ticket.id}`})
                        </Text>
                        <Text style={{ color: '#eafaf1', fontSize: 13, marginTop: 2 }}>
                            {alertaEmergente.mensaje}
                        </Text>
                        {alertaEmergente.ticket.ultima_resolicitud_motivo ? (
                            <Text style={{ color: '#fff', fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>
                                "{alertaEmergente.ticket.ultima_resolicitud_motivo}" — Toca para abrir
                            </Text>
                        ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAlertaEmergente(null)} style={{ padding: 6 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* CONTENIDO PRINCIPAL */}
            <View style={{ flex: 1 }}>
                <FlatList
                    data={ticketsFiltrados}
                    keyExtractor={(item, index) =>
                        `${item.id_solicitud || item.id || 't'}-${item.id_asignacion || 'a'}-${index}`
                    }
                    ListHeaderComponent={renderEncabezadoLista}
                    contentContainerStyle={[
                        styles.listContainer,
                        { paddingBottom: 120 },
                        esEscritorio && { width: '100%', maxWidth: 912, alignSelf: 'center' },
                    ]}
                    renderItem={({ item }) => (
                        <CardTicket
                            ticket={item}
                            mostrarTiempoEnVivo={rolUsuario === RolBandeja.OPERADOR}
                            ocultarTiempos={rolUsuario === RolBandeja.USUARIO}
                            onPress={() =>
                                navigation.navigate('TicketDetalle', {
                                    ticket: item,
                                    rolUsuario: rolUsuario,
                                })
                            }
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyCardBox}>
                            <Text style={styles.emptyCardText}>
                                No hay solicitudes registradas en esta sección.
                            </Text>
                        </View>
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={refrescando}
                            onRefresh={onRefresh}
                            colors={[theme.colors.primary]}
                        />
                    }
                />

                {/* Ondas celestes decorativas justo encima de la barra inferior */}
                <View style={styles.bottomWavesWrapper} pointerEvents="none">
                    <Image
                        source={require('../../../../assets/ondas-inferiores.png')}
                        style={styles.bottomWavesImg}
                        resizeMode="stretch"
                    />
                </View>

                {/* BOTÓN FLOTANTE VERDE ESMERALDA ESTILO "Nueva cita" (SOLO USUARIO) */}
                {rolUsuario === RolBandeja.USUARIO && (
                    <TouchableOpacity
                        style={styles.emeraldFab}
                        onPress={() => navigation.navigate('CrearSolicitud')}
                        activeOpacity={0.85}
                    >
                        <AppIcon name="plus" size={16} color="#ffffff" />
                        <Text style={[styles.emeraldFabText, { marginLeft: 7 }]}>Nueva solicitud</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* BARRA DE NAVEGACIÓN INFERIOR (BOTTOM NAVIGATION BAR) */}
            <View style={[styles.bottomNavBar, { paddingBottom: paddingBottomNav }]}>
                <View
                    style={[
                        styles.bottomNavInner,
                        esEscritorio && { maxWidth: 880, alignSelf: 'center' },
                    ]}
                >
                    <TouchableOpacity
                        style={[
                            styles.bottomNavTab,
                            tabActivo === 'PENDIENTES' && styles.bottomNavTabActive,
                        ]}
                        onPress={() => { setTabActivo('PENDIENTES'); setFiltroKpi(null); }}
                        activeOpacity={0.8}
                    >
                        <AppIcon
                            name="clipboard"
                            size={17}
                            color={tabActivo === 'PENDIENTES' ? '#ffffff' : '#475569'}
                        />
                        <Text
                            style={[
                                styles.bottomNavLabel,
                                { marginTop: 3 },
                                tabActivo === 'PENDIENTES' && styles.bottomNavTextActive,
                            ]}
                        >
                            {rolUsuario === RolBandeja.OPERADOR ? 'Nuevos y Pendientes' : 'En Proceso'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.bottomNavTab,
                            tabActivo === 'CONCLUIDAS' && styles.bottomNavTabActive,
                        ]}
                        onPress={() => { setTabActivo('CONCLUIDAS'); setFiltroKpi(null); }}
                        activeOpacity={0.8}
                    >
                        <AppIcon
                            name="folder"
                            size={17}
                            color={tabActivo === 'CONCLUIDAS' ? '#ffffff' : '#475569'}
                        />
                        <Text
                            style={[
                                styles.bottomNavLabel,
                                { marginTop: 3 },
                                tabActivo === 'CONCLUIDAS' && styles.bottomNavTextActive,
                            ]}
                        >
                            {rolUsuario === RolBandeja.OPERADOR ? 'Historial y Actas' : rolUsuario === RolBandeja.TECNICO ? 'Historial' : 'Concluidas'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal
                visible={modalSoporteManual}
                transparent
                statusBarTranslucent
                animationType="fade"
                onRequestClose={() => setModalSoporteManual(false)}
            >
                <KeyboardAvoidingView
                    style={styles.manualModalBackdrop}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 16}
                >
                    <View style={styles.manualModal}>
                        <View style={styles.manualModalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.manualModalTitle}>Registrar soporte manual</Text>
                                <Text style={styles.manualModalSubtitle}>Se guardará asignado a ti y en proceso desde ahora.</Text>
                            </View>
                            <TouchableOpacity onPress={() => setModalSoporteManual(false)} style={styles.manualCloseButton}>
                                <AppIcon name="close" size={17} color="#475569" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            ref={manualScrollRef}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        >
                            <Text style={styles.manualFieldLabel}>Nombre de quien solicitó *</Text>
                            <TextInput
                                style={styles.manualInput}
                                value={formSoporteManual.solicitante_nombre}
                                onChangeText={(valor) => setFormSoporteManual((actual) => ({ ...actual, solicitante_nombre: valor }))}
                                placeholder="Nombre del funcionario"
                                maxLength={180}
                            />

                            <View style={styles.manualFieldsRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.manualFieldLabel}>Sede *</Text>
                                    <TextInput
                                        style={styles.manualInput}
                                        value={formSoporteManual.sede}
                                        onChangeText={(valor) => setFormSoporteManual((actual) => ({ ...actual, sede: valor }))}
                                        placeholder="Ej. Central"
                                        maxLength={45}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.manualFieldLabel}>Oficina</Text>
                                    <TextInput
                                        style={styles.manualInput}
                                        value={formSoporteManual.oficina}
                                        onChangeText={(valor) => setFormSoporteManual((actual) => ({ ...actual, oficina: valor }))}
                                        placeholder="Opcional"
                                        maxLength={50}
                                    />
                                </View>
                            </View>

                            <View style={styles.manualFieldsRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.manualFieldLabel}>Piso</Text>
                                    <TextInput
                                        style={styles.manualInput}
                                        value={formSoporteManual.piso}
                                        onChangeText={(valor) => setFormSoporteManual((actual) => ({ ...actual, piso: valor }))}
                                        placeholder="Opcional"
                                        maxLength={100}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.manualFieldLabel}>Consultorio</Text>
                                    <TextInput
                                        style={styles.manualInput}
                                        value={formSoporteManual.consultorio}
                                        onChangeText={(valor) => setFormSoporteManual((actual) => ({ ...actual, consultorio: valor }))}
                                        placeholder="Opcional"
                                        maxLength={100}
                                    />
                                </View>
                            </View>

                            <Text style={styles.manualFieldLabel}>Problema reportado *</Text>
                            <TextInput
                                style={[styles.manualInput, styles.manualDescriptionInput]}
                                value={formSoporteManual.descripcion}
                                onChangeText={(valor) => setFormSoporteManual((actual) => ({ ...actual, descripcion: valor }))}
                                onFocus={() => {
                                    setTimeout(() => {
                                        manualScrollRef.current?.scrollToEnd({ animated: true });
                                    }, 160);
                                }}
                                placeholder="Describe el problema y el trabajo realizado hasta ahora"
                                multiline
                                textAlignVertical="top"
                                maxLength={3000}
                            />

                            <Text style={styles.manualFieldLabel}>Prioridad</Text>
                            <View style={styles.manualPriorityRow}>
                                {(['BAJA', 'MEDIA', 'ALTA'] as const).map((prioridad) => (
                                    <TouchableOpacity
                                        key={prioridad}
                                        style={[
                                            styles.manualPriorityOption,
                                            formSoporteManual.prioridad === prioridad && styles.manualPrioritySelected,
                                        ]}
                                        onPress={() => setFormSoporteManual((actual) => ({ ...actual, prioridad }))}
                                    >
                                        <Text style={[
                                            styles.manualPriorityText,
                                            formSoporteManual.prioridad === prioridad && styles.manualPriorityTextSelected,
                                        ]}>{prioridad}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {!!errorSoporteManual && <Text style={styles.manualError}>{errorSoporteManual}</Text>}

                            <View style={styles.manualActionsRow}>
                                <TouchableOpacity
                                    style={styles.manualCancelButton}
                                    onPress={() => setModalSoporteManual(false)}
                                    disabled={guardandoSoporteManual}
                                >
                                    <Text style={styles.manualCancelText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.manualSaveButton, guardandoSoporteManual && { opacity: 0.65 }]}
                                    onPress={() => void guardarSoporteManual()}
                                    disabled={guardandoSoporteManual}
                                >
                                    {guardandoSoporteManual
                                        ? <ActivityIndicator color="#ffffff" size="small" />
                                        : <Text style={styles.manualSaveText}>Guardar en proceso</Text>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* MENÚ LATERAL PARA CAMBIAR ENTRE ROLES */}
            <MenuLateralModal
                visible={menuLateralVisible}
                onClose={() => setMenuLateralVisible(false)}
                rolesDisponibles={rolesDisponibles}
                nombreUsuario={nombreUsuario}
                rolActivo={rolUsuario}
                onSelectRol={(nuevoRol) => {
                    if (onCambiarRol) onCambiarRol(nuevoRol);
                }}
                onLogout={manejarCerrarSesion}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },

    // CABECERA AZUL CON ONDA CURVA
    topHeader: {
        backgroundColor: '#164a96',
        paddingTop: Platform.OS === 'web' ? 18 : 42,
        paddingBottom: 34,
        position: 'relative',
        overflow: 'hidden',
    },
    topBarRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    leftBarGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    navBarTitle: {
        color: '#ffffff',
        fontSize: Platform.OS === 'web' ? 17 : 15,
        fontWeight: 'bold',
        textAlign: 'center',
        flex: 1,
        marginHorizontal: 4,
    },
    rightBarGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconActionBtn: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.14)',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    bellBadgeCount: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#ffffff',
        borderRadius: 9,
        paddingHorizontal: 5,
        paddingVertical: 1,
        minWidth: 18,
        alignItems: 'center',
    },
    bellBadgeCountText: {
        color: '#dc2626',
        fontSize: 10,
        fontWeight: 'bold',
    },
    headerBottomWave: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: 32,
    },

    // BANNER DE SECCIÓN Y TARJETAS KPI
    sectionBannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        marginTop: 4,
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
        fontSize: 16.5,
        fontWeight: 'bold',
        color: '#0f294a',
    },
    sectionBannerSub: {
        fontSize: 12.5,
        color: '#475569',
        marginTop: 1,
    },
    manualSupportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#0f4c9c',
        borderRadius: 12,
        paddingVertical: 11,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    manualSupportButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
    manualModalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 16 },
    manualModal: { width: '100%', maxWidth: 540, maxHeight: '92%', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 18, padding: 18 },
    manualModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    manualModalTitle: { color: '#173b70', fontSize: 19, fontWeight: '800' },
    manualModalSubtitle: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 3 },
    manualCloseButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
    manualFieldLabel: { color: '#334155', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 5 },
    manualInput: { minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: '#0f172a', backgroundColor: '#ffffff', fontSize: 14 },
    manualDescriptionInput: { height: 95, paddingTop: 10 },
    manualFieldsRow: { flexDirection: 'row', gap: 10 },
    manualPriorityRow: { flexDirection: 'row', gap: 8 },
    manualPriorityOption: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
    manualPrioritySelected: { borderColor: '#1d4ed8', backgroundColor: '#eff6ff' },
    manualPriorityText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    manualPriorityTextSelected: { color: '#1d4ed8' },
    manualError: { color: '#b91c1c', fontSize: 12, marginTop: 10 },
    manualActionsRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 4 },
    manualCancelButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 12 },
    manualCancelText: { color: '#475569', fontWeight: '700', fontSize: 13 },
    manualSaveButton: { flex: 1.4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f4c9c', borderRadius: 10, paddingVertical: 12 },
    manualSaveText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

    kpiRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 18,
    },
    kpiGridFour: {
        flexWrap: 'nowrap',
        gap: 5,
    },
    kpiCard: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        elevation: 2,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    kpiCardFour: {
        flexBasis: 0,
        paddingHorizontal: 2,
    },
    kpiCardActive: {
        borderColor: '#1d68d8',
        backgroundColor: '#eff6ff',
        borderWidth: 2,
    },
    kpiNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0f4c9c',
    },
    kpiNumberCompact: {
        fontSize: 17,
    },
    kpiLabel: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
        textAlign: 'center',
        fontWeight: '500',
    },
    kpiLabelCompact: {
        fontSize: 9,
    },

    listHeadingText: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#0f294a',
        marginBottom: 12,
    },

    listContainer: {
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    emptyCardBox: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 18,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    emptyCardText: {
        color: '#475569',
        fontSize: 13.5,
    },

    emergentAlertBanner: {
        backgroundColor: '#1e8449',
        marginHorizontal: 16,
        marginTop: 10,
        padding: 14,
        borderRadius: 12,
        elevation: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    // ONDAS INFERIORES + BOTÓN FLOTANTE VERDE ESMERALDA
    bottomWavesWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 46,
        overflow: 'hidden',
    },
    bottomWavesImg: {
        width: '100%',
        height: 46,
    },
    emeraldFab: {
        position: 'absolute',
        right: 18,
        bottom: 16,
        backgroundColor: '#179b6b',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 28,
        elevation: 6,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
    },
    emeraldFabIcon: {
        color: '#ffffff',
        fontSize: 14,
        marginRight: 7,
    },
    emeraldFabText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },

    // BARRA DE NAVEGACIÓN INFERIOR (ESTILO SIGHOV2)
    bottomNavBar: {
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 8,
        paddingHorizontal: 14,
        elevation: 10,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
    },
    bottomNavInner: {
        flexDirection: 'row',
        width: '100%',
        gap: 10,
    },
    bottomNavTab: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    bottomNavTabActive: {
        backgroundColor: '#0f4c9c',
    },
    bottomNavIcon: {
        fontSize: 16,
        color: '#475569',
        marginBottom: 2,
    },
    bottomNavLabel: {
        fontSize: 11.5,
        fontWeight: '600',
        color: '#475569',
    },
    bottomNavTextActive: {
        color: '#ffffff',
        fontWeight: 'bold',
    },
});
