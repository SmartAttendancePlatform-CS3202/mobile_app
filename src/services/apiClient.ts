import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In a real app, you would load this from an environment variable.
// Using 10.0.2.2 for Android emulator to access host localhost
export const BACKEND_BASE_URL = 'http://10.0.2.2:8000'; 
export const SUPABASE_URL = 'http://10.0.2.2:54321'; // Default local supabase url
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY5MzUxMTMyNiwiZXhwIjoxODgzMTE1MjMyNn0.randomkeyhere'; // Mock key

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
