import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { obtenerItem, guardarItem } from '../utils/storage';
import { View, ActivityIndicator, Platform } from 'react-native';
import { theme } from '../theme/theme';
import { LoginScreen } from '../../features/auth/screens/LoginScreen';
import { vincularTokenFCM } from '../../features/auth/api/auth.service';
import { registrarParaNotificacionesPush } from '../utils/notifications';
import { BandejaScreen } from '../../features/soportes/screens/BandejaScreen';
import { TicketDetalleScreen } from '../../features/soportes/screens/TicketDetalleScreen';
import { CrearSolicitudScreen } from '../../features/soportes/screens/CrearSolicitudScreen';
import { GestionRolesScreen } from '../../features/soportes/screens/GestionRolesScreen';

const Stack = createNativeStackNavigator();

export const AppNavigator = () => {
    const [cargando, setCargando] = useState(true);
    const [autenticado, setAutenticado] = useState(false);
    const [rolActivo, setRolActivo] = useState<string | null>(null);
    const [rolesDisponibles, setRolesDisponibles] = useState<string[]>(['USUARIO']);
    const escudosHistorialRef = useRef<number>(0);

    // Esta función la llamamos tanto al inicio como justo después del login
    const verificarSesion = async () => {
        try {
            const token = await obtenerItem('jwtToken');
            const userDataStr = await obtenerItem('userData');

            if (token && userDataStr) {
                const userData = JSON.parse(userDataStr);
                const listaRoles: string[] = Array.isArray(userData.roles) && userData.roles.length > 0
                    ? userData.roles
                    : [userData.rol || 'USUARIO'];
                const rolInicial = userData.rol || listaRoles[0] || 'USUARIO';

                setRolesDisponibles(listaRoles);
                setRolActivo(rolInicial);
                setAutenticado(true);

                // Sincronizar token FCM en segundo plano si está en dispositivo móvil
                if (Platform.OS !== 'web') {
                    registrarParaNotificacionesPush()
                        .then((fcmToken) => {
                            if (fcmToken) {
                                return vincularTokenFCM(fcmToken);
                            }
                        })
                        .catch((err) => console.log('Aviso sincronizando token FCM:', err));
                }
            } else {
                setAutenticado(false);
                setRolActivo(null);
                setRolesDisponibles(['USUARIO']);
            }
        } catch (error) {
            console.error('Error leyendo sesión:', error);
            setAutenticado(false);
        } finally {
            setCargando(false);
        }
    };

    // Permite cambiar entre roles (ej. OPERADOR <-> ADMINISTRADOR) en caliente y persistirlo en userData
    const cambiarRol = async (nuevoRol: string) => {
        setRolActivo(nuevoRol);
        try {
            const userDataStr = await obtenerItem('userData');
            if (userDataStr) {
                const userData = JSON.parse(userDataStr);
                userData.rol = nuevoRol;
                await guardarItem('userData', JSON.stringify(userData));
            }
        } catch (e) {
            console.log('No se pudo persistir el cambio de rol en userData:', e);
        }
    };

    useEffect(() => {
        verificarSesion();
    }, []);

    // Bloquear el botón "Atrás" propio del navegador web en TODOS los roles.
    // NOTA: Chrome ignora history.pushState si no ocurre dentro de un clic/gesto real del usuario
    // (por eso saltaba directo a Google con "Page entered Back-Forward Cache").
    // Al registrar el pushState dentro de 'pointerdown'/'keydown', Chrome lo valida como navegación real
    // y jamás permite que el botón Atrás salga hacia el buscador de Google.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;

        const agregarEscudoConGesto = () => {
            if (escudosHistorialRef.current < 5) {
                window.history.pushState(
                    { soporteGuard: Date.now(), nivel: escudosHistorialRef.current + 1 },
                    '',
                    window.location.href
                );
                escudosHistorialRef.current += 1;
            }
        };

        const manejarPopState = () => {
            escudosHistorialRef.current = Math.max(0, escudosHistorialRef.current - 1);
            window.history.pushState(
                { soporteGuard: Date.now(), recuperado: true },
                '',
                window.location.href
            );
        };

        // Capturamos cualquier clic, toque o tecla del usuario para blindar el historial con activación real
        window.addEventListener('pointerdown', agregarEscudoConGesto, true);
        window.addEventListener('keydown', agregarEscudoConGesto, true);
        window.addEventListener('popstate', manejarPopState);

        return () => {
            window.removeEventListener('pointerdown', agregarEscudoConGesto, true);
            window.removeEventListener('keydown', agregarEscudoConGesto, true);
            window.removeEventListener('popstate', manejarPopState);
        };
    }, []);

    if (cargando) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <NavigationContainer
            onStateChange={() => {
                if (Platform.OS === 'web' && typeof document !== 'undefined') {
                    // Quitamos el foco del elemento anterior para evitar el warning de aria-hidden en Web
                    (document.activeElement as HTMLElement)?.blur?.();
                }
            }}
        >
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!autenticado ? (
                    <Stack.Screen name="Login">
                        {(props) => <LoginScreen {...props} onLogin={async () => {
                            // Cuando el login termina, forzamos a leer el rol antes de cambiar de pantalla
                            setCargando(true);
                            await verificarSesion();
                        }} />}
                    </Stack.Screen>
                ) : (
                    <>
                        {/* Si el rol activo es ADMINISTRADOR muestra Gestión de Roles, de lo contrario muestra la Bandeja del rol activo */}
                        {rolActivo === 'ADMINISTRADOR' ? (
                            <Stack.Screen name="Main">
                                {(props) => (
                                    <GestionRolesScreen
                                        {...props}
                                        rolActivo={rolActivo}
                                        rolesDisponibles={rolesDisponibles}
                                        onCambiarRol={cambiarRol}
                                        onRolesActualizados={setRolesDisponibles}
                                        onLogout={() => {
                                            setAutenticado(false);
                                            setRolActivo(null);
                                            setRolesDisponibles(['USUARIO']);
                                        }}
                                    />
                                )}
                            </Stack.Screen>
                        ) : (
                            <Stack.Screen name="Main">
                                {(props) => (
                                    <BandejaScreen
                                        {...props}
                                        rolActivo={rolActivo}
                                        rolesDisponibles={rolesDisponibles}
                                        onCambiarRol={cambiarRol}
                                        onLogout={() => {
                                            setAutenticado(false);
                                            setRolActivo(null);
                                            setRolesDisponibles(['USUARIO']);
                                        }}
                                    />
                                )}
                            </Stack.Screen>
                        )}

                        <Stack.Screen
                            name="TicketDetalle"
                            component={TicketDetalleScreen}
                            options={{ headerShown: true, title: 'Detalles del Soporte', headerStyle: { backgroundColor: theme.colors.primary }, headerTintColor: '#fff' }}
                        />
                        <Stack.Screen
                            name="CrearSolicitud"
                            component={CrearSolicitudScreen}
                            options={{ headerShown: true, title: 'Nueva Solicitud', headerStyle: { backgroundColor: theme.colors.primary }, headerTintColor: '#fff' }}
                        />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};