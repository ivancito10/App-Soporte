import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { theme } from '../../../core/theme/theme';
import { guardarItem, obtenerItem, eliminarItem } from '../../../core/utils/storage';
import { login } from '../api/auth.service';
import { registrarParaNotificacionesPush } from '../../../core/utils/notifications';
import { vincularTokenFCM } from '../api/auth.service';

const STORAGE_KEY_CREDENCIALES = 'soporte_credenciales_recordadas';

// Icono minimalista de Ojo (estilo Material / Feather Icons) dibujado con código puro
// para que se vea limpio en Web y Android y funcione 100% aún sin conexión a internet
const IconoOjoMinimalista = ({ abierto }: { abierto: boolean }) => {
    if (Platform.OS === 'web') {
        // En Web renderizamos el SVG estándar usado en formularios modernos (Feather eye / eye-off)
        return abierto ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
        ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        );
    }

    // En Android / iOS dibujamos el icono vectorial con Views nativos (sin emojis ni red)
    return (
        <View style={{ width: 24, height: 18, justifyContent: 'center', alignItems: 'center' }}>
            {/* Contorno del ojo */}
            <View
                style={{
                    width: 22,
                    height: 13,
                    borderRadius: 10,
                    borderWidth: 1.8,
                    borderColor: '#64748b',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                {/* Pupila central */}
                <View
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: '#64748b',
                    }}
                />
            </View>
            {/* Línea diagonal cuando está en modo "Ocultar" (ojo tachado) */}
            {abierto && (
                <View
                    style={{
                        position: 'absolute',
                        width: 24,
                        height: 2,
                        backgroundColor: '#64748b',
                        transform: [{ rotate: '-35deg' }],
                    }}
                />
            )}
        </View>
    );
};

export const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
    const [usuario, setUsuario] = useState('');
    const [contrasena, setContrasena] = useState('');
    const [mostrarContrasena, setMostrarContrasena] = useState(false);
    const [recordarContrasena, setRecordarContrasena] = useState(false);
    const [cargando, setCargando] = useState(false);

    // Cargar usuario y contraseña guardados si el usuario activó "Recordar contraseña"
    useEffect(() => {
        const cargarCredencialesRecordadas = async () => {
            try {
                const guardadasStr = await obtenerItem(STORAGE_KEY_CREDENCIALES);
                if (guardadasStr) {
                    const parsed = JSON.parse(guardadasStr);
                    if (parsed?.usuario && parsed?.contrasena) {
                        setUsuario(parsed.usuario);
                        setContrasena(parsed.contrasena);
                        setRecordarContrasena(true);
                    }
                }
            } catch (e) {
                console.log('No se pudieron cargar credenciales recordadas:', e);
            }
        };
        cargarCredencialesRecordadas();
    }, []);

    const handleLogin = async () => {
        if (!usuario || !contrasena) {
            Alert.alert('Campos vacíos', 'Por favor ingresa tu usuario y contraseña.');
            return;
        }

        setCargando(true);
        try {
            // 1. Iniciamos sesión en NestJS
            await login(usuario, contrasena);

            // 1B. Guardar o limpiar las credenciales según el checkbox "Recordar contraseña"
            try {
                if (recordarContrasena) {
                    await guardarItem(
                        STORAGE_KEY_CREDENCIALES,
                        JSON.stringify({ usuario, contrasena })
                    );
                } else {
                    await eliminarItem(STORAGE_KEY_CREDENCIALES);
                }
            } catch (errCred) {
                console.log('No se pudo actualizar credenciales recordadas:', errCred);
            }

            // 2. Intentamos registrar notificaciones en un bloque INDEPENDIENTE
            try {
                const tokenFCM = await registrarParaNotificacionesPush();
                if (tokenFCM) {
                    await vincularTokenFCM(tokenFCM).catch(e => console.log('Error vinculando token FCM', e));
                }
            } catch (notifError) {
                // Si falla (como en Android Expo Go), lo silenciamos y el login continúa
                console.warn("Notificaciones omitidas en este entorno:", notifError);
            }

            // 3. Avisamos al enrutador que ya tenemos token para cambiar a la Bandeja
            onLogin();

        } catch (error: any) {
            console.error("Error detallado del servidor:", error);
            const mensajeError = error.response?.data?.message;

            const textoFinal = Array.isArray(mensajeError)
                ? mensajeError.join('\n')
                : mensajeError || 'Credenciales incorrectas o error de red';

            if (Platform.OS === 'web') {
                window.alert('Error: ' + textoFinal);
            } else {
                Alert.alert('Error al ingresar', textoFinal);
            }
        } finally {
            setCargando(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Tarjeta central blanca */}
            <View style={styles.card}>
                {/* Logo Oficial SSU La Paz */}
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../../../assets/ssu-logo.png')}
                        style={{ width: 200, height: 85 }}
                        resizeMode="contain"
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Usuario</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="usuario@ssulapaz.org"
                        value={usuario}
                        onChangeText={setUsuario}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Contraseña</Text>
                    <View style={styles.passwordWrapper}>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="••••••••"
                            value={contrasena}
                            onChangeText={setContrasena}
                            secureTextEntry={!mostrarContrasena}
                            autoCapitalize="none"
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => setMostrarContrasena((prev) => !prev)}
                            activeOpacity={0.7}
                        >
                            <IconoOjoMinimalista abierto={mostrarContrasena} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Checkbox para Recordar Contraseña (compatible con Android, iOS y Web) */}
                <TouchableOpacity
                    style={styles.rememberRow}
                    onPress={() => setRecordarContrasena((prev) => !prev)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.checkbox, recordarContrasena && styles.checkboxChecked]}>
                        {recordarContrasena && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                    <Text style={styles.rememberText}>Recordar usuario y contraseña</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={cargando}>
                    {cargando ? (
                        <ActivityIndicator color={theme.colors.surface} />
                    ) : (
                        <Text style={styles.buttonText}>INGRESAR</Text>
                    )}
                </TouchableOpacity>
            </View>

            <Text style={styles.footerText}>SigHov2 móvil</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.lg,
    },
    card: {
        backgroundColor: theme.colors.surface,
        width: '100%',
        maxWidth: 440,
        alignSelf: 'center',
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        ...theme.shadows.card,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: theme.spacing.xl,
    },
    logoText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    logoSubText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        letterSpacing: 2,
    },
    inputContainer: {
        marginBottom: theme.spacing.md,
    },
    label: {
        fontSize: theme.typography.sizes.sm,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
        marginLeft: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        fontSize: theme.typography.sizes.md,
        color: theme.colors.textPrimary,
    },
    passwordWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.md,
        backgroundColor: '#fff',
    },
    passwordInput: {
        flex: 1,
        padding: theme.spacing.md,
        fontSize: theme.typography.sizes.md,
        color: theme.colors.textPrimary,
    },
    eyeButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eyeIcon: {
        fontSize: 18,
    },
    rememberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        marginBottom: 8,
        paddingVertical: 4,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    checkboxChecked: {
        backgroundColor: theme.colors.primary,
    },
    checkboxMark: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 16,
    },
    rememberText: {
        fontSize: 14,
        color: theme.colors.textPrimary,
        fontWeight: '500',
    },
    button: {
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        marginTop: theme.spacing.md,
    },
    buttonText: {
        color: theme.colors.textLight,
        fontWeight: 'bold',
        fontSize: theme.typography.sizes.md,
    },
    footerText: {
        color: theme.colors.textLight,
        marginTop: 40,
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
    }
});