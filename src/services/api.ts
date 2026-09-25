import apiClient, { BACKEND_BASE_URL } from './apiClient';
import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StudentProfile, ClassSession, EnrolledModule, WeekDay, mockAcademicInfo } from './mockData';
import { calculateHaversineDistance } from '../utils/geo';
import { EMBEDDING_DIM } from '../embedding/faceEmbedding';

function mapOfferingToClassSession(offering: any): ClassSession {
  const rawDay = offering.day || 'Monday';
  const day = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(rawDay)
    ? rawDay
    : 'Monday') as WeekDay;

  const dayMap: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };

  const startTime = offering.start_time || offering.startTime || '08:00';
  const endTime = offering.end_time || offering.endTime || '10:00';

  // Compute duration (e.g. "2h" or "1h 30m")
  let duration = '2h';
  try {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let totalMins = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMins < 0) {
      totalMins += 24 * 60; // Spans past midnight
    }
    if (totalMins > 0) {
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      duration = hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`;
    }
  } catch {}

  const courseCode = offering.course_code || offering.course?.course_code || 'COURSE';
  const courseName = offering.course_name || offering.course?.name || 'Class Session';
  const lecturer = offering.lecturer_name || offering.lecturer?.user?.username || 'Lecturer';
  const venue = offering.venue_name || offering.venue?.name || 'Campus Venue';
  const venueId = offering.venue_id || offering.venue?.id || undefined;
  const credits = offering.course?.credits ?? offering.course_credits ?? undefined;

  return {
    id: offering.id,
    courseCode,
    courseName,
    lecturer,
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue,
    venue_id: venueId,
    day,
    dayIndex: dayMap[day] || 1,
    startTime,
    endTime,
    duration,
    isActive: false,
    credits,
    semester: offering.semester || undefined,
    offeringCode: offering.offering_code || undefined,
  };
}

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
        } catch { }

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

  async registerFace(
    faceEmbedding: Float32Array | number[],
    poseEmbeddings?: (Float32Array | number[])[],
    depthFeatures?: number[],
    enrollmentMetadata?: Record<string, any>,
    qualityScore: number = 1.0,
  ) {
    const embeddingArray = Array.from(faceEmbedding);
    const posesArray = poseEmbeddings
      ? poseEmbeddings.map((p) => Array.from(p))
      : undefined;

    // 1. Attempt registering through the backend attendance microservice
    try {
      const response = await apiClient.post('/attendance/onboarding/register-face', {
        face_embedding: embeddingArray,
        pose_embeddings: posesArray,
        depth_features: depthFeatures,
        enrollment_metadata: enrollmentMetadata,
        quality_score: qualityScore,
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

          // Insert active multi-dimensional vector into Supabase PostgreSQL face_profiles
          // Note: pgvector in PostgREST requires string literal format '[x1,x2,...]'
          const vectorLiteral = `[${embeddingArray.join(',')}]`;
          const { error: insertError } = await supabase
            .from('face_profiles')
            .insert({
              student_id: studentId,
              embedding: vectorLiteral,
              pose_embeddings: posesArray || null,
              depth_features: depthFeatures || null,
              enrollment_metadata: enrollmentMetadata || null,
              enrollment_version: 5,
              reference_photo_url: `https://storage.example.com/faces/${studentId}.jpg`,
              quality_score: qualityScore,
              is_active: true,
            });

          if (!insertError) {
            return {
              success: true,
              data: { message: 'Multi-dimensional face biometric profile registered directly in database.' },
            };
          }
          console.warn('Supabase DB fallback insert error:', JSON.stringify(insertError));
          if (insertError?.code === '23503') {
            return {
              success: false,
              message: 'Student account record not found in directory. Please contact your administrator to complete your student profile setup.',
            };
          }
          if (insertError?.message) {
            return {
              success: false,
              message: `Database registration error: ${insertError.message}`,
            };
          }
        }
      } catch (dbErr: any) {
        console.warn('Supabase DB fallback error:', dbErr);
      }

      return {
        success: false,
        message: error.response?.data?.detail || error.message || 'Face registration failed. Please check your connection.',
      };
    }
  }

  /**
   * Fetch all enrolled classes for the logged in student with triple-layer resilience:
   * 1. Primary: Backend scheduling microservice via Kong (/scheduling/timetables/me)
   * 2. Fallback: Direct Supabase PostgREST query on enrollments + course_offerings + courses + venues
   * 3. Complete Offline: AsyncStorage cached schedule
   */
  async getEnrolledClasses(day?: string): Promise<{ success: boolean; classes: ClassSession[]; message?: string }> {
    let classes: ClassSession[] = [];

    // 1. Primary: Attempt through Backend scheduling microservice via Kong
    try {
      const response = await apiClient.get('/scheduling/timetables/me');
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        classes = response.data.map(mapOfferingToClassSession);
        // Persist to local offline cache
        await AsyncStorage.setItem('@enrolled_classes_cache', JSON.stringify(classes)).catch(() => {});
      }
    } catch (e: any) {
      console.log('Backend scheduling microservice unavailable for timetable, using resilient Supabase DB fallback:', e?.message);
    }

    // 2. Resilient Direct Supabase Database Fallback if microservice failed or returned empty
    if (classes.length === 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const studentId = session?.user?.id;
        if (studentId) {
          const { data, error } = await supabase
            .from('enrollments')
            .select(`
              id,
              is_active,
              course_offering:course_offerings (
                id,
                offering_code,
                semester,
                day,
                start_time,
                end_time,
                venue_id,
                course:courses (id, course_code, name, credits),
                venue:venues (id, name, building, floor, boundary_data),
                lecturer:lecturers (id, user:users (username))
              )
            `)
            .eq('student_id', studentId)
            .eq('is_active', true);

          if (!error && data && data.length > 0) {
            const rawOfferings = data
              .map((row: any) => row.course_offering)
              .filter(Boolean);
            classes = rawOfferings.map(mapOfferingToClassSession);
            // Persist to local offline cache
            await AsyncStorage.setItem('@enrolled_classes_cache', JSON.stringify(classes)).catch(() => {});
          }
        }
      } catch (dbErr) {
        console.log('Supabase direct DB fallback for enrolled classes note:', dbErr);
      }
    }

    // 3. Complete Offline Cache Fallback (Airplane mode / zero internet)
    if (classes.length === 0) {
      try {
        const cached = await AsyncStorage.getItem('@enrolled_classes_cache');
        if (cached) {
          classes = JSON.parse(cached);
        }
      } catch (cacheErr) {
        console.log('AsyncStorage offline cache read note:', cacheErr);
      }
    }

    if (classes.length > 0) {
      // Sort classes by start time
      classes.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      // Filter by day if requested
      if (day && day !== 'All') {
        const filtered = classes.filter((c) => c.day?.toLowerCase() === day.toLowerCase());
        return { success: true, classes: filtered };
      }
      return { success: true, classes };
    }

    return { success: false, classes: [], message: 'No enrolled classes found for student.' };
  }

  /**
   * Derive a unique list of enrolled subjects/modules with total credits count.
   */
  async getEnrolledModulesSummary(): Promise<{
    success: boolean;
    modules: EnrolledModule[];
    totalCredits: number;
    message?: string;
  }> {
    const res = await this.getEnrolledClasses();
    if (!res.success || !res.classes || res.classes.length === 0) {
      return { success: false, modules: [], totalCredits: 0, message: res.message || 'No enrolled classes' };
    }

    const moduleMap = new Map<string, EnrolledModule>();
    let totalCredits = 0;

    for (const c of res.classes) {
      if (!moduleMap.has(c.courseCode)) {
        const credits = c.credits ?? 3;
        totalCredits += credits;
        moduleMap.set(c.courseCode, {
          id: c.id,
          courseCode: c.courseCode,
          courseName: c.courseName,
          credits,
          semester: c.semester,
          lecturer: c.lecturer,
          venue: c.venue,
          venue_id: c.venue_id,
          day: c.day,
          timeSlot: `${c.startTime} - ${c.endTime}`,
        });
      }
    }

    return {
      success: true,
      modules: Array.from(moduleMap.values()),
      totalCredits,
    };
  }

  /**
   * On-demand dynamic venue GPS geofence resolver for location verification
   */
  async getVenueDetails(venueId: string): Promise<{
    success: boolean;
    venue?: {
      name: string;
      building?: string;
      latitude: number;
      longitude: number;
      radiusMeters: number;
    };
    message?: string;
  }> {
    if (!venueId) {
      return { success: false, message: 'Venue ID is required' };
    }

    // 1. Primary: Backend scheduling microservice via Kong
    try {
      const response = await apiClient.get(`/scheduling/venues/${venueId}`);
      if (response.data) {
        const resolved = this.extractVenueCoordinates(response.data);
        return { success: true, venue: resolved };
      }
    } catch (e: any) {
      console.log('Backend venue endpoint unavailable, trying Supabase DB fallback:', e?.message);
    }

    // 2. Resilient direct Supabase DB fallback
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', venueId)
        .maybeSingle();

      if (!error && data) {
        const resolved = this.extractVenueCoordinates(data);
        return { success: true, venue: resolved };
      }
    } catch (dbErr) {
      console.log('Supabase venue query fallback error:', dbErr);
    }

    return { success: false, message: 'Could not resolve venue coordinates' };
  }

  private extractVenueCoordinates(venueData: any) {
    const boundary = venueData.boundary_data || {};
    let lat = boundary.latitude ?? boundary.center?.lat;
    let lng = boundary.longitude ?? boundary.center?.lng;
    let radius = boundary.radius_meters ?? boundary.radius_m ?? 30;

    // If shape is polygon and vertices array is given without explicit center, compute centroid
    if ((lat === undefined || lng === undefined) && Array.isArray(boundary.vertices) && boundary.vertices.length > 0) {
      let sumLat = 0;
      let sumLng = 0;
      for (const vertex of boundary.vertices) {
        if (Array.isArray(vertex) && vertex.length >= 2) {
          sumLat += Number(vertex[0]);
          sumLng += Number(vertex[1]);
        }
      }
      lat = sumLat / boundary.vertices.length;
      lng = sumLng / boundary.vertices.length;
    }

    return {
      name: venueData.name || 'Lecture Venue',
      building: venueData.building || 'Campus Hall',
      latitude: typeof lat === 'number' && !isNaN(lat) ? lat : 6.7951,
      longitude: typeof lng === 'number' && !isNaN(lng) ? lng : 79.9009,
      radiusMeters: typeof radius === 'number' && !isNaN(radius) ? radius : 30,
    };
  }

  async getSessions() {
    const res = await this.getEnrolledClasses();
    return {
      success: res.success,
      sessions: res.classes,
      message: res.message,
    };
  }

  async getAcademicInfo() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: student } = await supabase
          .from('students')
          .select('*, department:departments(*), academic_year:academic_years(*)')
          .eq('id', session.user.id)
          .maybeSingle();

        if (student) {
          return {
            success: true,
            info: {
              university: 'University of Moratuwa, Sri Lanka',
              faculty: student.department?.faculty_name || 'Faculty of Engineering',
              department: student.department?.name || 'Computer Science & Engineering',
              term: student.academic_year?.name || 'Academic Term',
              session: `Academic Year ${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
              period: 'Current Semester Session',
              group: student.department?.name || 'Computer Science & Engineering',
            },
          };
        }
      }
    } catch {}

    return { success: true, info: mockAcademicInfo };
  }

  async getTimetableSchedule(day?: string) {
    const res = await this.getEnrolledClasses(day);
    return {
      success: res.success,
      sessions: res.classes,
      message: res.message,
    };
  }

  /**
   * Resolves a sessionId (which may be a course_offering_id or lecture_session_id)
   * to a valid lecture_sessions ID.
   */
  async resolveLectureSession(sessionId: string): Promise<string> {
    if (!sessionId || sessionId === 'TEST_MOCK_CLASS' || !sessionId.includes('-')) {
      return sessionId;
    }

    try {
      // 1. Check if sessionId already exists as a lecture_session in Supabase
      const { data: existingLectureSession } = await supabase
        .from('lecture_sessions')
        .select('id')
        .eq('id', sessionId)
        .maybeSingle();

      if (existingLectureSession?.id) {
        return existingLectureSession.id;
      }

      // 2. If sessionId is a course_offering_id, check for today's session
      const todayDateStr = new Date().toISOString().split('T')[0];
      const { data: offeringSession } = await supabase
        .from('lecture_sessions')
        .select('id, status')
        .eq('course_offering_id', sessionId)
        .gte('scheduled_at', `${todayDateStr}T00:00:00Z`)
        .lte('scheduled_at', `${todayDateStr}T23:59:59Z`)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (offeringSession?.id) {
        return offeringSession.id;
      }
    } catch (err) {
      console.log('[api.resolveLectureSession] Resolution note:', err);
    }

    return sessionId;
  }

  async getActiveWindows(sessionId: string) {
    const resolvedId = await this.resolveLectureSession(sessionId);
    try {
      const response = await apiClient.get(`/attendance/checkin/windows/active?lecture_session_id=${resolvedId}`);
      if (response.data) {
        const data = response.data;
        return {
          success: true,
          lecture_session_id: data.lecture_session_id || resolvedId,
          windows: {
            ...data,
            first_check_in_window: data.first_check_in_window || data.check_in_window,
          }
        };
      }
    } catch (error: any) {
      console.log('Backend active windows check info:', error?.message);
    }

    return { success: false, lecture_session_id: resolvedId, message: 'Failed to fetch active windows' };
  }

  async checkInWithFace(
    sessionId: string,
    windowId: string,
    lat?: number,
    lng?: number,
    faceEmbedding?: Float32Array | number[],
    depthFeatures?: number[]
  ): Promise<{
    success: boolean;
    is_match?: boolean;
    confidence?: number;
    message: string;
    data?: any;
    requires_re_registration?: boolean;
  }> {
    if (!faceEmbedding) {
      return { success: false, is_match: false, message: 'No face biometric embedding provided' };
    }

    const resolvedSessionId = await this.resolveLectureSession(sessionId);
    const embeddingArray = Array.from(faceEmbedding);

    // Primary & Exclusive: Verify face and record attendance through server validation gates
    try {
      const response = await apiClient.post('/attendance/checkin/verify-face', {
        lecture_session_id: resolvedSessionId,
        verification_window_id: windowId,
        latitude: lat,
        longitude: lng,
        face_embedding: embeddingArray,
        depth_features: depthFeatures,
      });

      const resData = response.data;
      const isMatch = Boolean(resData?.is_match);
      const isSuccess = Boolean(resData?.success ?? isMatch);
      return {
        success: isSuccess && isMatch,
        is_match: isMatch,
        confidence: resData?.confidence,
        requires_re_registration: Boolean(resData?.requires_re_registration),
        message: resData?.message || (isMatch ? 'Face verification successful' : 'Biometric mismatch with registered profile'),
        data: resData,
      };
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail || error.response?.data?.message;
      if (error.response?.status === 400 || error.response?.status === 403 || error.response?.status === 409) {
        return {
          success: false,
          is_match: false,
          message: errorDetail || 'Face verification rejected by backend attendance service',
        };
      }
      return {
        success: false,
        is_match: false,
        message: errorDetail || error.message || 'Face verification service unavailable. Please check your connection and try again.',
      };
    }
  }

  async verifyLocation(sessionId: string, lat: number, lng: number): Promise<{
    success: boolean;
    inside: boolean;
    distance_meters?: number;
    radius_meters?: number;
    venue_name?: string;
    lecture_session_id?: string;
    message?: string;
  }> {
    const resolvedId = await this.resolveLectureSession(sessionId);

    try {
      const response = await apiClient.post('/attendance/checkin/verify-location', {
        lecture_session_id: resolvedId,
        latitude: lat,
        longitude: lng,
      });
      const data = response.data;
      return {
        success: true,
        inside: Boolean(data?.inside),
        distance_meters: data?.distance_meters,
        radius_meters: data?.radius_meters || 30,
        venue_name: data?.venue_name,
        lecture_session_id: data?.lecture_session_id || resolvedId,
        message: data?.inside
          ? 'Location verified within geofence'
          : `Outside geofence (${Math.round(data?.distance_meters || 0)}m away, must be <= ${Math.round(data?.radius_meters || 30)}m)`,
      };
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail;
      let msg = errorDetail || error.message || 'Location verification failed';
      if (errorDetail === 'Lecture session not found' || error.response?.status === 404) {
        msg = 'Lecture session is not yet active on the server. Please ensure the class has started or retry in a moment.';
      }
      return {
        success: false,
        inside: false,
        lecture_session_id: resolvedId,
        message: msg,
      };
    }
  }

  async checkInLocationOnly(sessionId: string, lat: number, lng: number) {
    const res = await this.verifyLocation(sessionId, lat, lng);
    return {
      success: res.success && res.inside,
      data: res,
      message: res.message,
    };
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
      return { success: true, history: response.data || [] };
    } catch (error: any) {
      return { success: false, history: [], message: error.response?.data?.detail || error.message || 'Failed to fetch attendance history' };
    }
  }

}

export default new ApiService();
