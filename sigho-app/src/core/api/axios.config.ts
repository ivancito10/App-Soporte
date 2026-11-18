import axios from 'axios';
//import * as SecureStore from 'expo-secure-store';
import { obtenerItem } from '../utils/storage';

// IMPORTANTE: Si usas Expo Go en tu celular físico, NO puedes usar 'localhost'.
// Debes poner la IP de tu computadora en la red Wi-Fi (ej. 192.168.1.5).
// En Windows, abre CMD, escribe 'ipconfig' y busca 'Dirección IPv4'.
//const API_URL = 'http://192.168.100.108:3000/api'; // Reemplaza la IP aquí
const API_URL = 'http://192.168.2.151:3000/api'; // Reemplaza la IP aquí
//const API_URL = 'http://192.168.100.89:3000/api'; // Reemplaza la IP aquí

export const api = axios.create({
    baseURL: API_URL,
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