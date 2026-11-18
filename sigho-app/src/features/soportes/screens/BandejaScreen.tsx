import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, ScrollView, Image, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obtenerItem, eliminarItem } from '../../../core/utils/storage';
import { dispararAlertaInsistenciaDispositivo } from '../../../core/utils/notifications';
import { theme } from '../../../core/theme/theme';
import { obtenerBandeja } from '../api/soporte.service';
import { TicketSoporte, RolBandeja } from '../types/soporte.types';
import { CardTicket } from '../components/CardTicket';
import { MenuLateralModal } from '../../../core/components/MenuLateralModal';

export const BandejaScreen = ({ navigation, onLogout, rolActivo, rolesDisponibles = [], onCambiarRol }: any) => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const esEscritorio = Platform.OS === 'web' && width > 768;
    // Margen inferior seguro en Android para evitar que los 3 botones de navegación tapen el botón '+'
    const margenInferiorSeguro = Platform.OS === 'web' ? 24 : Math.max(insets.bottom, 48) + 18;

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
        if (onLogout) onLogout(); // Esto devuelve al usuario al LoginScreen inmediatamente
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

                const arregloTickets: TicketSoporte[] = Array.isArray( respuesta?.data || respuesta?.datos || respuesta)
                    ? (respuesta?.data || respuesta?.datos || respuesta)
                    : [];

                // Detectar si llegó una NUEVA insistencia para Operador o Técnico
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
                setTickets([]); // Si hay error en carga inicial, vaciamos la lista para evitar fallos
            }
        } finally {
            if (!silencioso) {
                setCargando(false);
            }
            setRefrescando(false);
        }
    }, [rolActivo]);

    useEffect(() => {
        // 1. Carga los datos la primera vez que se abre la pantalla
        cargarDatos(false);

        // 2. Auto-actualización en segundo plano cada 4 segundos mientras la bandeja esté activa
        let intervalo: ReturnType<typeof setInterval> | null = setInterval(() => {
            cargarDatos(true);
        }, 4000);

        // 3. 'focus' y 'blur' para reactivar/pausar el refresco al navegar entre pantallas
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

        // Limpiamos el detector y el temporizador cuando la pantalla se destruya
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

    // FILTRO SEGURO: Usamos el arreglo garantizado
    const ticketsFiltrados = tickets.filter(ticket => {
        if (tabActivo === 'PENDIENTES') {
            return ticket.estado !== 'FINALIZADA';
        } else {
            return ticket.estado === 'FINALIZADA';
        }
    });

    // Tickets activos que tienen insistencias / re-solicitudes
    const ticketsConInsistencia = tickets.filter(
        (t) => t.estado !== 'FINALIZADA' && Number(t.cantidad_resolicitudes || 0) > 0
    );

    const renderCabecera = () => (
        <View style={[styles.header, !esEscritorio && { paddingTop: 42 }]}>
            {/* Barra superior de acciones: Logo SSU (Izquierda) y Campana + Salir (Derecha) */}
            <View style={[
                {
                    width: '100%',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: esEscritorio ? 4 : 10,
                },
                esEscritorio && { maxWidth: 880, alignSelf: 'center' }
            ]}>
                {/* Grupo superior izquierdo: [ ☰ ] + [ Logo SSU La Paz ] */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {tieneMultiplesRoles && (
                        <TouchableOpacity
                            style={{
                                width: esEscritorio ? 44 : 38,
                                height: esEscritorio ? 44 : 38,
                                borderRadius: 8,
                                backgroundColor: 'rgba(255,255,255,0.22)',
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.4)',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                            onPress={() => setMenuLateralVisible(true)}
                            activeOpacity={0.75}
                        >
                            <Text style={{ color: '#ffffff', fontSize: esEscritorio ? 22 : 20, fontWeight: 'bold', lineHeight: 24 }}>
                                ☰
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View style={{
                        backgroundColor: '#ffffff',
                        borderRadius: 8,
                        paddingHorizontal: esEscritorio ? 8 : 6,
                        paddingVertical: esEscritorio ? 4 : 3,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.15,
                        shadowRadius: 2,
                    }}>
                        <Image
                            source={require('../../../../assets/ssu-logo.png')}
                            style={{
                                width: esEscritorio ? 105 : 74,
                                height: esEscritorio ? 44 : 31,
                            }}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                {/* Contenedor superior derecho: Campana de Notificaciones (Operador/Técnico) + Botón Salir */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {(rolUsuario === RolBandeja.OPERADOR || rolUsuario === RolBandeja.TECNICO) && (
                        <TouchableOpacity
                            style={{
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                backgroundColor: ticketsConInsistencia.length > 0 ? '#e74c3c' : 'rgba(255,255,255,0.2)',
                                borderRadius: 20,
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}
                            onPress={() => setModalCampanaVisible(true)}
                        >
                            <Text style={{ fontSize: 16 }}>🔔</Text>
                            {ticketsConInsistencia.length > 0 && (
                                <View style={{ marginLeft: 5, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                                    <Text style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: 12 }}>
                                        {ticketsConInsistencia.length}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: 'rgba(255,0,0,0.75)', borderRadius: 6 }}
                        onPress={manejarCerrarSesion}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Salir</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={styles.headerTitle}>Bandeja de Soportes</Text>
            <Text style={styles.headerSubtitle}>Modo: {rolUsuario}</Text>

            {/* CORRECCIÓN ANDROID: Quitamos la restricción de rol para que todos vean las pestañas */}
            <View style={[styles.tabsContainer, esEscritorio && { maxWidth: 880, alignSelf: 'center' }]}>
                <TouchableOpacity
                    style={[styles.tabButton, tabActivo === 'PENDIENTES' && styles.tabActivo]}
                    onPress={() => setTabActivo('PENDIENTES')}
                >
                    <Text style={[styles.tabText, tabActivo === 'PENDIENTES' && styles.tabTextActivo]}>
                        {rolUsuario === RolBandeja.OPERADOR ? 'Nuevos y Pendientes' : 'En Proceso'}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, tabActivo === 'CONCLUIDAS' && styles.tabActivo]}
                    onPress={() => setTabActivo('CONCLUIDAS')}
                >
                    <Text style={[styles.tabText, tabActivo === 'CONCLUIDAS' && styles.tabTextActivo]}>
                        {rolUsuario === RolBandeja.OPERADOR ? 'Historial y Actas' : 'Concluidas'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (cargando) return <View style={styles.centerContainer}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

    return (
        <View style={styles.container}>
            {renderCabecera()}

            {/* BANNER FLOTANTE ESTILO WHATSAPP CUANDO LLEGA UNA NUEVA INSISTENCIA */}
            {alertaEmergente && (
                <View style={[{
                    backgroundColor: '#1e8449',
                    marginHorizontal: 16,
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 10,
                    elevation: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }, esEscritorio && { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
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

            <FlatList
                data={ticketsFiltrados}
                keyExtractor={(item, index) => `${item.id_solicitud || item.id || 't'}-${item.id_asignacion || 'a'}-${index}`}
                contentContainerStyle={[
                    styles.listContainer,
                    { paddingBottom: margenInferiorSeguro + 70 },
                    esEscritorio && { width: '100%', maxWidth: 912, alignSelf: 'center' }
                ]}
                renderItem={({ item }) => (
                    <CardTicket
                        ticket={item}
                        onPress={() => navigation.navigate('TicketDetalle', {
                            ticket: item,
                            rolUsuario: rolUsuario
                        })}
                    />
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No hay solicitudes en esta sección.</Text>}
                refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
            />

            {/* MODAL DE LA CAMPANA DE NOTIFICACIONES (OPERADOR Y TÉCNICO) */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalCampanaVisible}
                onRequestClose={() => setModalCampanaVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '80%', width: '100%', maxWidth: 520, alignSelf: 'center' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.primary }}>
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
                                                borderRadius: 8,
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

            {/* BOTÓN FLOTANTE: Este SÍ debe ser solo para los USUARIOS */}
            {rolUsuario === RolBandeja.USUARIO && (
                <TouchableOpacity
                    style={[styles.fab, { bottom: margenInferiorSeguro }]}
                    onPress={() => navigation.navigate('CrearSolicitud')}
                >
                    <Text style={styles.fabText}>+</Text>
                </TouchableOpacity>
            )}

            {/* MENÚ LATERAL PARA CAMBIAR ENTRE ROLES (ej. OPERADOR <-> ADMINISTRADOR) */}
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
    container: { flex: 1, backgroundColor: theme.colors.background },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
    header: { backgroundColor: theme.colors.primary, paddingTop: 60, paddingBottom: 20, paddingHorizontal: theme.spacing.lg, alignItems: 'center' },
    headerTitle: { color: theme.colors.textLight, fontSize: theme.typography.sizes.title, fontWeight: 'bold' },
    headerSubtitle: { color: theme.colors.textLight, fontSize: theme.typography.sizes.sm, marginTop: 4, opacity: 0.9 },
    listContainer: { padding: theme.spacing.md },
    emptyText: { textAlign: 'center', marginTop: 40, color: theme.colors.textSecondary, fontSize: theme.typography.sizes.md },
    fab: { position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center', right: 20, bottom: 20, backgroundColor: theme.colors.primary, borderRadius: 30, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
    fabText: { fontSize: 30, color: 'white', lineHeight: 32 },

    // CORRECCIÓN WEB: Añadido width '100%' y justifyContent 'center' para que los botones no se aplasten
    tabsContainer: {
        flexDirection: 'row',
        marginTop: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
        padding: 4,
        width: '100%',
    },
    tabButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6
    },
    tabActivo: { backgroundColor: '#ffffff' },
    tabText: { color: '#ffffff', fontWeight: 'bold', textAlign: 'center' },
    tabTextActivo: { color: theme.colors.primary }
});