import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    ActivityIndicator,
    Modal,
    Alert,
    Platform,
    RefreshControl,
    Image,
    useWindowDimensions,
} from 'react-native';
import { theme } from '../../../core/theme/theme';
import { obtenerItem, guardarItem, eliminarItem } from '../../../core/utils/storage';
import { MenuLateralModal } from '../../../core/components/MenuLateralModal';
import {
    obtenerUsuariosConRoles,
    asignarRolUsuario,
    quitarRolUsuario,
} from '../api/soporte.service';

export interface UsuarioRolItem {
    id_usuario: number;
    username: string;
    email?: string;
    nombre_completo: string;
    ci?: string;
    rol_soporte: 'USUARIO' | 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR' | string;
    roles_activos?: string[];
    tiene_rol_especial?: boolean;
}

const ROLES_DISPONIBLES: Array<{
    rol: 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR';
    titulo: string;
    descripcion: string;
    icono: string;
    color: string;
    bg: string;
}> = [
    {
        rol: 'OPERADOR',
        titulo: 'OPERADOR',
        descripcion: 'Recibe solicitudes, asigna prioridad y deriva a técnicos.',
        icono: '🎧',
        color: '#2980b9',
        bg: '#ebf5fb',
    },
    {
        rol: 'TECNICO',
        titulo: 'TÉCNICO',
        descripcion: 'Atiende los soportes asignados, cronometra y sube el acta.',
        icono: '🧑‍🔧',
        color: '#8e44ad',
        bg: '#f5eef8',
    },
    {
        rol: 'ADMINISTRADOR',
        titulo: 'ADMINISTRADOR',
        descripcion: 'Gestiona los permisos y roles del personal en el sistema.',
        icono: '🛡️',
        color: '#d35400',
        bg: '#fef5e7',
    },
];

const obtenerBadgeRol = (rol?: string) => {
    const r = (rol || 'USUARIO').toUpperCase();
    if (r === 'OPERADOR') {
        return { texto: '🎧 OPERADOR', color: '#2980b9', bg: '#ebf5fb' };
    }
    if (r === 'TECNICO') {
        return { texto: '🧑‍🔧 TÉCNICO', color: '#8e44ad', bg: '#f5eef8' };
    }
    if (r === 'ADMINISTRADOR') {
        return { texto: '🛡️ ADMINISTRADOR', color: '#d35400', bg: '#fef5e7' };
    }
    return { texto: '👤 USUARIO', color: '#7f8c8d', bg: '#f2f4f4' };
};

const obtenerRolesDeUsuario = (item?: UsuarioRolItem | null): string[] => {
    if (!item) return [];
    if (Array.isArray(item.roles_activos) && item.roles_activos.length > 0) {
        return item.roles_activos
            .map((r) => String(r).toUpperCase())
            .filter((r) => r === 'OPERADOR' || r === 'TECNICO' || r === 'ADMINISTRADOR');
    }
    const r = (item.rol_soporte || '').toUpperCase();
    if (r === 'OPERADOR' || r === 'TECNICO' || r === 'ADMINISTRADOR') {
        return [r];
    }
    return [];
};

