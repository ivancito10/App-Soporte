import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Image,
    Platform,
} from 'react-native';
import { theme } from '../theme/theme';

interface MenuLateralModalProps {
    visible: boolean;
    onClose: () => void;
    rolesDisponibles: string[];
    rolActivo: string;
    onSelectRol: (nuevoRol: string) => void;
    onLogout?: () => void;
}

const INFO_ROLES: Record<
    string,
    { titulo: string; subtitulo: string; icono: string; color: string; bg: string }
> = {
    OPERADOR: {
        titulo: 'Bandeja de Operador',
        subtitulo: 'Recibir solicitudes, asignar prioridad y derivar a técnicos',
        icono: '🎧',
        color: '#2980b9',
        bg: '#ebf5fb',
    },
    ADMINISTRADOR: {
        titulo: 'Gestión de Roles (Admin)',
        subtitulo: 'Otorgar o quitar permisos al personal del sistema',
        icono: '🛡️',
        color: '#d35400',
        bg: '#fef5e7',
    },
    TECNICO: {
        titulo: 'Bandeja de Técnico',
        subtitulo: 'Atender soportes asignados, cronometrar y subir actas',
        icono: '🧑‍🔧',
        color: '#8e44ad',
        bg: '#f5eef8',
    },
    USUARIO: {
        titulo: 'Mis Solicitudes (Usuario)',
        subtitulo: 'Solicitar soporte técnico y hacer seguimiento',
        icono: '👤',
        color: '#27ae60',
        bg: '#eafaf1',
    },
};

export const MenuLateralModal = ({
    visible,
    onClose,
    rolesDisponibles,
    rolActivo,
    onSelectRol,
    onLogout,
}: MenuLateralModalProps) => {
    const rolesLimpios = Array.from(
        new Set((rolesDisponibles || []).map((r) => String(r).toUpperCase()).filter(Boolean))
    );

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* Panel lateral izquierdo */}
                <View style={styles.drawer}>
                    {/* Cabecera del menú lateral */}
                    <View style={styles.drawerHeader}>
                        <View style={styles.logoBadge}>
                            <Image
                                source={require('../../../assets/ssu-logo.png')}
                                style={{ width: 96, height: 40 }}
                                resizeMode="contain"
                            />
                        </View>

                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.drawerTitle}>Cambiar Modo / Rol</Text>
                    <Text style={styles.drawerSubtitle}>
                        Tienes {rolesLimpios.length} roles asignados en tu cuenta:
                    </Text>

                    {/* Lista de roles del usuario */}
                    <View style={styles.rolesList}>
                        {rolesLimpios.map((rolKey) => {
                            const info = INFO_ROLES[rolKey] || {
                                titulo: `Modo ${rolKey}`,
                                subtitulo: 'Acceder a la vista de este rol',
                                icono: '🔹',
                                color: theme.colors.primary,
                                bg: '#eef2f9',
                            };
                            const esActivo = String(rolActivo).toUpperCase() === rolKey;

                            return (
                                <TouchableOpacity
                                    key={rolKey}
                                    style={[
                                        styles.roleCard,
                                        {
                                            borderColor: esActivo ? info.color : '#e2e8f0',
                                            backgroundColor: esActivo ? info.bg : '#ffffff',
                                        },
                                    ]}
                                    onPress={() => {
                                        onSelectRol(rolKey);
                                        onClose();
                                    }}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.roleHeaderRow}>
                                        <Text style={[styles.roleTitle, { color: esActivo ? info.color : '#2c3e50' }]}>
                                            {info.icono}  {info.titulo}
                                        </Text>
                                        {esActivo && (
                                            <View style={[styles.activePill, { backgroundColor: info.color }]}>
                                                <Text style={styles.activePillText}>ACTIVO</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.roleSubtitle}>{info.subtitulo}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Pie del menú lateral */}
                    <View style={styles.drawerFooter}>
                        {onLogout && (
                            <TouchableOpacity
                                style={styles.logoutDrawerBtn}
                                onPress={() => {
                                    onClose();
                                    onLogout();
                                }}
                            >
                                <Text style={styles.logoutDrawerText}>🚪 Cerrar Sesión</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Área oscura a la derecha para cerrar al tocar fuera */}
                <TouchableOpacity
                    style={styles.backdropTouch}
                    activeOpacity={1}
                    onPress={onClose}
                />
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    drawer: {
        width: '82%',
        maxWidth: 330,
        backgroundColor: '#ffffff',
        height: '100%',
        paddingTop: Platform.OS === 'web' ? 24 : 46,
        paddingHorizontal: 18,
        paddingBottom: 24,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 3, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        justifyContent: 'space-between',
    },
    backdropTouch: {
        flex: 1,
        height: '100%',
    },
    drawerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#edf2f7',
    },
    logoBadge: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtnText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#475569',
    },
    drawerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.primary,
        marginTop: 18,
    },
    drawerSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 4,
        marginBottom: 14,
    },
    rolesList: {
        flex: 1,
    },
    roleCard: {
        borderWidth: 1.5,
        borderRadius: 10,
        padding: 13,
        marginBottom: 12,
    },
    roleHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    roleTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        flex: 1,
        marginRight: 6,
    },
    roleSubtitle: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 5,
        lineHeight: 17,
    },
    activePill: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
    },
    activePillText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    drawerFooter: {
        borderTopWidth: 1,
        borderTopColor: '#edf2f7',
        paddingTop: 14,
    },
    logoutDrawerBtn: {
        backgroundColor: '#fdecea',
        borderWidth: 1,
        borderColor: '#f5b7b1',
        paddingVertical: 11,
        borderRadius: 8,
        alignItems: 'center',
    },
    logoutDrawerText: {
        color: '#c0392b',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
