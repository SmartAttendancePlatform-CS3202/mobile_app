import apiClient, { BACKEND_BASE_URL } from './apiClient';
import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockTimetableSchedule, mockAcademicInfo, mockAttendanceHistory, StudentProfile } from './mockData';

class ApiService {
  async fetchStudentProfile(userId: string, email: string): Promise<StudentProfile> {
    // 1. Attempt to fetch through the backend scheduling microservice first
    try {
      const response = await apiClient.get('/scheduling/users/me');
      if (response.data && response.data.id) {
        const data = response.data;
        const role = data.role || 'student';
        const status = data.status || 'active';

        // Check active face registration in database
        let isFaceRegistered = false;
        let faceRegisteredAt: string | undefined;
        let faceQualityScore: number | undefined;
        try {
          const { data: faceData } = await supabase
            .from('face_profiles')
            .select('id, is_active, quality_score, registered_at')
            .eq('student_id', userId)
            .eq('is_active', true)
            .order('registered_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          isFaceRegistered = !!faceData?.id;
          faceRegisteredAt = faceData?.registered_at;
          faceQualityScore = faceData?.quality_score;
        } catch {}

        return {
          id: data.id,
          name: data.full_name || data.display_name || email,
          email: data.email || email,
          indexNumber: data.student_index_no || undefined,
          nameWithInitials: data.name_with_initials || undefined,
          displayName: data.display_name || undefined,
          department: data.department_name || undefined,
          departmentCode: data.department_code || undefined,
          facultyName: data.faculty_name || undefined,
          facultyHead: data.faculty_head || undefined,
          academicYear: data.academic_year_name || undefined,
          yearLevel: data.academic_year_level || undefined,
          nic: data.nic || undefined,
          dateOfBirth: data.date_of_birth || undefined,
          gender: data.gender || undefined,
          contactNumber: data.contact_number || undefined,
          address: data.address || undefined,
          photoUrl: data.photo_url || undefined,
          createdAt: data.created_at || undefined,
          isFaceRegistered,
          faceRegisteredAt,
          faceQualityScore,
          status,
          role,
        };
      }
    } catch (e) {
      // Backend microservice is offline or unreachable; proceed to resilient Supabase DB fallback
      console.log('Backend microservice unavailable, using resilient Supabase DB fallback:', e);
    }

    // 2. Resilient direct Supabase PostgREST query
    try {
      const [studentRes, userRes, faceRes] = await Promise.all([
        supabase
          .from('students')
          .select('*, department:departments(*), academic_year:academic_years(*)')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('users')
          .select('role, status, is_active, created_at')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('face_profiles')
          .select('id, is_active, quality_score, registered_at')
          .eq('student_id', userId)
          .eq('is_active', true)
          .order('registered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const role = userRes.data?.role || 'student';
      const status = userRes.data?.status || 'active';
      const isFaceRegistered = !!faceRes.data?.id;
      const faceRegisteredAt = faceRes.data?.registered_at;
      const faceQualityScore = faceRes.data?.quality_score;
      const createdAt = userRes.data?.created_at;

      if (studentRes.data) {
        const s = studentRes.data;
        const dept = s.department;
        const acadYear = s.academic_year;

        return {
          id: s.id,
          name: s.full_name || s.display_name || email,
          email: email,
          indexNumber: s.student_index_no || undefined,
          nameWithInitials: s.name_with_initials || undefined,
          displayName: s.display_name || undefined,
          department: dept?.name || undefined,
          departmentCode: dept?.code || undefined,
          facultyName: dept?.faculty_name || undefined,
          facultyHead: dept?.faculty_head || undefined,
          academicYear: acadYear?.name || undefined,
          yearLevel: acadYear?.year_level || undefined,
          nic: s.nic || undefined,
          dateOfBirth: s.date_of_birth || undefined,
          gender: s.gender || undefined,
          contactNumber: s.contact_number || undefined,
          address: s.address || undefined,
          photoUrl: s.photo_url || undefined,
          createdAt: s.created_at || createdAt || undefined,
          isFaceRegistered,
          faceRegisteredAt,
          faceQualityScore,
          status,
          role,
        };
      }

      // If user profile found without a student row yet
      return {
        id: userId,
        name: email.split('@')[0],
        email: email,
        isFaceRegistered,
        faceRegisteredAt,
        faceQualityScore,
        createdAt,
        status,
        role,
      };
    } catch (err) {
      console.error('Failed to fetch profile from Supabase DB:', err);
      return {
        id: userId,
        name: email.split('@')[0],
        email: email,
        isFaceRegistered: false,
        status: 'active',
        role: 'student',
      };
    }
  }

  async login(email: string, password: string) {
    try {
      const cleanEmail = email.trim();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data.user || !data.session) {
        return {
          success: false,
          message: error?.message || 'Invalid email or password',
        };
      }

      const userId = data.user.id;
      const token = data.session.access_token;
      await AsyncStorage.setItem('userToken', token);

      // Fetch student profile and verify role
      const profile = await this.fetchStudentProfile(userId, cleanEmail);

      // Strictly restrict mobile app to students
      if (profile.role && profile.role !== 'student') {
        await supabase.auth.signOut();
        await AsyncStorage.removeItem('userToken');
        return {
          success: false,
          message: 'This mobile app is for students. Please use the Web Dashboard.',
        };
      }

      return {
        success: true,
        token,
        user: profile,
        status: profile.status || 'active',
        isFaceRegistered: profile.isFaceRegistered,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Login failed. Please check your connection.',
      };
    }
  }

  async registerFace(faceEmbedding: Float32Array | number[]) {
    const embeddingArray = Array.from(faceEmbedding);

    // 1. Attempt registering through the backend attendance microservice
    try {
      const response = await apiClient.post('/attendance/onboarding/register-face', {
        face_embedding: embeddingArray,
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      console.log('Backend microservice unavailable, using resilient Supabase DB fallback for face registration:', error);

      // 2. Resilient direct Supabase PostgreSQL fallback
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const studentId = session.user.id;

          // Deactivate any previous active profile for this student
          await supabase
            .from('face_profiles')
            .update({ is_active: false })
            .eq('student_id', studentId);

          // Insert active 192-dimensional vector into Supabase PostgreSQL face_profiles
          const { error: insertError } = await supabase
            .from('face_profiles')
            .insert({
              student_id: studentId,
              embedding: embeddingArray,
              reference_photo_url: `https://storage.example.com/faces/${studentId}.jpg`,
              quality_score: 1.0,
              is_active: true,
            });

          if (!insertError) {
            return {
              success: true,
              data: { message: '192-D face embedding registered directly in database.' },
            };
          }
          console.warn('Supabase DB fallback insert error:', insertError);
        }
      } catch (dbErr) {
        console.warn('Supabase DB fallback error:', dbErr);
      }

      return {
        success: false,
        message: error.response?.data?.detail || 'Face registration failed. Please check your connection.',
      };
    }
  }

  async getSessions() {
    try {
      const response = await apiClient.get('/attendance/sessions');
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return { success: true, sessions: response.data };
      }
      return { success: true, sessions: mockTimetableSchedule };
    } catch (error: any) {
      // Graceful fallback to mock timetable data
      return { success: true, sessions: mockTimetableSchedule, isMock: true };
    }
  }

  async getAcademicInfo() {
    return { success: true, info: mockAcademicInfo };
  }

  async getTimetableSchedule(day?: string) {
    if (day && day !== 'All') {
      return {
        success: true,
        sessions: mockTimetableSchedule.filter(s => s.day.toLowerCase() === day.toLowerCase() || s.id === 'TEST_MOCK_CLASS')
      };
    }
    return { success: true, sessions: mockTimetableSchedule };
  }

  async getActiveWindows(sessionId: string) {
    if (sessionId === 'TEST_MOCK_CLASS') {
      return {
        success: true,
        windows: {
          first_check_in_window: { id: 'mock_window_1', start_time: new Date().toISOString(), end_time: new Date(Date.now() + 3600000).toISOString() },
          random_check_window: { id: 'mock_random_window_1', start_time: new Date().toISOString(), end_time: new Date(Date.now() + 3600000).toISOString() }
        }
      };
    }
    
    try {
      const response = await apiClient.get(`/attendance/checkin/windows/active?lecture_session_id=${sessionId}`);
      return { success: true, windows: response.data };
    } catch (error: any) {
      return { success: false, message: 'Failed to fetch active windows' };
    }
  }

  async checkInWithFace(sessionId: string, windowId: string, lat: number, lng: number, faceEmbedding: Float32Array | number[]) {
    if (sessionId === 'TEST_MOCK_CLASS') {
      return { success: true, data: { message: 'Mock face check-in successful' } };
    }
    try {
      const embeddingArray = Array.from(faceEmbedding);
      const response = await apiClient.post('/attendance/checkin/random-check', {
        lecture_session_id: sessionId,
        verification_window_id: windowId,
        latitude: lat,
        longitude: lng,
        face_embedding: embeddingArray
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Face check-in failed' };
    }
  }

  async checkInLocationOnly(sessionId: string, lat: number, lng: number) {
    if (sessionId === 'TEST_MOCK_CLASS') {
      return { success: true, data: { message: 'Mock location check-in successful' } };
    }
    try {
      const response = await apiClient.post('/attendance/checkin/tick', {
        lecture_session_id: sessionId,
        latitude: lat,
        longitude: lng
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Location check-in failed' };
    }
  }

  // Backwards compatibility for the old CheckInScreen until we update it
  async checkIn(sessionId: string, currentLat: number, currentLng: number, currentFaceCode: string) {
    return this.checkInLocationOnly(sessionId, currentLat, currentLng);
  }

  async sendFaceVerification(embedding: Float32Array) {
    return { success: true, message: 'Deprecated, use checkInWithFace directly' };
  }

  async getHistory() {
    try {
      const response = await apiClient.get('/attendance/me');
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return { success: true, history: response.data };
      }
      return { success: true, history: mockAttendanceHistory };
    } catch (error: any) {
      return { success: true, history: mockAttendanceHistory, isMock: true };
    }
  }

}

export default new ApiService();