export const GestionRolesScreen = ({
    onLogout,
    rolActivo = 'ADMINISTRADOR',
    rolesDisponibles = ['ADMINISTRADOR'],
    onCambiarRol,
    onRolesActualizados,
}: any) => {
    const { width } = useWindowDimensions();
    const esEscritorio = Platform.OS === 'web' && width > 768;

    const [usuarios, setUsuarios] = useState<UsuarioRolItem[]>([]);
    const [cargando, setCargando] = useState<boolean>(true);
    const [refrescando, setRefrescando] = useState<boolean>(false);
    const [guardandoAccion, setGuardandoAccion] = useState<boolean>(false);
    const [menuLateralVisible, setMenuLateralVisible] = useState<boolean>(false);
    const tieneMultiplesRolesSesion = Array.isArray(rolesDisponibles) && rolesDisponibles.length > 1;

    // Buscador y pestañas
    const [busqueda, setBusqueda] = useState<string>('');
    const [tabActivo, setTabActivo] = useState<'ASIGNADOS' | 'TODOS'>('ASIGNADOS');

    // ID del administrador logueado (para bloquear auto-eliminación)
    const [idAdminActual, setIdAdminActual] = useState<number | null>(null);

    // Modal de gestión del usuario seleccionado
    const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioRolItem | null>(null);
    const [modalVisible, setModalVisible] = useState<boolean>(false);
    const [confirmandoQuitar, setConfirmandoQuitar] = useState<boolean>(false);

    const mostrarMensaje = (titulo: string, mensaje: string) => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert(`${titulo}: ${mensaje}`);
        } else {
            Alert.alert(titulo, mensaje);
        }
    };

    const manejarCerrarSesion = async () => {
        await eliminarItem('jwtToken');
        await eliminarItem('userData');
        if (onLogout) onLogout();
    };

    const cargarUsuarios = useCallback(async (silencioso = false) => {
        if (!silencioso) setCargando(true);
        try {
            const userDataStr = await obtenerItem('userData');
            if (userDataStr) {
                const userData = JSON.parse(userDataStr);
                if (userData?.id) {
                    setIdAdminActual(Number(userData.id));
                }
            }

            const lista = await obtenerUsuariosConRoles();
            setUsuarios(Array.isArray(lista) ? lista : []);
        } catch (error: any) {
            console.error('Error al cargar usuarios con roles:', error);
            if (!silencioso) {
                const msg = error?.response?.data?.message || 'No se pudo cargar la lista de usuarios.';
                mostrarMensaje('Error', msg);
            }
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    }, []);

    useEffect(() => {
        cargarUsuarios(false);
    }, [cargarUsuarios]);

    const onRefresh = () => {
        setRefrescando(true);
        cargarUsuarios(true);
    };

    // Filtrado por pestaña + barra de búsqueda en tiempo real
    const termino = busqueda.trim().toLowerCase();

    const personalAsignado = usuarios.filter((u) => obtenerRolesDeUsuario(u).length > 0);

    const baseLista = tabActivo === 'ASIGNADOS' ? personalAsignado : usuarios;

    const usuariosFiltrados = baseLista.filter((u) => {
        if (!termino) return true;
        const nombre = (u.nombre_completo || '').toLowerCase();
        const user = (u.username || '').toLowerCase();
        const ci = (u.ci || '').toLowerCase();
        const rolesTexto = obtenerRolesDeUsuario(u).join(' ').toLowerCase() || (u.rol_soporte || '').toLowerCase();
        return (
            nombre.includes(termino) ||
            user.includes(termino) ||
            ci.includes(termino) ||
            rolesTexto.includes(termino)
        );
    });

    const abrirModalUsuario = (item: UsuarioRolItem) => {
        setUsuarioSeleccionado(item);
        setConfirmandoQuitar(false);
        setModalVisible(true);
    };

    const sincronizarRolesPropiosEnSesion = async (nuevosRoles: string[]) => {
        try {
            const listaFinal = nuevosRoles.length > 0 ? nuevosRoles : ['ADMINISTRADOR'];
            if (onRolesActualizados) {
                onRolesActualizados(listaFinal);
            }
            const userDataStr = await obtenerItem('userData');
            if (userDataStr) {
                const userData = JSON.parse(userDataStr);
                userData.roles = listaFinal;
                await guardarItem('userData', JSON.stringify(userData));
            }
        } catch (e) {
            console.log('No se pudo actualizar roles de sesión:', e);
        }
    };

    const handleAlternarRol = async (rolObjetivo: 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR') => {
        if (!usuarioSeleccionado) return;

        const rolesActuales = obtenerRolesDeUsuario(usuarioSeleccionado);
        const yaTieneEsteRol = rolesActuales.includes(rolObjetivo);
        const esMismoAdmin =
            idAdminActual !== null &&
            Number(usuarioSeleccionado.id_usuario) === Number(idAdminActual);

        if (yaTieneEsteRol) {
            if (esMismoAdmin && rolObjetivo === 'ADMINISTRADOR') {
                mostrarMensaje(
                    'Acción bloqueada',
                    'Por seguridad, no puedes quitarte tu propio rol de ADMINISTRADOR.'
                );
                return;
            }

            setGuardandoAccion(true);
            try {
                const resp = await quitarRolUsuario(Number(usuarioSeleccionado.id_usuario), rolObjetivo);
                const rolesNuevos: string[] = resp?.datos?.roles_activos || rolesActuales.filter((r) => r !== rolObjetivo);
                if (esMismoAdmin) {
                    await sincronizarRolesPropiosEnSesion(rolesNuevos);
                }
                setModalVisible(false);
                setUsuarioSeleccionado(null);
                await cargarUsuarios(true);
            } catch (error: any) {
                console.error('Error al quitar rol específico:', error);
                const msg = error?.response?.data?.message || 'No se pudo quitar el rol.';
                mostrarMensaje('Error', msg);
            } finally {
                setGuardandoAccion(false);
            }
            return;
        }

        setGuardandoAccion(true);
        try {
            const resp = await asignarRolUsuario(Number(usuarioSeleccionado.id_usuario), rolObjetivo);
            const rolesNuevos: string[] = resp?.datos?.roles_activos || Array.from(new Set([...rolesActuales, rolObjetivo]));
            if (esMismoAdmin) {
                await sincronizarRolesPropiosEnSesion(rolesNuevos);
            }
            setModalVisible(false);
            setUsuarioSeleccionado(null);
            await cargarUsuarios(true);
        } catch (error: any) {
            console.error('Error al asignar rol:', error);
            const msg = error?.response?.data?.message || 'No se pudo asignar el rol.';
            mostrarMensaje('Error', msg);
        } finally {
            setGuardandoAccion(false);
        }
    };

    const ejecutarQuitarRol = async () => {
        if (!usuarioSeleccionado) return;

        setGuardandoAccion(true);
        try {
            await quitarRolUsuario(Number(usuarioSeleccionado.id_usuario));
            setModalVisible(false);
            setConfirmandoQuitar(false);
            setUsuarioSeleccionado(null);
            await cargarUsuarios(true);
        } catch (error: any) {
            console.error('Error al quitar rol:', error);
            const msg = error?.response?.data?.message || 'No se pudo quitar el rol.';
            mostrarMensaje('Error', msg);
        } finally {
            setGuardandoAccion(false);
        }
    };

    const renderUsuarioCard = ({ item }: { item: UsuarioRolItem }) => {
        const rolesUsuario = obtenerRolesDeUsuario(item);
        const badges = rolesUsuario.length > 0
            ? rolesUsuario.map((r) => obtenerBadgeRol(r))
            : [obtenerBadgeRol('USUARIO')];
        const esUsuarioActual =
            idAdminActual !== null && Number(item.id_usuario) === Number(idAdminActual);

        return (
            <TouchableOpacity
                style={[
                    styles.card,
                    { borderLeftColor: badges[0].color },
                ]}
                onPress={() => abrirModalUsuario(item)}
            >
                <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.userName}>
                            {item.nombre_completo}
                            {esUsuarioActual ? ' (Tú)' : ''}
                        </Text>
                        <Text style={styles.userMeta}>
                            Usuario: <Text style={{ fontWeight: '600' }}>{item.username}</Text>
                            {item.ci ? `  |  CI: ${item.ci}` : ''}
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: '52%' }}>
                        {badges.map((b, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.roleBadge,
                                    { backgroundColor: b.bg, borderColor: b.color },
                                ]}
                            >
                                <Text style={[styles.roleBadgeText, { color: b.color }]}>
                                    {b.texto}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                <Text style={styles.tapHint}>
                    Toca para agregar o quitar roles →
                </Text>
            </TouchableOpacity>
        );
    };

    const rolesSeleccionado = obtenerRolesDeUsuario(usuarioSeleccionado);
    const rolActualSeleccionado = rolesSeleccionado.length > 0 ? rolesSeleccionado.join(' + ') : 'USUARIO';
    const tieneRolEspecial = rolesSeleccionado.length > 0;
    const esAutoEdicion =
        usuarioSeleccionado !== null &&
        idAdminActual !== null &&
        Number(usuarioSeleccionado.id_usuario) === Number(idAdminActual);

    return (
        <View style={styles.container}>
            {/* CABECERA */}
            <View style={[styles.header, !esEscritorio && { paddingTop: 42 }]}>
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
                        {tieneMultiplesRolesSesion && (
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

                    <TouchableOpacity style={styles.logoutButton} onPress={manejarCerrarSesion}>
                        <Text style={styles.logoutText}>Salir</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.headerTitle}>Gestión de Roles</Text>
                <Text style={styles.headerSubtitle}>Modo: ADMINISTRADOR</Text>

                {/* DOS PESTAÑAS: PERSONAL ASIGNADO / TODOS LOS USUARIOS */}
                <View style={[styles.tabsContainer, esEscritorio && { maxWidth: 880, alignSelf: 'center' }]}>
                    <TouchableOpacity
                        style={[styles.tabButton, tabActivo === 'ASIGNADOS' && styles.tabActivo]}
                        onPress={() => setTabActivo('ASIGNADOS')}
                    >
                        <Text style={[styles.tabText, tabActivo === 'ASIGNADOS' && styles.tabTextActivo]}>
                            Personal Asignado ({personalAsignado.length})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tabButton, tabActivo === 'TODOS' && styles.tabActivo]}
                        onPress={() => setTabActivo('TODOS')}
                    >
                        <Text style={[styles.tabText, tabActivo === 'TODOS' && styles.tabTextActivo]}>
                            Todos los Usuarios ({usuarios.length})
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* BARRA DE BÚSQUEDA EN TIEMPO REAL */}
            <View style={[styles.searchContainer, esEscritorio && { width: '100%', maxWidth: 912, alignSelf: 'center' }]}>
                <View style={styles.searchInputWrapper}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar funcionario por nombre, usuario, CI o rol..."
                        placeholderTextColor="#888"
                        value={busqueda}
                        onChangeText={setBusqueda}
                    />
                    {busqueda.length > 0 && (
                        <TouchableOpacity onPress={() => setBusqueda('')} style={{ padding: 6 }}>
                            <Text style={{ fontSize: 16, color: '#888', fontWeight: 'bold' }}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* LISTADO */}
            {cargando ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={usuariosFiltrados}
                    keyExtractor={(item, index) => `${item.id_usuario}-${index}`}
                    contentContainerStyle={[
                        styles.listContainer,
                        esEscritorio && { width: '100%', maxWidth: 912, alignSelf: 'center' }
                    ]}
                    renderItem={renderUsuarioCard}
                    refreshControl={
                        <RefreshControl
                            refreshing={refrescando}
                            onRefresh={onRefresh}
                            colors={[theme.colors.primary]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                            <Text style={styles.emptyText}>
                                {termino
                                    ? `No se encontraron funcionarios que coincidan con "${busqueda}".`
                                    : tabActivo === 'ASIGNADOS'
                                        ? 'Aún no hay usuarios con rol de Operador, Técnico o Administrador.'
                                        : 'No se encontraron usuarios registrados.'}
                            </Text>
                            {tabActivo === 'ASIGNADOS' && (
                                <TouchableOpacity
                                    style={styles.goToAllButton}
                                    onPress={() => setTabActivo('TODOS')}
                                >
                                    <Text style={styles.goToAllButtonText}>
                                        Ir a "Todos los Usuarios" para otorgar un rol
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                />
            )}

            {/* MODAL PARA OTORGAR / CAMBIAR / QUITAR ROL */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {usuarioSeleccionado && (
                            <>
                                <View style={styles.modalHeaderRow}>
                                    <Text style={styles.modalTitle}>Asignar Permiso / Rol</Text>
                                    <TouchableOpacity
                                        onPress={() => setModalVisible(false)}
                                        style={{ padding: 4 }}
                                    >
                                        <Text style={{ fontSize: 18, color: '#666', fontWeight: 'bold' }}>✕</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.selectedUserBox}>
                                    <Text style={styles.selectedUserName}>
                                        {usuarioSeleccionado.nombre_completo}
                                        {esAutoEdicion ? ' (Tu cuenta)' : ''}
                                    </Text>
                                    <Text style={styles.selectedUserSub}>
                                        Usuario: {usuarioSeleccionado.username}
                                        {usuarioSeleccionado.ci ? ` | CI: ${usuarioSeleccionado.ci}` : ''}
                                    </Text>
                                    <Text style={styles.selectedUserCurrentRole}>
                                        Rol actual:{' '}
                                        <Text style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                            {rolActualSeleccionado}
                                        </Text>
                                    </Text>
                                </View>

                                {esAutoEdicion && (
                                    <View style={styles.selfWarningBox}>
                                        <Text style={styles.selfWarningText}>
                                            💡 Puedes agregarte un segundo rol (como OPERADOR) para usar el menú ☰ y alternar entre vistas. Tu rol de ADMINISTRADOR está protegido.
                                        </Text>
                                    </View>
                                )}

                                <Text style={styles.sectionLabel}>
                                    Toca un rol para activarlo o desactivarlo (permite múltiples roles):
                                </Text>

                                {ROLES_DISPONIBLES.map((opcion) => {
                                    const esRolActivo = rolesSeleccionado.includes(opcion.rol);
                                    const bloqueadoQuitarPropioAdmin =
                                        esAutoEdicion && opcion.rol === 'ADMINISTRADOR' && esRolActivo;

                                    return (
                                        <TouchableOpacity
                                            key={opcion.rol}
                                            disabled={guardandoAccion || bloqueadoQuitarPropioAdmin}
                                            style={[
                                                styles.roleOptionBtn,
                                                {
                                                    borderColor: esRolActivo ? opcion.color : '#ddd',
                                                    backgroundColor: esRolActivo ? opcion.bg : '#fafafa',
                                                },
                                            ]}
                                            onPress={() => handleAlternarRol(opcion.rol)}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={[styles.roleOptionTitle, { color: opcion.color }]}>
                                                    {opcion.icono} {opcion.titulo}
                                                </Text>
                                                {esRolActivo ? (
                                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: opcion.color }}>
                                                        {bloqueadoQuitarPropioAdmin ? '🔒 ACTIVO (PROTEGIDO)' : '✓ ACTIVO (Toca para quitar)'}
                                                    </Text>
                                                ) : (
                                                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#7f8c8d' }}>
                                                        + Agregar rol
                                                    </Text>
                                                )}
                                            </View>
                                            <Text style={styles.roleOptionDesc}>{opcion.descripcion}</Text>
                                        </TouchableOpacity>
                                    );
                                })}

                                {/* BOTÓN ROJO PARA QUITAR ROL (VOLVER A USUARIO POR DEFECTO) */}
                                {tieneRolEspecial && !esAutoEdicion && (
                                    <View style={{ marginTop: 10 }}>
                                        {!confirmandoQuitar ? (
                                            <TouchableOpacity
                                                disabled={guardandoAccion}
                                                style={styles.removeRoleBtn}
                                                onPress={() => setConfirmandoQuitar(true)}
                                            >
                                                <Text style={styles.removeRoleBtnText}>
                                                    🗑️ Quitar Rol (Volver a Usuario)
                                                </Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View style={styles.confirmRemoveBox}>
                                                <Text style={styles.confirmRemoveTitle}>
                                                    ¿Confirmas quitar el rol {rolActualSeleccionado} a {usuarioSeleccionado.nombre_completo}?
                                                </Text>
                                                <Text style={styles.confirmRemoveSub}>
                                                    El funcionario pasará a ser USUARIO por defecto al iniciar sesión.
                                                </Text>
                                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                                                    <TouchableOpacity
                                                        style={styles.cancelConfirmBtn}
                                                        onPress={() => setConfirmandoQuitar(false)}
                                                        disabled={guardandoAccion}
                                                    >
                                                        <Text style={{ color: '#555', fontWeight: 'bold' }}>Cancelar</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={styles.confirmDangerBtn}
                                                        onPress={ejecutarQuitarRol}
                                                        disabled={guardandoAccion}
                                                    >
                                                        {guardandoAccion ? (
                                                            <ActivityIndicator color="#fff" size="small" />
                                                        ) : (
                                                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                                                                Sí, Quitar Rol
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={styles.closeModalBtn}
                                    onPress={() => setModalVisible(false)}
                                    disabled={guardandoAccion}
                                >
                                    <Text style={styles.closeModalBtnText}>Cerrar</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* MENÚ LATERAL PARA CAMBIAR ENTRE ROLES (ej. ADMINISTRADOR <-> OPERADOR) */}
            <MenuLateralModal
                visible={menuLateralVisible}
                onClose={() => setMenuLateralVisible(false)}
                rolesDisponibles={rolesDisponibles}
                rolActivo={rolActivo}
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
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        backgroundColor: theme.colors.primary,
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
    },
    headerTitle: {
        color: theme.colors.textLight,
        fontSize: theme.typography.sizes.title,
        fontWeight: 'bold',
    },
    headerSubtitle: {
        color: theme.colors.textLight,
        fontSize: theme.typography.sizes.sm,
        marginTop: 4,
        opacity: 0.9,
    },
    logoutButton: {
        paddingVertical: 9,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,0,0,0.75)',
        borderRadius: 6,
    },
    logoutText: { color: 'white', fontWeight: 'bold' },

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
        borderRadius: 6,
    },
    tabActivo: { backgroundColor: '#ffffff' },
    tabText: { color: '#ffffff', fontWeight: 'bold', textAlign: 'center', fontSize: 13 },
    tabTextActivo: { color: theme.colors.primary },

    searchContainer: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: 14,
        paddingBottom: 6,
    },
    searchInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#dce1e7',
        elevation: 1,
    },
    searchIcon: { fontSize: 16, marginRight: 8 },
    searchInput: {
        flex: 1,
        paddingVertical: 11,
        fontSize: 14,
        color: '#333',
    },

    listContainer: {
        padding: theme.spacing.md,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#ffffff',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        borderLeftWidth: 4,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    userName: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 3,
    },
    userMeta: {
        fontSize: 13,
        color: '#666',
    },
    roleBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: 1,
    },
    roleBadgeText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    tapHint: {
        fontSize: 12,
        color: theme.colors.primary,
        marginTop: 8,
        fontWeight: '500',
    },

    emptyText: {
        textAlign: 'center',
        color: theme.colors.textSecondary,
        fontSize: 15,
        lineHeight: 22,
    },
    goToAllButton: {
        marginTop: 14,
        backgroundColor: theme.colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 6,
    },
    goToAllButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        maxWidth: 500,
        width: '100%',
        alignSelf: 'center',
        elevation: 6,
    },
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    selectedUserBox: {
        backgroundColor: '#f4f6f9',
        padding: 12,
        borderRadius: 8,
        marginBottom: 14,
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.primary,
    },
    selectedUserName: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    selectedUserSub: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    selectedUserCurrentRole: {
        fontSize: 13,
        color: '#444',
        marginTop: 6,
    },
    selfWarningBox: {
        backgroundColor: '#fff8e1',
        borderLeftWidth: 4,
        borderLeftColor: '#f39c12',
        padding: 10,
        borderRadius: 6,
        marginBottom: 12,
    },
    selfWarningText: {
        fontSize: 12,
        color: '#8a6d3b',
        fontWeight: '500',
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#444',
        marginBottom: 8,
    },
    roleOptionBtn: {
        borderWidth: 1.5,
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
    },
    roleOptionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    roleOptionDesc: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    removeRoleBtn: {
        backgroundColor: '#fdecea',
        borderWidth: 1,
        borderColor: '#e74c3c',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    removeRoleBtnText: {
        color: '#c0392b',
        fontWeight: 'bold',
        fontSize: 14,
    },
    confirmRemoveBox: {
        backgroundColor: '#fdecea',
        borderWidth: 1,
        borderColor: '#e74c3c',
        borderRadius: 8,
        padding: 12,
    },
    confirmRemoveTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#c0392b',
    },
    confirmRemoveSub: {
        fontSize: 12,
        color: '#922b21',
        marginTop: 4,
    },
    cancelConfirmBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ccc',
    },
    confirmDangerBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
        backgroundColor: '#e74c3c',
    },
    closeModalBtn: {
        marginTop: 12,
        paddingVertical: 11,
        borderRadius: 8,
        backgroundColor: '#ecf0f1',
        alignItems: 'center',
    },
    closeModalBtnText: {
        color: '#555',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
