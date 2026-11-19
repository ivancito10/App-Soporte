import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Alert,
    Platform,
    useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { guardarItem, obtenerItem } from '../../../core/utils/storage';
import { AppIcon, NombreIcono } from '../../../core/components/AppIcon';
import { useCrearSolicitud } from '../hooks/useCrearSolicitud';
import { CrearSolicitudPayload } from '../types/soporte.types';

interface UbicacionGuardada {
    piso: string;
    oficina: string;
    consultorio: string;
}

const STORAGE_KEY_UBICACIONES = 'soporte_ubicaciones_guardadas';

// Opciones visuales amigables con iconos vectoriales (sin emojis)
const TIPOS_SOPORTE: Array<{ id: number; icono: NombreIcono; titulo: string; desc: string }> = [
    { id: 1, icono: 'laptop', titulo: 'Equipos físicos', desc: 'Problemas con computadoras, impresoras, teclados, etc.' },
    { id: 2, icono: 'gear', titulo: 'Sistema SIGHO', desc: 'Errores en módulos, accesos o fallos del software.' },
    { id: 3, icono: 'globe', titulo: 'Redes e Internet', desc: 'Sin conexión, red lenta o problemas de Wi-Fi.' }
];

export const CrearSolicitudScreen = () => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const esEscritorio = Platform.OS === 'web' && width > 768;
    const paddingInferiorSeguro = Platform.OS === 'web' ? 40 : Math.max(insets.bottom, 48) + 32;
    const navigation = useNavigation();
    const { enviarSolicitud, isLoading } = useCrearSolicitud();

    // Estados locales para el formulario de ubicación
    const [piso, setPiso] = useState('');
    const [oficina, setOficina] = useState('');
    const [consultorio, setConsultorio] = useState('');
    const [ubicacionesGuardadas, setUbicacionesGuardadas] = useState<UbicacionGuardada[]>([]);

    // Estados locales para el ítem del problema (Ahora es un número por defecto)
    const [tipoSoporte, setTipoSoporte] = useState<number>(1);
    const [descripcion, setDescripcion] = useState('');

    // Cargar las ubicaciones guardadas anteriormente al abrir la pantalla
    useEffect(() => {
        const cargarUbicaciones = async () => {
            try {
                const userDataStr = await obtenerItem('userData');
                const userId = userDataStr ? JSON.parse(userDataStr)?.id : 'default';
                const key = `${STORAGE_KEY_UBICACIONES}_${userId}`;
                const guardadasStr = await obtenerItem(key);
                if (guardadasStr) {
                    const lista = JSON.parse(guardadasStr);
                    if (Array.isArray(lista)) {
                        setUbicacionesGuardadas(lista);
                    }
                }
            } catch (e) {
                console.log('No se pudieron leer ubicaciones guardadas:', e);
            }
        };
        cargarUbicaciones();
    }, []);

    const guardarUbicacionEnHistorial = async (nueva: UbicacionGuardada) => {
        try {
            const userDataStr = await obtenerItem('userData');
            const userId = userDataStr ? JSON.parse(userDataStr)?.id : 'default';
            const key = `${STORAGE_KEY_UBICACIONES}_${userId}`;

            // Evitamos duplicados exactos (insensible a mayúsculas) y ponemos la más reciente primero
            const sinDuplicados = ubicacionesGuardadas.filter(
                (u) =>
                    !(
                        u.piso.toLowerCase() === nueva.piso.toLowerCase() &&
                        u.oficina.toLowerCase() === nueva.oficina.toLowerCase() &&
                        u.consultorio.toLowerCase() === nueva.consultorio.toLowerCase()
                    )
            );
            const actualizada = [nueva, ...sinDuplicados].slice(0, 5); // Guardamos hasta las últimas 5 ubicaciones
            setUbicacionesGuardadas(actualizada);
            await guardarItem(key, JSON.stringify(actualizada));
        } catch (e) {
            console.log('No se pudo guardar la ubicación:', e);
        }
    };

    const eliminarUbicacionGuardada = async (indexAEliminar: number) => {
        try {
            const userDataStr = await obtenerItem('userData');
            const userId = userDataStr ? JSON.parse(userDataStr)?.id : 'default';
            const key = `${STORAGE_KEY_UBICACIONES}_${userId}`;
            const actualizada = ubicacionesGuardadas.filter((_, idx) => idx !== indexAEliminar);
            setUbicacionesGuardadas(actualizada);
            await guardarItem(key, JSON.stringify(actualizada));
        } catch (e) {
            console.log('Error al eliminar ubicación guardada:', e);
        }
    };

    const seleccionarUbicacionGuardada = (u: UbicacionGuardada) => {
        setPiso(u.piso);
        setOficina(u.oficina);
        setConsultorio(u.consultorio);
    };

    const manejarEnvio = () => {
        // 1. Validación básica
        if (!oficina.trim() && !consultorio.trim()) {
            Alert.alert('Faltan datos', 'Por favor ingresa al menos la oficina o el consultorio.');
            return;
        }

        if (!descripcion.trim()) {
            Alert.alert('Faltan datos', 'Por favor describe brevemente el problema.');
            return;
        }

        const ubicacionActual: UbicacionGuardada = {
            piso: piso.trim(),
            oficina: oficina.trim(),
            consultorio: consultorio.trim(),
        };

        // 2. Armamos la estructura exacta (Payload)
        const payload: CrearSolicitudPayload = {
            ...ubicacionActual,
            items: [
                {
                    id_tipo_soporte: tipoSoporte, // Ya es numérico, no necesita parseInt
                    descripcion: descripcion.trim(),
                }
            ]
        };

        // 3. Ejecutamos el Hook y guardamos la ubicación para la próxima vez
        enviarSolicitud(payload, async () => {
            await guardarUbicacionEnHistorial(ubicacionActual);
            Alert.alert('Éxito', 'Tu solicitud de soporte ha sido enviada.');
            navigation.goBack();
        });
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={esEscritorio ? { width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: 40 } : { paddingBottom: paddingInferiorSeguro }}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Ubicación para Soporte</Text>

                {/* OPCIONES DE UBICACIONES GUARDADAS PREVIAMENTE */}
                {ubicacionesGuardadas.length > 0 && (
                    <View style={styles.savedLocationsBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <AppIcon name="pin" size={14} color="#2a5298" />
                            <Text style={[styles.savedLocationsTitle, { marginBottom: 0, marginLeft: 5 }]}>
                                Tu ubicación guardada (toca para rellenar):
                            </Text>
                        </View>
                        {ubicacionesGuardadas.map((u, idx) => {
                            const esSeleccionada =
                                piso === u.piso &&
                                oficina === u.oficina &&
                                consultorio === u.consultorio;
                            const resumen = [
                                u.piso ? `Piso: ${u.piso}` : null,
                                u.oficina ? `Oficina: ${u.oficina}` : null,
                                u.consultorio ? `Cons.: ${u.consultorio}` : null,
                            ]
                                .filter(Boolean)
                                .join('  •  ');

                            return (
                                <View
                                    key={idx}
                                    style={[
                                        styles.savedChipRow,
                                        esSeleccionada && styles.savedChipRowActive,
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }}
                                        onPress={() => seleccionarUbicacionGuardada(u)}
                                        disabled={isLoading}
                                    >
                                        <AppIcon
                                            name={esSeleccionada ? 'check' : 'pin'}
                                            size={13}
                                            color={esSeleccionada ? '#2a5298' : '#555'}
                                        />
                                        <Text
                                            style={[
                                                styles.savedChipText,
                                                { marginLeft: 6 },
                                                esSeleccionada && styles.savedChipTextActive,
                                            ]}
                                        >
                                            {resumen}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={{ paddingHorizontal: 10, paddingVertical: 8 }}
                                        onPress={() => eliminarUbicacionGuardada(idx)}
                                        disabled={isLoading}
                                    >
                                        <Text style={{ fontSize: 13, color: '#999', fontWeight: 'bold' }}>✕</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}

                <Text style={styles.label}>Piso</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ej: Planta Baja, Piso 2..."
                    value={piso}
                    onChangeText={setPiso}
                    editable={!isLoading}
                />

                <Text style={styles.label}>Oficina</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ej: Contabilidad, RRHH..."
                    value={oficina}
                    onChangeText={setOficina}
                    editable={!isLoading}
                />

                <Text style={styles.label}>Consultorio (Opcional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ej: Consultorio 12..."
                    value={consultorio}
                    onChangeText={setConsultorio}
                    editable={!isLoading}
                />

                <View style={styles.divider} />

                <Text style={styles.sectionTitle}>Detalle del Problema</Text>

                <Text style={styles.label}>¿Qué tipo de problema tienes?</Text>

                {/* TARJETAS SELECCIONABLES EN LUGAR DE TEXTINPUT */}
                <View style={styles.optionsContainer}>
                    {TIPOS_SOPORTE.map((tipo) => (
                        <TouchableOpacity
                            key={tipo.id}
                            style={[
                                styles.optionCard,
                                tipoSoporte === tipo.id && styles.optionCardActive
                            ]}
                            onPress={() => setTipoSoporte(tipo.id)}
                            disabled={isLoading}
                        >
                            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tipoSoporte === tipo.id ? '#dbeafe' : '#edf2f7', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                <AppIcon name={tipo.icono} size={20} color={tipoSoporte === tipo.id ? '#2a5298' : '#4a5568'} />
                            </View>
                            <View style={styles.optionTextContainer}>
                                <Text style={[
                                    styles.optionTitle,
                                    tipoSoporte === tipo.id && styles.optionTitleActive
                                ]}>
                                    {tipo.titulo}
                                </Text>
                                <Text style={styles.optionDesc}>{tipo.desc}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.label}>Descripción</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe el problema detalladamente..."
                    multiline
                    numberOfLines={4}
                    value={descripcion}
                    onChangeText={setDescripcion}
                    editable={!isLoading}
                />

                <TouchableOpacity
                    style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                    onPress={manejarEnvio}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitButtonText}>Enviar Solicitud</Text>
                    )}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f6fa',
        padding: 16,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 8,
        padding: 16,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2a5298',
        marginBottom: 12,
    },
    savedLocationsBox: {
        backgroundColor: '#f0f5fc',
        borderRadius: 8,
        padding: 10,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#d0dff5',
    },
    savedLocationsTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#2a5298',
        marginBottom: 8,
    },
    savedChipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#cbd8ec',
        marginBottom: 6,
    },
    savedChipRowActive: {
        borderColor: '#2a5298',
        backgroundColor: '#e6effc',
        borderWidth: 1.5,
    },
    savedChipText: {
        fontSize: 13,
        color: '#333',
        fontWeight: '500',
    },
    savedChipTextActive: {
        color: '#2a5298',
        fontWeight: 'bold',
    },
    label: {
        fontSize: 14,
        color: '#333',
        marginBottom: 4,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#f9f9f9',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        marginBottom: 16,
        color: '#333',
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    divider: {
        height: 1,
        backgroundColor: '#eee',
        marginVertical: 16,
    },
    submitButton: {
        backgroundColor: '#2a5298',
        paddingVertical: 14,
        borderRadius: 6,
        alignItems: 'center',
        marginTop: 8,
    },
    submitButtonDisabled: {
        backgroundColor: '#9fb3d0',
    },
    submitButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },

    // ESTILOS PARA LAS NUEVAS TARJETAS DE SELECCIÓN
    optionsContainer: {
        marginTop: 8,
        marginBottom: 16,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 6,
        backgroundColor: '#f9f9f9',
        marginBottom: 10,
    },
    optionCardActive: {
        borderColor: '#2a5298',
        backgroundColor: '#eef2f9',
    },
    optionIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    optionTextContainer: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    optionTitleActive: {
        color: '#2a5298',
    },
    optionDesc: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    }
});