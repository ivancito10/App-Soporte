import React, { useState, useEffect, useRef } from 'react';
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
    Image,
    Keyboard,
    KeyboardAvoidingView,
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

// Opciones visuales amigables con iconos vectoriales limpios
const TIPOS_SOPORTE: Array<{ id: number; icono: NombreIcono; titulo: string; desc: string }> = [
    {
        id: 1,
        icono: 'laptop',
        titulo: 'Equipos físicos',
        desc: 'Problemas con computadoras, impresoras, teclados, cables, etc.'
    },
    {
        id: 2,
        icono: 'gear',
        titulo: 'Sistema SIGHO',
        desc: 'Errores en módulos, permisos, accesos o fallos del software.'
    },
    {
        id: 3,
        icono: 'globe',
        titulo: 'Redes e Internet',
        desc: 'Sin conexión a internet, red lenta o problemas de red local.'
    }
];

export const CrearSolicitudScreen = () => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { enviarSolicitud, isLoading } = useCrearSolicitud();

    const esPantallaAncha = width >= 640;
    const esEscritorio = Platform.OS === 'web' && width > 768;

    const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);

    // Estados locales para el formulario de ubicación
    const [piso, setPiso] = useState('');
    const [oficina, setOficina] = useState('');
    const [consultorio, setConsultorio] = useState('');
    const [ubicacionesGuardadas, setUbicacionesGuardadas] = useState<UbicacionGuardada[]>([]);

    // Estados locales para el ítem del problema
    const [tipoSoporte, setTipoSoporte] = useState<number>(1);
    const [descripcion, setDescripcion] = useState('');

    // Estado para resaltar input activo y detector de teclado abierto
    const [campoEnfocado, setCampoEnfocado] = useState<string | null>(null);
    const [tecladoVisible, setTecladoVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => setTecladoVisible(true));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setTecladoVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

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

            // Evitamos duplicados exactos y guardamos hasta las últimas 5
            const sinDuplicados = ubicacionesGuardadas.filter(
                (u) =>
                    !(
                        u.piso.toLowerCase() === nueva.piso.toLowerCase() &&
                        u.oficina.toLowerCase() === nueva.oficina.toLowerCase() &&
                        u.consultorio.toLowerCase() === nueva.consultorio.toLowerCase()
                    )
            );
            const actualizada = [nueva, ...sinDuplicados].slice(0, 5);
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

        const payload: CrearSolicitudPayload = {
            ...ubicacionActual,
            items: [
                {
                    id_tipo_soporte: tipoSoporte,
                    descripcion: descripcion.trim(),
                }
            ]
        };

        enviarSolicitud(payload, async () => {
            await guardarUbicacionEnHistorial(ubicacionActual);
            Alert.alert('Éxito', 'Tu solicitud de soporte ha sido enviada.');
            navigation.goBack();
        });
    };

    return (
        <View style={styles.screenWrapper}>
            {/* 1. CABECERA INSTITUCIONAL PROPIA CON BOTÓN ATRÁS Y ONDAS */}
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
                        Nueva Solicitud
                    </Text>

                    {/* Espaciador simétrico derecho para centrar perfectamente el título */}
                    <View style={styles.headerSpacerRight} />
                </View>

                {/* Onda superior curva en el borde inferior */}
                <Image
                    source={require('../../../../assets/ondas-superiores.png')}
                    style={styles.headerBottomWave}
                    resizeMode="stretch"
                />
            </View>

            {/* CONTENEDOR CON EVITACIÓN DE TECLADO */}
            <KeyboardAvoidingView
                style={styles.keyboardAvoiding}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                {/* CONTENIDO DEL FORMULARIO CON SCROLL */}
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.innerContainer, { maxWidth: 720 }]}>
                        {/* 2. ENCABEZADO DE SECCIÓN (BANNER INSTITUCIONAL) */}
                        <View style={styles.sectionBannerRow}>
                            <View style={styles.blueCircleIcon}>
                                <AppIcon name="clipboard" size={22} color="#ffffff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sectionBannerTitle}>
                                    Registrar soporte técnico
                                </Text>
                                <Text style={styles.sectionBannerSub}>
                                    Completa los datos para asignar tu ticket a un técnico
                                </Text>
                            </View>
                        </View>

                        {/* 3. TARJETA 1 — UBICACIÓN PARA SOPORTE */}
                        <View style={styles.card}>
                            <View style={styles.cardHeaderRow}>
                                <View style={styles.cardHeaderIconBadge}>
                                    <AppIcon name="pin" size={17} color="#1d5bbf" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.cardHeaderTitle}>Ubicación para Soporte</Text>
                                    <Text style={styles.cardHeaderSub}>Indica dónde se encuentra el equipo o problema</Text>
                                </View>
                            </View>

                            {/* CHIPS DE UBICACIONES GUARDADAS */}
                            {ubicacionesGuardadas.length > 0 && (
                                <View style={styles.savedLocationsBox}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                        <AppIcon name="pin" size={13} color="#1d5bbf" />
                                        <Text style={styles.savedLocationsTitle}>
                                            Ubicaciones recientes (toca para rellenar):
                                        </Text>
                                    </View>
                                    {ubicacionesGuardadas.map((u, idx) => {
                                        const esSeleccionada =
                                            piso === u.piso &&
                                            oficina === u.oficina &&
                                            consultorio === u.consultorio;
                                        const resumen = [
                                            u.piso ? `Piso: ${u.piso}` : null,
                                            u.oficina ? `Ofic.: ${u.oficina}` : null,
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
                                                        color={esSeleccionada ? '#1d5bbf' : '#64748b'}
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.savedChipText,
                                                            esSeleccionada && styles.savedChipTextActive,
                                                        ]}
                                                        numberOfLines={1}
                                                    >
                                                        {resumen}
                                                    </Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={styles.savedChipDeleteBtn}
                                                    onPress={() => eliminarUbicacionGuardada(idx)}
                                                    disabled={isLoading}
                                                >
                                                    <Text style={styles.savedChipDeleteText}>✕</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}

                            {/* CAMPOS PISO Y OFICINA (2 columnas si ancho >= 640) */}
                            <View style={esPantallaAncha ? styles.twoColRow : null}>
                                <View style={esPantallaAncha ? styles.colHalf : styles.inputGroup}>
                                    <Text style={styles.inputLabel}>
                                        Piso <Text style={styles.requiredAsterisk}>*</Text>
                                    </Text>
                                    <View style={[
                                        styles.inputWithIconWrapper,
                                        campoEnfocado === 'piso' && styles.inputWithIconWrapperFocused
                                    ]}>
                                        <View style={styles.inputIconPrefix}>
                                            <AppIcon
                                                name="home"
                                                size={17}
                                                color={campoEnfocado === 'piso' ? '#1d5bbf' : '#64748b'}
                                            />
                                        </View>
                                        <TextInput
                                            style={styles.textInputField}
                                            placeholder="Ej: Planta Baja, Piso 2..."
                                            placeholderTextColor="#94a3b8"
                                            value={piso}
                                            onChangeText={setPiso}
                                            onFocus={() => setCampoEnfocado('piso')}
                                            onBlur={() => setCampoEnfocado(null)}
                                            editable={!isLoading}
                                        />
                                    </View>
                                </View>

                                <View style={esPantallaAncha ? styles.colHalf : styles.inputGroup}>
                                    <Text style={styles.inputLabel}>
                                        Oficina <Text style={styles.requiredAsterisk}>*</Text>
                                    </Text>
                                    <View style={[
                                        styles.inputWithIconWrapper,
                                        campoEnfocado === 'oficina' && styles.inputWithIconWrapperFocused
                                    ]}>
                                        <View style={styles.inputIconPrefix}>
                                            <AppIcon
                                                name="document"
                                                size={17}
                                                color={campoEnfocado === 'oficina' ? '#1d5bbf' : '#64748b'}
                                            />
                                        </View>
                                        <TextInput
                                            style={styles.textInputField}
                                            placeholder="Ej: Contabilidad, RRHH, Plataforma..."
                                            placeholderTextColor="#94a3b8"
                                            value={oficina}
                                            onChangeText={setOficina}
                                            onFocus={() => setCampoEnfocado('oficina')}
                                            onBlur={() => setCampoEnfocado(null)}
                                            editable={!isLoading}
                                        />
                                    </View>
                                </View>
                            </View>

                            {/* CAMPO CONSULTORIO */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>
                                    Consultorio <Text style={styles.optionalTag}>(Opcional)</Text>
                                </Text>
                                <View style={[
                                    styles.inputWithIconWrapper,
                                    campoEnfocado === 'consultorio' && styles.inputWithIconWrapperFocused
                                ]}>
                                <View style={styles.inputIconPrefix}>
                                    <AppIcon
                                        name="pin"
                                        size={17}
                                        color={campoEnfocado === 'consultorio' ? '#1d5bbf' : '#64748b'}
                                    />
                                </View>
                                <TextInput
                                    style={styles.textInputField}
                                    placeholder="Ej: Consultorio 12, Sala A..."
                                    placeholderTextColor="#94a3b8"
                                    value={consultorio}
                                    onChangeText={setConsultorio}
                                    onFocus={() => setCampoEnfocado('consultorio')}
                                    onBlur={() => setCampoEnfocado(null)}
                                    editable={!isLoading}
                                />
                            </View>
                        </View>
                    </View>

                    {/* 4. TARJETA 2 — DETALLE DEL PROBLEMA */}
                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <View style={styles.cardHeaderIconBadge}>
                                <AppIcon name="gear" size={17} color="#1d5bbf" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardHeaderTitle}>Detalle del Problema</Text>
                                <Text style={styles.cardHeaderSub}>Especifica la categoría y explica qué sucede</Text>
                            </View>
                        </View>

                        <Text style={styles.inputLabel}>
                            ¿Qué tipo de problema tienes? <Text style={styles.requiredAsterisk}>*</Text>
                        </Text>

                        {/* TARJETAS SELECCIONABLES CON CHECK A LA DERECHA */}
                        <View style={styles.categoriesContainer}>
                            {TIPOS_SOPORTE.map((tipo) => {
                                const activo = tipoSoporte === tipo.id;
                                return (
                                    <TouchableOpacity
                                        key={tipo.id}
                                        style={[
                                            styles.categoryCard,
                                            activo && styles.categoryCardActive,
                                        ]}
                                        onPress={() => setTipoSoporte(tipo.id)}
                                        disabled={isLoading}
                                        activeOpacity={0.8}
                                    >
                                        <View style={[styles.categoryIconCircle, activo && styles.categoryIconCircleActive]}>
                                            <AppIcon
                                                name={tipo.icono}
                                                size={19}
                                                color={activo ? '#1d5bbf' : '#64748b'}
                                            />
                                        </View>

                                        <View style={styles.categoryTextWrapper}>
                                            <Text style={[styles.categoryTitle, activo && styles.categoryTitleActive]}>
                                                {tipo.titulo}
                                            </Text>
                                            <Text style={styles.categoryDesc}>
                                                {tipo.desc}
                                            </Text>
                                        </View>

                                        {/* Círculo selector con check a la derecha */}
                                        <View style={[styles.radioCircle, activo && styles.radioCircleActive]}>
                                            {activo && <AppIcon name="check" size={13} color="#ffffff" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* DESCRIPCIÓN DETALLADA CON CONTADOR Y AUTO-SCROLL AL ENFOCAR */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>
                                Descripción detallada <Text style={styles.requiredAsterisk}>*</Text>
                            </Text>
                            <View style={[
                                styles.textAreaWrapper,
                                campoEnfocado === 'descripcion' && styles.textAreaWrapperFocused
                            ]}>
                                <TextInput
                                    style={styles.textAreaField}
                                    placeholder="Describe el problema detalladamente (ej: el sistema arroja error al imprimir, el equipo no enciende, no hay conexión)..."
                                    placeholderTextColor="#94a3b8"
                                    multiline
                                    numberOfLines={4}
                                    maxLength={500}
                                    value={descripcion}
                                    onChangeText={setDescripcion}
                                    onFocus={() => {
                                        setCampoEnfocado('descripcion');
                                        setTimeout(() => {
                                            scrollViewRef.current?.scrollToEnd({ animated: true });
                                        }, 150);
                                    }}
                                    onBlur={() => setCampoEnfocado(null)}
                                    editable={!isLoading}
                                />
                                <View style={styles.charCounterContainer}>
                                    <Text style={[
                                        styles.charCounterText,
                                        descripcion.length >= 450 && styles.charCounterWarning
                                    ]}>
                                        {descripcion.length} / 500
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* 5. BOTÓN PRINCIPAL PÍLDORA */}
                    <TouchableOpacity
                        style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                        onPress={manejarEnvio}
                        disabled={isLoading}
                        activeOpacity={0.85}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                            <View style={styles.submitButtonContent}>
                                <AppIcon name="check" size={18} color="#ffffff" />
                                <Text style={styles.submitButtonText}>Enviar Solicitud</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* 6. ONDAS INFERIORES DECORATIVAS (OCULTAS MIENTRAS EL TECLADO ESTÁ ABIERTO) */}
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
    </View>
    );
};

const styles = StyleSheet.create({
    screenWrapper: {
        flex: 1,
        backgroundColor: '#f4f7fb',
    },
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
    keyboardAvoiding: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    innerContainer: {
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    // Encabezado de sección
    sectionBannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
    },
    blueCircleIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1d5bbf',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    sectionBannerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    sectionBannerSub: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    // Tarjetas del formulario
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 5,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 12,
        marginBottom: 14,
    },
    cardHeaderIconBadge: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: '#eef4ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    cardHeaderTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    cardHeaderSub: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 1,
    },
    // Chips de ubicaciones guardadas
    savedLocationsBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 12,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    savedLocationsTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#1d5bbf',
        marginLeft: 6,
    },
    savedChipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        marginBottom: 6,
    },
    savedChipRowActive: {
        borderColor: '#1d5bbf',
        backgroundColor: '#eef4ff',
        borderWidth: 1.5,
    },
    savedChipText: {
        fontSize: 12,
        color: '#334155',
        fontWeight: '500',
        marginLeft: 6,
        flex: 1,
    },
    savedChipTextActive: {
        color: '#1d5bbf',
        fontWeight: 'bold',
    },
    savedChipDeleteBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    savedChipDeleteText: {
        fontSize: 12,
        color: '#94a3b8',
        fontWeight: 'bold',
    },
    // Formularios e inputs
    twoColRow: {
        flexDirection: 'row',
        gap: 12,
    },
    colHalf: {
        flex: 1,
        marginBottom: 14,
    },
    inputGroup: {
        marginBottom: 14,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#334155',
        marginBottom: 6,
    },
    requiredAsterisk: {
        color: '#dc2626',
        fontWeight: 'bold',
    },
    optionalTag: {
        fontSize: 12,
        color: '#94a3b8',
        fontWeight: 'normal',
    },
    inputWithIconWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        paddingHorizontal: 12,
    },
    inputWithIconWrapperFocused: {
        borderWidth: 1.8,
        borderColor: '#1d5bbf',
        backgroundColor: '#ffffff',
    },
    inputIconPrefix: {
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textInputField: {
        flex: 1,
        paddingVertical: 11,
        fontSize: 14,
        color: '#1e293b',
    },
    textAreaWrapper: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 8,
    },
    textAreaWrapperFocused: {
        borderWidth: 1.8,
        borderColor: '#1d5bbf',
        backgroundColor: '#ffffff',
    },
    textAreaField: {
        minHeight: 100,
        fontSize: 14,
        color: '#1e293b',
        textAlignVertical: 'top',
        padding: 0,
    },
    charCounterContainer: {
        alignItems: 'flex-end',
        marginTop: 6,
    },
    charCounterText: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '500',
    },
    charCounterWarning: {
        color: '#d97706',
        fontWeight: 'bold',
    },
    // Tarjetas de categorías / tipos de soporte
    categoriesContainer: {
        marginBottom: 14,
        marginTop: 2,
    },
    categoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 14,
        backgroundColor: '#ffffff',
        marginBottom: 10,
    },
    categoryCardActive: {
        borderWidth: 1.5,
        borderColor: '#1d5bbf',
        backgroundColor: '#eef4ff',
    },
    categoryIconCircle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    categoryIconCircleActive: {
        backgroundColor: '#dbeafe',
    },
    categoryTextWrapper: {
        flex: 1,
        marginRight: 10,
    },
    categoryTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    categoryTitleActive: {
        color: '#1d5bbf',
    },
    categoryDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
        lineHeight: 16,
    },
    radioCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#cbd5e1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioCircleActive: {
        borderWidth: 0,
        backgroundColor: '#1d5bbf',
    },
    // Botón de envío
    submitButton: {
        backgroundColor: '#164a96',
        height: 50,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
        marginBottom: 28,
        elevation: 3,
        shadowColor: '#164a96',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
    },
    submitButtonDisabled: {
        backgroundColor: '#94a3b8',
        elevation: 0,
    },
    submitButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: 'bold',
        marginLeft: 8,
        letterSpacing: 0.3,
    },
    // Ondas decorativas en la base
    bottomWavesWrapper: {
        width: '100%',
        height: 48,
        overflow: 'hidden',
        marginTop: 8,
    },
    bottomWavesImg: {
        width: '100%',
        height: 48,
    },
});
