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
      let { data: { session } } = await supabase.auth.getSession();

      // Proactively refresh if access token is expired or within 60s of expiring
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (session?.expires_at && session.expires_at <= nowInSeconds + 60) {
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshData.session) {
            session = refreshData.session;
            await AsyncStorage.setItem('userToken', session.access_token);
          }
        } catch (refreshErr) {
          console.warn('Proactive token refresh error:', refreshErr);
        }
      }

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

// Response interceptor: automatically refresh token and retry on 401 Token Expiration
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData.session?.access_token) {
          const newToken = refreshData.session.access_token;
          await AsyncStorage.setItem('userToken', newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } else {
          console.warn('Session refresh rejected by Supabase:', refreshError?.message);
        }
      } catch (refreshErr) {
        console.warn('Reactive token refresh error on 401:', refreshErr);
      }
    }

    if (!error.response && (error.code === 'ECONNABORTED' || error.message?.includes('Network Error'))) {
      console.warn(
        `[Network Error] Unable to connect to backend at ${BACKEND_BASE_URL}.\n` +
        `• If testing on a physical Android device over USB, ensure you ran: adb reverse tcp:8000 tcp:8000\n` +
        `• If testing over Wi-Fi, ensure EXPO_PUBLIC_API_URL in mobile-app/.env is set to http://<YOUR_PC_IP>:8000\n` +
        `• If testing on Android Emulator, set EXPO_PUBLIC_API_URL to http://10.0.2.2:8000`
      );
    }

    return Promise.reject(error);
  }
);


export default apiClient;
