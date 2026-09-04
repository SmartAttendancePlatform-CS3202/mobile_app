import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

export { SUPABASE_URL, SUPABASE_ANON_KEY };

export const BACKEND_BASE_URL = 
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: BACKEND_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      // First attempt to get active token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || (await AsyncStorage.getItem('userToken'));
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Error attaching auth token to request:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;
