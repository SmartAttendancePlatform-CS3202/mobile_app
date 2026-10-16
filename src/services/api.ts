import apiClient, { BACKEND_BASE_URL } from './apiClient';
import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StudentProfile, ClassSession, EnrolledModule, WeekDay, mockAcademicInfo, AttendanceHistoryItem } from './mockData';
import { calculateHaversineDistance } from '../utils/geo';
import { EMBEDDING_DIM } from '../embedding/faceEmbedding';

/**
 * Safely normalizes any error object, Pydantic 422 validation array, or nested error response
 * into a single human-readable string guaranteed never to crash React Native's DialogModule.
 */
function extractErrorMessage(errorOrDetail: any, fallback: string = 'An unexpected error occurred'): string {
  if (!errorOrDetail) return fallback;
  if (typeof errorOrDetail === 'string') return errorOrDetail;

  // Axios error response object
  if (errorOrDetail?.isAxiosError || errorOrDetail?.response) {
    const data = errorOrDetail.response?.data;
    if (data?.detail) {
      return extractErrorMessage(data.detail, fallback);
    }
    if (data?.message) {
      return extractErrorMessage(data.message, fallback);
    }
    if (typeof errorOrDetail.message === 'string') {
      return errorOrDetail.message;
    }
  }

  // FastAPI / Pydantic validation array: [{ loc: [...], msg: "...", type: "..." }]
  if (Array.isArray(errorOrDetail)) {
    const messages = errorOrDetail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : undefined;
        const msg = item.msg || item.message || JSON.stringify(item);
        return field ? `${field}: ${msg}` : msg;
      }
      return String(item);
    });
    return messages.filter(Boolean).join('\n') || fallback;
  }

  if (typeof errorOrDetail === 'object') {
    if (typeof errorOrDetail.message === 'string') return errorOrDetail.message;
    if (typeof errorOrDetail.msg === 'string') return errorOrDetail.msg;
    if (typeof errorOrDetail.detail === 'string') return errorOrDetail.detail;
    try {
      return JSON.stringify(errorOrDetail);
    } catch {
      return fallback;
    }
  }

  return String(errorOrDetail);
}

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

  let geofence: { latitude: number; longitude: number; radiusMeters: number; radiusInMeters: number } | undefined = undefined;
  const boundary = offering.venue?.boundary_data || offering.boundary_data;
  if (boundary && typeof boundary === 'object') {
    const center = typeof boundary.center === 'object' && boundary.center !== null ? boundary.center : {};
    let lat = boundary.latitude ?? boundary.lat ?? center.lat ?? center.latitude;
    let lng = boundary.longitude ?? boundary.lng ?? boundary.lon ?? center.lng ?? center.longitude;
    const rad = boundary.radius_meters ?? boundary.radius_m ?? boundary.radius ?? 30;

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

    if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      const r = Number(rad) || 30;
      geofence = {
        latitude: Number(lat),
        longitude: Number(lng),
        radiusMeters: r,
        radiusInMeters: r,
      };
    }
  }

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
    geofence: geofence as any,
  };
}

function formatHeldDate(rawDate?: string | Date | null): string {
  if (!rawDate) return '02 Oct 2026';
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return String(rawDate);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(rawDate);
  }
}

export function formatModuleTitle(courseCode?: string, courseName?: string, rawCourse?: string): string {
  const code = (courseCode || '').trim();
  const name = (courseName || '').trim();
  const fallback = (rawCourse || '').trim();

  console.log(`[FORMAT_TITLE] code: '${code}', name: '${name}', fallback: '${fallback}'`);

  if (code && name && code !== 'COURSE' && name !== 'Class Session' && name !== 'Module' && code !== 'Module') {
    if (name.toLowerCase().includes(code.toLowerCase())) {
      return name;
    }
    return `${code} - ${name}`;
  }
  if (name && name !== 'Class Session' && name !== 'Module') {
    return name;
  }
  if (code && code !== 'COURSE' && code !== 'Module') {
    return code;
  }
  if (fallback && fallback !== 'COURSE Class Session' && fallback !== 'Module' && fallback !== 'Academic Module') {
    return fallback;
  }
  return '';
}

export function extractCourseDetails(sessionData: any): {
  courseCode: string;
  courseName: string;
  sessionNumber: number;
  notes: string;
  heldAt: string | undefined;
  courseOfferingId?: string;
} {
  if (!sessionData) {
    return { courseCode: '', courseName: '', sessionNumber: 1, notes: '', heldAt: undefined };
  }

  const session = Array.isArray(sessionData) ? sessionData[0] : sessionData;
  const offering = Array.isArray(session?.course_offering) ? session?.course_offering[0] : session?.course_offering;
  const course = Array.isArray(offering?.course) ? offering?.course[0] : offering?.course;

  const rawCode = (course?.course_code || offering?.course_code || session?.course_code || '').trim();
  const rawName = (course?.name || offering?.course_name || offering?.name || session?.course_name || '').trim();

  const courseCode = (rawCode && rawCode !== 'COURSE' && rawCode !== 'Module') ? rawCode : '';
  const courseName = (rawName && rawName !== 'Class Session' && rawName !== 'Module') ? rawName : '';
  const sessionNumber = session?.session_number || 1;
  const notes = (session?.notes || '').trim();
  const heldAt = session?.held_at || session?.scheduled_at;
  const courseOfferingId = session?.course_offering_id || offering?.id;

  return { courseCode, courseName, sessionNumber, notes, heldAt, courseOfferingId };
}

