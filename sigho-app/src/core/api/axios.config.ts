import axios from 'axios';
import { Platform } from 'react-native';
import { obtenerItem } from '../utils/storage';

const IP_LOCAL = '192.168.2.151';

const obtenerBaseUrl = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
        return `http://${window.location.hostname}:3000/api`;
    }
    return `http://${IP_LOCAL}:3000/api`;
};

export const api = axios.create({
    baseURL: obtenerBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor de peticiones (Se ejecuta ANTES de que la petición salga hacia NestJS)
api.interceptors.request.use(
    async (config) => {
        // 1. Buscamos el token guardado en el dispositivo
        const token = await obtenerItem('jwtToken');

        // 2. Si existe, lo inyectamos en la cabecera Authorization
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);