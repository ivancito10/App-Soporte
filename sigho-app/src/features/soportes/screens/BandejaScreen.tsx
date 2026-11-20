import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    Modal,
    ScrollView,
    Image,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obtenerItem, eliminarItem } from '../../../core/utils/storage';
import { dispararAlertaInsistenciaDispositivo } from '../../../core/utils/notifications';
import { theme } from '../../../core/theme/theme';
import { obtenerBandeja } from '../api/soporte.service';
import { TicketSoporte, RolBandeja } from '../types/soporte.types';
import { CardTicket } from '../components/CardTicket';
import { MenuLateralModal } from '../../../core/components/MenuLateralModal';
import { AppIcon } from '../../../core/components/AppIcon';

export const BandejaScreen = ({ navigation, onLogout, rolActivo, rolesDisponibles = [], onCambiarRol }: any) => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const esEscritorio = Platform.OS === 'web' && width > 768;
    const paddingBottomNav = Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 12);

    const [tickets, setTickets] = useState<TicketSoporte[]>([]);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [rolUsuario, setRolUsuario] = useState<RolBandeja>((rolActivo as RolBandeja) || RolBandeja.USUARIO);
    const [tabActivo, setTabActivo] = useState<'PENDIENTES' | 'CONCLUIDAS'>('PENDIENTES');
    const [menuLateralVisible, setMenuLateralVisible] = useState(false);
    const tieneMultiplesRoles = Array.isArray(rolesDisponibles) && rolesDisponibles.length > 1;

    // ESTADOS DE LA CAMPANA DE NOTIFICACIONES Y ALERTA TIPO WHATSAPP
    const [modalCampanaVisible, setModalCampanaVisible] = useState(false);
    const [alertaEmergente, setAlertaEmergente] = useState<{
        ticket: TicketSoporte;
        mensaje: string;
    } | null>(null);
    const mapaInsistenciasRef = useRef<Record<number, number>>({});
    const primeraCargaRef = useRef<boolean>(true);

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
                const rol = (rolActivo || userData.rol || RolBandeja.OPERADOR) as RolBandeja;
                setRolUsuario(rol);

                const respuesta = await obtenerBandeja({ rol });

                if (!silencioso) {
                    console.log('DATOS QUE LLEGAN DEL BACKEND:', JSON.stringify(respuesta, null, 2));
                }

                const arregloTickets: TicketSoporte[] = Array.isArray(respuesta?.data || respuesta?.datos || respuesta)
                    ? (respuesta?.data || respuesta?.datos || respuesta)
                    : [];

                if (rol === RolBandeja.OPERADOR || rol === RolBandeja.TECNICO) {
                    arregloTickets.forEach((t) => {
                        const idT = Number(t.id_solicitud || t.id);
                        const cantActual = Number(t.cantidad_resolicitudes || 0);
                        const cantPrevia = mapaInsistenciasRef.current[idT] ?? 0;

                        if (!primeraCargaRef.current && cantActual > cantPrevia && t.estado !== 'FINALIZADA') {
                            const msg = `⚠️ Insistencia: El usuario de ${t.oficina} ${t.piso ? `(${t.piso})` : ''} requiere atención demorada`;
                            setAlertaEmergente({ ticket: t, mensaje: msg });
                            dispararAlertaInsistenciaDispositivo(`🔔 Ticket #${idT} Re-solicitado`, msg);
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

    // Métricas para las 3 tarjetas superiores de resumen (KPIs)
    const totalPendientesAsignados = tickets.filter(
        (t) => t.estado === 'PENDIENTE' || t.estado === 'ASIGNADA'
    ).length;
    const totalEnProceso = tickets.filter((t) => t.estado === 'EN_PROCESO').length;
    const totalActivos = tickets.filter((t) => t.estado !== 'FINALIZADA').length;
    const totalFinalizados = tickets.filter((t) => t.estado === 'FINALIZADA').length;

    const ticketsFiltrados = tickets.filter((ticket) => {
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
                { valor: totalActivos, etiqueta: 'En proceso' },
                { valor: totalFinalizados, etiqueta: 'Concluidas' },
                { valor: tickets.length, etiqueta: 'Total solicitudes' },
            ]
            : [
                { valor: totalPendientesAsignados, etiqueta: 'Pendientes' },
                { valor: totalEnProceso, etiqueta: 'En proceso' },
                { valor: totalFinalizados, etiqueta: 'Finalizadas' },
            ];

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
                    {tieneMultiplesRoles && (
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
                    {(rolUsuario === RolBandeja.OPERADOR || rolUsuario === RolBandeja.TECNICO) && (
                        <TouchableOpacity
                            style={[
                                styles.iconActionBtn,
                                ticketsConInsistencia.length > 0 && { backgroundColor: '#ef4444' },
                            ]}
                            onPress={() => setModalCampanaVisible(true)}
                            activeOpacity={0.75}
                        >
                            <AppIcon name="bell" size={19} color="#ffffff" />
                            {ticketsConInsistencia.length > 0 && (
                                <View style={styles.bellBadgeCount}>
                                    <Text style={styles.bellBadgeCountText}>
                                        {ticketsConInsistencia.length}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}

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
            <View style={styles.kpiRow}>
                {kpis.map((item, idx) => (
                    <View key={idx} style={styles.kpiCard}>
                        <Text style={styles.kpiNumber}>{item.valor}</Text>
                        <Text style={styles.kpiLabel}>{item.etiqueta}</Text>
                    </View>
                ))}
            </View>

            {/* 3. Subtítulo de la lista activa */}
            <Text style={styles.listHeadingText}>
                {tabActivo === 'PENDIENTES'
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
                            🔔 Nueva Notificación de Insistencia (Ticket #{alertaEmergente.ticket.id_solicitud || alertaEmergente.ticket.id})
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
                        onPress={() => setTabActivo('PENDIENTES')}
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
                        onPress={() => setTabActivo('CONCLUIDAS')}
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
                            {rolUsuario === RolBandeja.OPERADOR ? 'Historial y Actas' : 'Concluidas'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* MODAL DE LA CAMPANA DE NOTIFICACIONES (OPERADOR Y TÉCNICO) */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalCampanaVisible}
                onRequestClose={() => setModalCampanaVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, maxHeight: '80%', width: '100%', maxWidth: 520, alignSelf: 'center' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <Text style={{ fontSize: 17, fontWeight: 'bold', color: theme.colors.primary }}>
                                🔔 Notificaciones de Insistencia ({ticketsConInsistencia.length})
                            </Text>
                            <TouchableOpacity onPress={() => setModalCampanaVisible(false)} style={{ padding: 6 }}>
                                <Text style={{ fontSize: 18, color: '#666', fontWeight: 'bold' }}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {ticketsConInsistencia.length === 0 ? (
                            <Text style={{ textAlign: 'center', color: '#888', paddingVertical: 24 }}>
                                No hay insistencias pendientes en este momento.
                            </Text>
                        ) : (
                            <ScrollView>
                                {ticketsConInsistencia.map((t, idx) => {
                                    const idT = t.id_solicitud || t.id;
                                    return (
                                        <TouchableOpacity
                                            key={idT || idx}
                                            style={{
                                                padding: 12,
                                                borderRadius: 10,
                                                backgroundColor: '#fdecea',
                                                borderLeftWidth: 4,
                                                borderLeftColor: '#e74c3c',
                                                marginBottom: 10,
                                            }}
                                            onPress={() => {
                                                setModalCampanaVisible(false);
                                                navigation.navigate('TicketDetalle', { ticket: t, rolUsuario });
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ fontWeight: 'bold', color: '#c0392b', fontSize: 14 }}>
                                                    Ticket #{idT} — {t.oficina} {t.piso ? `(${t.piso})` : ''}
                                                </Text>
                                                <Text style={{ fontWeight: 'bold', color: '#e74c3c', fontSize: 12 }}>
                                                    {t.cantidad_resolicitudes} insistencia(s)
                                                </Text>
                                            </View>
                                            <Text style={{ fontSize: 13, color: '#333', marginTop: 4 }}>
                                                ⚠️ Insistencia: El usuario de {t.oficina} {t.piso ? `(${t.piso})` : ''} requiere atención demorada
                                            </Text>
                                            {t.ultima_resolicitud_motivo ? (
                                                <Text style={{ fontSize: 12, color: '#922b21', marginTop: 4, fontStyle: 'italic' }}>
                                                    Motivo: "{t.ultima_resolicitud_motivo}"
                                                </Text>
                                            ) : null}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* MENÚ LATERAL PARA CAMBIAR ENTRE ROLES */}
            <MenuLateralModal
                visible={menuLateralVisible}
                onClose={() => setMenuLateralVisible(false)}
                rolesDisponibles={rolesDisponibles}
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

    kpiRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 18,
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
    kpiNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0f4c9c',
    },
    kpiLabel: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
        textAlign: 'center',
        fontWeight: '500',
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
