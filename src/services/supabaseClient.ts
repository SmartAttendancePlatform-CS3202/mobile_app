import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ywxuyhdvcvfqayckertu.supabase.co';

export const SUPABASE_ANON_KEY = 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3eHV5aGR2Y3ZmcWF5Y2tlcnR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDE3OTY3OCwiZXhwIjoyMDk5NzU1Njc4fQ.ODNtjbvjNqCgpGH7L7bWz5Zt4WAgwFVf-ucKbNVC8L8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
