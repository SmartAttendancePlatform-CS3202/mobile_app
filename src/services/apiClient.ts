import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Support configuration via EXPO_PUBLIC_* environment variables
export const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000'; 
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://10.0.2.2:54321'; // Default local supabase url
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY5MzUxMTMyNiwiZXhwIjoxODgzMTE1MjMyNn0.randomkeyhere'; // Mock key

const apiClient = axios.create({
  baseURL: BACKEND_BASE_URL,
  timeout: 3000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const controller = new AbortController();
    config.signal = controller.signal;
    setTimeout(() => {
      controller.abort();
    }, 3000);

    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;