function normalizeAttendanceStatus(rawStatus?: string): 'Present' | 'Late' | 'Absent' {
  const s = (rawStatus || '').toLowerCase();
  if (s.includes('late')) return 'Late';
  if (s.includes('present')) return 'Present';
  return 'Absent';
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
          email: email || data.email,
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
              enrollment_version: 3,
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
        message: extractErrorMessage(error, 'Face registration failed. Please check your connection.'),
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

      let resultClasses = classes;
      // Filter by day if requested
      if (day && day !== 'All') {
        resultClasses = classes.filter((c) => c.day?.toLowerCase() === day.toLowerCase());
      }

      // --- Enrich with today's attendance status (fail-open) ---
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const studentId = authSession?.user?.id;

        if (studentId && resultClasses.length > 0) {
          const offeringIds = resultClasses.map((s: any) => s.id).filter(Boolean);

          let attendanceMap = new Map<string, {
            status: string;
            firstCheckInAt: string | null;
            randomCheckCompletedAt: string | null;
            lectureSessionId?: string | null;
          }>();

          // 1. Primary: Direct attendance records from Backend microservice
          try {
            const attMeRes = await apiClient.get('/attendance/me');
            if (attMeRes.data && Array.isArray(attMeRes.data)) {
              for (const rec of attMeRes.data) {
                const recData = {
                  status: rec.status,
                  firstCheckInAt: rec.first_check_in_at || null,
                  randomCheckCompletedAt: rec.random_check_completed_at || null,
                  lectureSessionId: rec.lecture_session_id || rec.lecture_session?.id || null,
                };
                if (rec.lecture_session?.course_offering_id) {
                  attendanceMap.set(rec.lecture_session.course_offering_id, recData);
                }
                if (rec.course_offering_id) {
                  attendanceMap.set(rec.course_offering_id, recData);
                }
                if (rec.lecture_session_id) {
                  attendanceMap.set(rec.lecture_session_id, recData);
                }
              }
            }
          } catch (e) {
            // Microservice may be offline, fallback to Supabase query below
          }

          // 2. Resilient Supabase database query (works via RLS)
          try {
            const { data: sbRecords, error: sbErr } = await supabase
              .from('attendance_records')
              .select(`
                id, status, first_check_in_at, random_check_completed_at, lecture_session_id,
                lecture_session:lecture_sessions (
                  id, course_offering_id, scheduled_at
                )
              `)
              .eq('student_id', studentId);

            if (!sbErr && sbRecords && sbRecords.length > 0) {
              for (const rec of sbRecords) {
                const ls = Array.isArray(rec.lecture_session)
                  ? rec.lecture_session[0]
                  : rec.lecture_session;
                const recData = {
                  status: rec.status,
                  firstCheckInAt: rec.first_check_in_at || null,
                  randomCheckCompletedAt: rec.random_check_completed_at || null,
                  lectureSessionId: rec.lecture_session_id || ls?.id || null,
                };
                if (ls?.course_offering_id) {
                  attendanceMap.set(ls.course_offering_id, recData);
                }
                if (rec.lecture_session_id) {
                  attendanceMap.set(rec.lecture_session_id, recData);
                }
              }
            }
          } catch (sbErr) {
            console.log('[getEnrolledClasses] Supabase attendance query note:', sbErr);
          }

          // 3. Query active random_check windows from Supabase
          let activeWindowsMap = new Map<string, { id: string; closeAt: string | null; lectureSessionId?: string }>();
          try {
            const { data: winData, error: winErr } = await supabase
              .from('verification_windows')
              .select(`
                id, lecture_session_id, window_type, is_active, scheduled_close_at,
                lecture_session:lecture_sessions ( id, course_offering_id )
              `)
              .eq('window_type', 'random_check')
              .eq('is_active', true);

            if (!winErr && winData && winData.length > 0) {
              for (const w of winData) {
                const winInfo = {
                  id: w.id,
                  closeAt: w.scheduled_close_at || null,
                  lectureSessionId: w.lecture_session_id || undefined,
                };
                if (w.lecture_session_id) {
                  activeWindowsMap.set(w.lecture_session_id, winInfo);
                }
                const ls = Array.isArray(w.lecture_session) ? w.lecture_session[0] : w.lecture_session;
                if (ls?.course_offering_id) {
                  activeWindowsMap.set(ls.course_offering_id, winInfo);
                }
              }
            }
          } catch (winErr) {
            console.log('[getEnrolledClasses] Active windows query note:', winErr);
          }

          // Merge into resultClasses
          resultClasses = resultClasses.map((s: any) => {
            const att = attendanceMap.get(s.id) || attendanceMap.get(s.offeringCode) || attendanceMap.get(s.courseCode);
            const activeWin = activeWindowsMap.get(s.id) || (att?.lectureSessionId ? activeWindowsMap.get(att.lectureSessionId) : undefined);
            const resolvedLectureSessionId = att?.lectureSessionId || activeWin?.lectureSessionId || undefined;
            const hasInitialCheckIn = Boolean(att?.firstCheckInAt);
            const hasRandomCheckCompleted = Boolean(att?.randomCheckCompletedAt);
            const isFullyCheckedIn = Boolean(
              att && (att.status === 'present' || att.status === 'late' || (hasInitialCheckIn && hasRandomCheckCompleted))
            );

            return {
              ...s,
              lectureSessionId: resolvedLectureSessionId,
              isCheckedIn: isFullyCheckedIn,
              initialVerified: hasInitialCheckIn,
              initialVerifiedAt: att?.firstCheckInAt || null,
              randomCheckActive: Boolean(activeWin && !hasRandomCheckCompleted),
              randomWindowId: activeWin?.id,
              randomCheckCloseAt: activeWin?.closeAt || null,
              randomCheckCompletedAt: att?.randomCheckCompletedAt || null,
              attendanceStatus: (att?.status as any) || (hasInitialCheckIn ? 'initial_verified' : null),
              checkedInAt: att?.firstCheckInAt || null,
            };
          });
        }
      } catch (attErr) {
        console.log('[getEnrolledClasses] Attendance enrichment note:', attErr);
        // Fail-open: return sessions without attendance data
      }

      return { success: true, classes: resultClasses };
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
    let lat = venueData.latitude ?? boundary.latitude ?? boundary.center?.lat;
    let lng = venueData.longitude ?? boundary.longitude ?? boundary.center?.lng;
    let radius = venueData.radius_meters ?? venueData.radius_m ?? boundary.radius_meters ?? boundary.radius_m ?? 30;

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

  async getActiveWindows(sessionId: string) {
    try {
      const response = await apiClient.get(`/attendance/checkin/windows/active?lecture_session_id=${sessionId}`);
      if (response.data) {
        const data = response.data;
        return {
          success: true,
          windows: {
            ...data,
            first_check_in_window: data.first_check_in_window || data.check_in_window,
          }
        };
      }
    } catch (error: any) {
      console.log('Backend active windows check info:', error?.message);
    }

    return { success: false, message: 'Failed to fetch active windows' };
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

    const embeddingArray = Array.from(faceEmbedding);

    // 1. Primary: Verify face against backend database via attendance-service API
    try {
      const response = await apiClient.post('/attendance/checkin/verify-face', {
        lecture_session_id: sessionId,
        verification_window_id: windowId,
        latitude: lat,
        longitude: lng,
        face_embedding: embeddingArray,
        depth_features: depthFeatures,
      });

      const resData = response.data;
      const isMatch = Boolean(resData?.is_match);
      if (isMatch) {
        this.invalidateHistoryCache().catch(() => {});
        AsyncStorage.removeItem('@enrolled_classes_cache').catch(() => {});
      }
      return {
        success: isMatch,
        is_match: isMatch,
        confidence: resData?.confidence,
        requires_re_registration: Boolean(resData?.requires_re_registration),
        message: resData?.message || (isMatch ? 'Face verification successful' : 'Biometric mismatch with registered profile'),
        data: resData,
      };
    } catch (error: any) {
      const errorDetail = extractErrorMessage(error, 'Face verification rejected by backend database');
      if (error.response?.status === 400 || error.response?.status === 403 || error.response?.status === 409 || error.response?.status === 422) {
        return {
          success: false,
          is_match: false,
          message: errorDetail,
        };
      }
      console.log('Backend attendance service unavailable, attempting resilient Supabase DB verification fallback:', error?.message);
    }

    // 2. Resilient Direct Supabase Database Fallback
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const studentId = session?.user?.id;
      if (!studentId) {
        return { success: false, is_match: false, message: 'Student is not authenticated.' };
      }

      // Query active registered face profile from Supabase PostgreSQL database
      const { data: profile, error: profileErr } = await supabase
        .from('face_profiles')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_active', true)
        .order('registered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileErr || !profile || !profile.embedding) {
        return {
          success: false,
          is_match: false,
          message: 'No active face biometric profile registered for student in database. Please register your face first.',
        };
      }

      // Check for legacy biometric profile (< v3)
      const enrollmentVersion = Number(profile.enrollment_version || 1);
      if (enrollmentVersion < 3) {
        return {
          success: false,
          is_match: false,
          requires_re_registration: true,
          message: 'Biometric profile upgrade required. Please re-register your face.',
        };
      }

      // Compute in-memory cosine similarity against stored pgvector embedding
      let storedEmbedding: number[] = [];
      if (Array.isArray(profile.embedding)) {
        storedEmbedding = profile.embedding;
      } else if (typeof profile.embedding === 'string') {
        try {
          storedEmbedding = JSON.parse(profile.embedding);
        } catch {
          storedEmbedding = profile.embedding.replace(/[\[\]]/g, '').split(',').map(Number);
        }
      }

      if (!storedEmbedding || storedEmbedding.length !== EMBEDDING_DIM) {
        return {
          success: false,
          is_match: false,
          message: 'Invalid stored biometric embedding format in database.',
        };
      }

      let dot = 0;
      let normRef = 0;
      let normLive = 0;
      for (let i = 0; i < EMBEDDING_DIM; i++) {
        const r = storedEmbedding[i] || 0;
        const l = embeddingArray[i] || 0;
        dot += r * l;
        normRef += r * r;
        normLive += l * l;
      }

      const similarity = (normRef > 0 && normLive > 0)
        ? dot / (Math.sqrt(normRef) * Math.sqrt(normLive))
        : 0;

      const threshold = 0.70;
      const isMatch = similarity >= threshold;

      if (!isMatch) {
        return {
          success: false,
          is_match: false,
          confidence: Number(similarity.toFixed(4)),
          message: `Face verification failed: Biometric mismatch with registered profile (${(similarity * 100).toFixed(1)}% similarity, requires 70%).`,
        };
      }

      // Persist attendance in Supabase database
      try {
        let lectureSessionId = sessionId;

        // Check if sessionId is an existing lecture_session
        const { data: existingLectureSession } = await supabase
          .from('lecture_sessions')
          .select('id')
          .eq('id', sessionId)
          .maybeSingle();

        if (!existingLectureSession?.id) {
          // If sessionId is a course_offering_id, check for today's session
          const todayDateStr = new Date().toISOString().split('T')[0];
          const { data: offeringSession } = await supabase
            .from('lecture_sessions')
            .select('id')
            .eq('course_offering_id', sessionId)
            .gte('scheduled_at', `${todayDateStr}T00:00:00Z`)
            .lte('scheduled_at', `${todayDateStr}T23:59:59Z`)
            .order('scheduled_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (offeringSession?.id) {
            lectureSessionId = offeringSession.id;
          } else {
            // Auto-provision today's lecture session for this course offering
            const { data: newSession } = await supabase
              .from('lecture_sessions')
              .insert({
                course_offering_id: sessionId,
                scheduled_at: new Date().toISOString(),
                duration_mins: 120,
                status: 'ongoing',
                held_at: new Date().toISOString(),
              })
              .select('id')
              .maybeSingle();

            if (newSession?.id) {
              lectureSessionId = newSession.id;
            }
          }
        }

        if (lectureSessionId) {
          await supabase
            .from('attendance_records')
            .upsert({
              lecture_session_id: lectureSessionId,
              student_id: studentId,
              status: 'present',
              first_check_in_at: new Date().toISOString(),
            }, { onConflict: 'lecture_session_id,student_id' });
          await this.invalidateHistoryCache(studentId);
          await AsyncStorage.removeItem('@enrolled_classes_cache').catch(() => {});
        }
      } catch (attErr) {
        console.warn('Supabase attendance record write note:', attErr);
      }

      return {
        success: true,
        is_match: true,
        confidence: Number(similarity.toFixed(4)),
        message: 'Face verified successfully against registered database profile. Attendance recorded.',
      };
    } catch (fallbackError: any) {
      return {
        success: false,
        is_match: false,
        message: 'Failed to verify face with backend database. Please check connection.',
      };
    }
  }

  async verifyLocation(sessionId: string, lat: number, lng: number): Promise<{
    success: boolean;
    inside: boolean;
    distance_meters?: number;
    radius_meters?: number;
    venue_name?: string;
    message?: string;
  }> {

    try {
      const response = await apiClient.post('/attendance/checkin/verify-location', {
        lecture_session_id: sessionId,
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
        message: data?.inside
          ? 'Location verified within geofence'
          : `Outside geofence (${Math.round(data?.distance_meters || 0)}m away, must be <= 30m)`,
      };
    } catch (error: any) {
      const msg = extractErrorMessage(error, 'Location verification failed');
      return {
        success: false,
        inside: false,
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

  async submitRandomCheck(
    sessionId: string,
    windowId?: string,
    lat?: number,
    lng?: number
  ): Promise<{
    success: boolean;
    attendanceStatus?: string;
    isFullyMarked?: boolean;
    message: string;
    distanceMeters?: number;
  }> {
    try {
      let latitude = lat;
      let longitude = lng;

      if (latitude === undefined || longitude === undefined) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return {
            success: false,
            message: 'Location permission denied. Please allow GPS access to verify presence in the lecture hall.',
          };
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }

      const cleanWindowId =
        windowId && typeof windowId === 'string' && windowId.trim().length > 0
          ? windowId.trim()
          : undefined;

      const body: any = {
        lecture_session_id: sessionId,
        latitude,
        longitude,
      };
      if (cleanWindowId) {
        body.verification_window_id = cleanWindowId;
      }

      // 1. Primary: Verify via Backend API microservice
      try {
        const response = await apiClient.post('/attendance/checkin/random-check', body);
        const data = response.data;
        if (data?.status === 'success') {
          await AsyncStorage.removeItem('@enrolled_classes_cache').catch(() => {});
          try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            if (authSession?.user?.id) {
              await this.invalidateHistoryCache(authSession.user.id);
            }
          } catch {}

          return {
            success: true,
            attendanceStatus: data.attendance_status,
            isFullyMarked: Boolean(data.is_fully_marked),
            message: typeof data.message === 'string' ? data.message : 'Random location check verified!',
            distanceMeters: data.distance_meters,
          };
        }

        return {
          success: false,
          message: extractErrorMessage(data?.message, 'Random location verification rejected.'),
          distanceMeters: data?.distance_meters,
        };
      } catch (apiError: any) {
        // If the backend gave an explicit rejection (400, 403, 409, 422), return clean error directly
        if (apiError.response && (apiError.response.status === 400 || apiError.response.status === 403 || apiError.response.status === 409 || apiError.response.status === 422)) {
          const errMsg = extractErrorMessage(apiError, 'Random location verification rejected.');
          return {
            success: false,
            message: errMsg,
          };
        }
        console.log('Backend random check endpoint unavailable, using resilient Supabase DB fallback:', apiError?.message);
      }

      // 2. Resilient Direct Supabase Database Fallback
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const studentId = authSession?.user?.id;
        if (!studentId) {
          return { success: false, message: 'Student is not authenticated.' };
        }

        let lectureSessionId: string | null = null;
        let venueId: string | null = null;
        let sessionMeta: { scheduled_at?: string; duration_mins?: number } | null = null;

        const { data: lsRow } = await supabase
          .from('lecture_sessions')
          .select('id, venue_id, course_offering_id, scheduled_at, duration_mins')
          .eq('id', sessionId)
          .maybeSingle();

        if (lsRow?.id) {
          lectureSessionId = lsRow.id;
          venueId = lsRow.venue_id;
          sessionMeta = lsRow;
        } else {
          // If sessionId is course_offering_id
          const todayDateStr = new Date().toISOString().split('T')[0];
          const { data: offLs } = await supabase
            .from('lecture_sessions')
            .select('id, venue_id, course_offering_id, scheduled_at, duration_mins')
            .eq('course_offering_id', sessionId)
            .gte('scheduled_at', `${todayDateStr}T00:00:00Z`)
            .lte('scheduled_at', `${todayDateStr}T23:59:59Z`)
            .order('scheduled_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (offLs?.id) {
            lectureSessionId = offLs.id;
            venueId = offLs.venue_id;
            sessionMeta = offLs;
          }
        }

        if (!lectureSessionId) {
          return {
            success: false,
            message: 'Active lecture session not found for this class.',
          };
        }

        // Verify that the class time has not ended
        if (sessionMeta?.scheduled_at) {
          const durationMins = Number(sessionMeta.duration_mins) || 60;
          const sessionEndMs = new Date(sessionMeta.scheduled_at).getTime() + durationMins * 60 * 1000;
          if (Date.now() > sessionEndMs) {
            return {
              success: false,
              message: 'Class time has ended. Random verification is closed.',
            };
          }
        }

        // Resolve active random_check window
        let activeWindowQuery = supabase
          .from('verification_windows')
          .select('id, window_type, is_active')
          .eq('lecture_session_id', lectureSessionId)
          .eq('window_type', 'random_check')
          .eq('is_active', true);

        if (cleanWindowId) {
          activeWindowQuery = activeWindowQuery.eq('id', cleanWindowId);
        }

        const { data: winData } = await activeWindowQuery.maybeSingle();
        const activeWindowId = winData?.id || cleanWindowId;

        // Check geofence
        let venueCoords = { latitude: 6.7951, longitude: 79.9009, radiusMeters: 30 };
        if (venueId) {
          const vRes = await this.getVenueDetails(venueId);
          if (vRes.success && vRes.venue) {
            venueCoords = vRes.venue;
          }
        }

        const dist = calculateHaversineDistance(
          latitude,
          longitude,
          venueCoords.latitude,
          venueCoords.longitude
        );
        const isInside = dist <= venueCoords.radiusMeters;

        if (!isInside) {
          if (activeWindowId) {
            try {
              await supabase.from('verification_attempts').insert({
                verification_window_id: activeWindowId,
                student_id: studentId,
                attempt_number: 1,
                used_face_verification: false,
                used_location_check: true,
                location_method: 'gps_geofence',
                latitude,
                longitude,
                distance_from_venue_meters: Math.round(dist * 100) / 100,
                status: 'failed',
                failure_reason: `Outside geofence (${Math.round(dist)}m away, must be <= ${venueCoords.radiusMeters}m)`,
              });
            } catch {}
          }

          return {
            success: false,
            message: `Outside geofence (${Math.round(dist)}m away, must be <= ${venueCoords.radiusMeters}m). Attendance not marked.`,
            distanceMeters: Math.round(dist * 100) / 100,
          };
        }

        // Inside geofence: Record random check in attendance_records
        const nowIso = new Date().toISOString();

        const { data: existingRecord } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('lecture_session_id', lectureSessionId)
          .eq('student_id', studentId)
          .maybeSingle();

        const hasInitialCheckIn = Boolean(existingRecord?.first_check_in_at);
        const finalStatus = hasInitialCheckIn ? (existingRecord?.status === 'late' ? 'late' : 'present') : 'absent';

        if (existingRecord) {
          await supabase
            .from('attendance_records')
            .update({
              random_check_completed_at: nowIso,
              status: finalStatus,
            })
            .eq('id', existingRecord.id);
        } else {
          await supabase
            .from('attendance_records')
            .insert({
              lecture_session_id: lectureSessionId,
              student_id: studentId,
              random_check_completed_at: nowIso,
              status: 'absent',
            });
        }

        if (activeWindowId) {
          try {
            await supabase.from('verification_attempts').insert({
              verification_window_id: activeWindowId,
              student_id: studentId,
              attempt_number: 1,
              used_face_verification: false,
              used_location_check: true,
              location_method: 'gps_geofence',
              latitude,
              longitude,
              distance_from_venue_meters: Math.round(dist * 100) / 100,
              status: 'success',
            });
          } catch {}
        }

        await AsyncStorage.removeItem('@enrolled_classes_cache').catch(() => {});
        await this.invalidateHistoryCache(studentId).catch(() => {});

        const successMsg = hasInitialCheckIn
          ? `Random location check verified! Both initial biometrics and random check confirmed. Marked as ${finalStatus}.`
          : 'Random location check verified! Please complete initial verification to finalize full attendance.';

        return {
          success: true,
          attendanceStatus: finalStatus,
          isFullyMarked: hasInitialCheckIn,
          message: successMsg,
          distanceMeters: Math.round(dist * 100) / 100,
        };
      } catch (dbErr: any) {
        console.warn('Supabase DB fallback for random check error:', dbErr);
      }

      return {
        success: false,
        message: 'Failed to verify location for random check. Please check connection and try again.',
      };
    } catch (error: any) {
      const msg = extractErrorMessage(error, 'Failed to submit random location verification');
      return {
        success: false,
        message: msg,
      };
    }
  }


  // Backwards compatibility for the old CheckInScreen until we update it
  async checkIn(sessionId: string, currentLat: number, currentLng: number, currentFaceCode: string) {
    return this.checkInLocationOnly(sessionId, currentLat, currentLng);
  }

  async sendFaceVerification(embedding: Float32Array) {
    return { success: true, message: 'Deprecated, use checkInWithFace directly' };
  }

  async getCachedHistory(studentId?: string): Promise<AttendanceHistoryItem[] | null> {
    try {
      const key = studentId ? `@attendance_history_cache_${studentId}` : '@attendance_history_cache_default';
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            return [];
          }
          const isCorrupted = parsed.some(
            (item: any) =>
              item.courseCode === 'COURSE' ||
              item.courseCode === 'Module' ||
              item.courseName === 'Class Session' ||
              item.courseName === 'Module' ||
              item.course === 'COURSE Class Session' ||
              item.course === 'Module' ||
              item.course === 'Academic Module' ||
              (!item.courseCode && !item.courseName)
          );
          if (isCorrupted) {
            await AsyncStorage.removeItem(key);
            await AsyncStorage.removeItem(`${key}_meta`);
            return null;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read attendance history cache:', e);
    }
    return null;
  }

  async setCachedHistory(studentId: string | undefined, data: AttendanceHistoryItem[]): Promise<void> {
    try {
      const key = studentId ? `@attendance_history_cache_${studentId}` : '@attendance_history_cache_default';
      // Filter out any corrupted entries
      const validToCache = (data || []).filter(
        d => d.courseCode && d.courseCode !== 'COURSE' && d.courseCode !== 'Module'
      );
      await AsyncStorage.setItem(key, JSON.stringify(validToCache));
      await AsyncStorage.setItem(`${key}_meta`, JSON.stringify({ lastSyncedAt: new Date().toISOString() }));
    } catch (e) {
      console.warn('Failed to write attendance history cache:', e);
    }
  }

  async invalidateHistoryCache(studentId?: string): Promise<void> {
    try {
      const key = studentId ? `@attendance_history_cache_${studentId}` : '@attendance_history_cache_default';
      await AsyncStorage.removeItem(key);
      await AsyncStorage.removeItem(`${key}_meta`);
    } catch (e) {
      console.warn('Failed to invalidate attendance history cache:', e);
    }
  }

  async clearAllAppDataCache(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(
        k =>
          k.startsWith('@attendance_history_cache') ||
          k === '@enrolled_classes_cache' ||
          k.startsWith('@timetable_cache')
      );
      if (cacheKeys.length > 0) {
        await Promise.all(cacheKeys.map(k => AsyncStorage.removeItem(k)));
      }
    } catch (e) {
      console.warn('Failed to clear app data cache:', e);
    }
  }

  async getHistory(studentId?: string, forceRefresh: boolean = false): Promise<{ success: boolean; history: AttendanceHistoryItem[]; source: 'network' | 'supabase' | 'cache'; message?: string }> {
    let resolvedStudentId = studentId;
    if (!resolvedStudentId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        resolvedStudentId = session?.user?.id;
      } catch {}
    }

    if (forceRefresh && resolvedStudentId) {
      await this.invalidateHistoryCache(resolvedStudentId);
    }

    // Preload enrolled classes for offline/fallback module name resolution
    let cachedEnrolledOfferings: any[] = [];
    try {
      const cachedClassesJson = await AsyncStorage.getItem('@enrolled_classes_cache');
      if (cachedClassesJson) {
        cachedEnrolledOfferings = JSON.parse(cachedClassesJson) || [];
      }
    } catch {}

    const resolveCourseFromCachedOfferings = (identifier?: string): { code: string; name: string } => {
      if (!identifier || cachedEnrolledOfferings.length === 0) return { code: '', name: '' };
      const match = cachedEnrolledOfferings.find(
        (c: any) =>
          c.id === identifier ||
          c.courseOfferingId === identifier ||
          c.offeringCode === identifier
      );
      if (match) {
        return {
          code: (match.courseCode || '').trim(),
          name: (match.courseName || '').trim(),
        };
      }
      return { code: '', name: '' };
    };

    // 1. Try FastAPI microservice via Kong / Ingress
    try {
      const response = await apiClient.get('/attendance/me');
      if (response.data && Array.isArray(response.data)) {
        if (response.data.length === 0) {
          await this.setCachedHistory(resolvedStudentId, []);
          return { success: true, history: [], source: 'network' };
        }

        // Collect session IDs for module enrichment
        const sessionIdsToEnrich = [
          ...new Set(
            response.data
              .map((r: any) => r.lecture_session_id || r.lectureSessionId || r.session_id || r.sessionId || r.id)
              .filter(Boolean)
          ),
        ];

        const sessionMap = new Map<string, { courseCode: string; courseName: string; heldAt?: string; sessionNum?: number; notes?: string }>();
        if (sessionIdsToEnrich.length > 0) {
          try {
            const { data: sessionRows } = await supabase
              .from('lecture_sessions')
              .select(`
                id,
                session_number,
                notes,
                held_at,
                scheduled_at,
                course_offering_id,
                course_offering:course_offerings (
                  id,
                  offering_code,
                  course:courses (course_code, name)
                )
              `)
              .in('id', sessionIdsToEnrich);

            if (sessionRows) {
              for (const s of sessionRows as any[]) {
                const details = extractCourseDetails(s);
                let finalCode = details.courseCode;
                let finalName = details.courseName;

                if (!finalCode || !finalName) {
                  const fallbackInfo = resolveCourseFromCachedOfferings(details.courseOfferingId || s.id);
                  if (!finalCode) finalCode = fallbackInfo.code;
                  if (!finalName) finalName = fallbackInfo.name;
                }

                sessionMap.set(s.id, {
                  courseCode: finalCode,
                  courseName: finalName,
                  sessionNum: details.sessionNumber,
                  notes: details.notes,
                  heldAt: details.heldAt,
                });
              }
            }
          } catch (e) {
            console.warn('Session enrichment error:', e);
          }
        }

        const historyList: AttendanceHistoryItem[] = response.data.map((r: any) => {
          const sessId = r.lecture_session_id || r.lectureSessionId || r.session_id || r.sessionId || r.id;
          const enriched = sessionMap.get(sessId);
          const rawCode = (r.course_code && r.course_code !== 'COURSE' && r.course_code !== 'Module') ? r.course_code : (enriched?.courseCode || '');
          const rawName = (r.course_name && r.course_name !== 'Class Session' && r.course_name !== 'Module') ? r.course_name : (enriched?.courseName || '');
          
          let courseCode = (rawCode || '').trim();
          let courseName = (rawName || '').trim();

          if (!courseCode || !courseName) {
            const fallbackInfo = resolveCourseFromCachedOfferings(sessId);
            if (!courseCode) courseCode = fallbackInfo.code;
            if (!courseName) courseName = fallbackInfo.name;
          }

          const sessionNum = r.session_number || enriched?.sessionNum || 1;
          const lectureName = r.lecture_name || (enriched?.notes ? `Lecture ${sessionNum}: ${enriched.notes}` : `Lecture ${sessionNum}`);
          const heldAt = r.held_at || enriched?.heldAt || r.first_check_in_at || r.created_at || new Date().toISOString();
          const dateFormatted = formatHeldDate(heldAt);
          const status = normalizeAttendanceStatus(r.status);
          const courseDisplay = formatModuleTitle(courseCode, courseName);

          return {
            id: r.id,
            lectureSessionId: sessId,
            courseCode,
            courseName,
            lectureName,
            sessionNumber: sessionNum,
            heldAt,
            dateFormatted,
            status,
            course: courseDisplay,
            date: typeof heldAt === 'string' ? heldAt.split('T')[0] : '',
          };
        });

        // Persist to local phone cache
        await this.setCachedHistory(resolvedStudentId, historyList);
        return { success: true, history: historyList, source: 'network' };
      }
    } catch (e: any) {
      console.log('Backend microservice /attendance/me unavailable, using direct Supabase DB fallback:', e?.message);
    }

    // 2. Direct Supabase DB PostgREST Fallback
    if (resolvedStudentId) {
      try {
        const { data, error } = await supabase
          .from('attendance_records')
          .select(`
            id,
            status,
            first_check_in_at,
            created_at,
            lecture_session_id,
            lecture_session:lecture_sessions (
              id,
              session_number,
              notes,
              scheduled_at,
              held_at,
              course_offering_id,
              course_offering:course_offerings (
                id,
                offering_code,
                course:courses (course_code, name)
              )
            )
          `)
          .eq('student_id', resolvedStudentId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          if (data.length === 0) {
            await this.setCachedHistory(resolvedStudentId, []);
            return { success: true, history: [], source: 'supabase' };
          }

          // Identify any records where nested join failed to produce courseCode
          const missingSessionIds = data
            .filter((r: any) => {
              const details = extractCourseDetails(r.lecture_session);
              return !details.courseCode || !details.courseName;
            })
            .map((r: any) => r.lecture_session_id || (Array.isArray(r.lecture_session) ? r.lecture_session[0]?.id : r.lecture_session?.id))
            .filter(Boolean);

          const fallbackSessionMap = new Map<string, { courseCode: string; courseName: string }>();
          if (missingSessionIds.length > 0) {
            try {
              const { data: separateSessions } = await supabase
                .from('lecture_sessions')
                .select(`
                  id,
                  course_offering:course_offerings (
                    course:courses (course_code, name)
                  )
                `)
                .in('id', missingSessionIds);

              if (separateSessions) {
                for (const s of separateSessions as any[]) {
                  const details = extractCourseDetails(s);
                  if (details.courseCode || details.courseName) {
                    fallbackSessionMap.set(s.id, { courseCode: details.courseCode, courseName: details.courseName });
                  }
                }
              }
            } catch {}
          }

          const historyList: AttendanceHistoryItem[] = data.map((r: any) => {
            const details = extractCourseDetails(r.lecture_session);
            const sessId = r.lecture_session_id || (Array.isArray(r.lecture_session) ? r.lecture_session[0]?.id : r.lecture_session?.id) || r.id;
            
            let courseCode = details.courseCode;
            let courseName = details.courseName;

            if (!courseCode || !courseName) {
              const fallback = fallbackSessionMap.get(sessId);
              if (fallback) {
                if (!courseCode) courseCode = fallback.courseCode;
                if (!courseName) courseName = fallback.courseName;
              } else {
                const cachedFallback = resolveCourseFromCachedOfferings(details.courseOfferingId || sessId);
                if (!courseCode) courseCode = cachedFallback.code;
                if (!courseName) courseName = cachedFallback.name;
              }
            }

            const sessionNum = details.sessionNumber;
            const notes = details.notes;
            const lectureName = notes ? `Lecture ${sessionNum}: ${notes}` : `Lecture ${sessionNum}`;
            const heldAt = details.heldAt || r.first_check_in_at || r.created_at;
            const status = normalizeAttendanceStatus(r.status);
            const courseDisplay = formatModuleTitle(courseCode, courseName);

            return {
              id: r.id,
              lectureSessionId: sessId,
              courseCode,
              courseName,
              lectureName,
              sessionNumber: sessionNum,
              heldAt,
              dateFormatted: formatHeldDate(heldAt),
              status,
              course: courseDisplay,
              date: typeof heldAt === 'string' ? heldAt.split('T')[0] : '',
            };
          });

          // Persist to local phone cache
          await this.setCachedHistory(resolvedStudentId, historyList);
          return { success: true, history: historyList, source: 'supabase' };
        }
      } catch (dbErr) {
        console.warn('Supabase attendance history query note:', dbErr);
      }
    }

    // 3. Local phone cache fallback (Offline / Airplane mode)
    const cached = await this.getCachedHistory(resolvedStudentId);
    if (cached !== null) {
      return { success: true, history: cached, source: 'cache' };
    }

    // 4. Offline with no cache available - Return empty array, NEVER mock data
    return {
      success: true,
      history: [],
      source: 'cache',
      message: 'No attendance history available offline.',
    };
  }

}

export default new ApiService();
