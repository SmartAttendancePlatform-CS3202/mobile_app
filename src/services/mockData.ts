export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  isFaceRegistered: boolean;
  faceEmbeddingCode?: string;
  indexNumber?: string;
  department?: string;
  batch?: string;
}

export type SessionType = 'L' | 'P' | 'L & P' | 'Event' | 'Break';

export interface ClassSession {
  id: string;
  courseCode: string;
  courseName: string;
  lecturer: string;
  type: SessionType;
  typeLabel: string;
  venue: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  dayIndex: number; // 1 = Monday, 5 = Friday
  startTime: string;
  endTime: string;
  duration: string;
  isActive: boolean;
  geofence: {
    latitude: number;
    longitude: number;
    radiusInMeters: number;
  };
}

export interface AcademicHeaderInfo {
  university: string;
  faculty: string;
  department: string;
  term: string;
  session: string;
  period: string;
  group: string;
}

export const mockAcademicInfo: AcademicHeaderInfo = {
  university: 'University of Moratuwa, Sri Lanka',
  faculty: 'Faculty of Engineering',
  department: 'Computer Science & Engineering',
  term: 'Semester 5',
  session: 'Session 2025/26 [Intake 2023]',
  period: '30th June 2026 – 09th October 2026',
  group: 'Computer Science & Engineering',
};

export const mockStudent: StudentProfile = {
  id: 'STU230045',
  name: 'Savindu S.',
  email: 'savindu.23@cse.mrt.ac.lk',
  indexNumber: '230045A',
  department: 'Computer Science & Engineering',
  batch: 'Intake 2023 (Semester 5)',
  isFaceRegistered: false,
};

// University of Moratuwa coordinates (CSE Dept / Seminar Room)
const UOM_CSE_COORDS = {
  latitude: 6.7951,
  longitude: 79.9009,
  radiusInMeters: 150,
};

export const mockTimetableSchedule: ClassSession[] = [
  // --- MONDAY ---
  {
    id: 'MON_0815_CS3053',
    courseCode: 'CS3053',
    courseName: 'Computer Security',
    lecturer: 'Dr. C. Silva',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'Seminar Room',
    day: 'Monday',
    dayIndex: 1,
    startTime: '08:15',
    endTime: '10:15',
    duration: '2h',
    isActive: true,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'MON_1215_LUNCH',
    courseCode: 'BREAK',
    courseName: 'Lunch Break',
    lecturer: 'Break',
    type: 'Break',
    typeLabel: 'Break',
    venue: 'Cafeteria',
    day: 'Monday',
    dayIndex: 1,
    startTime: '12:15',
    endTime: '13:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'MON_1315_MN3043',
    courseCode: 'MN 3043',
    courseName: 'Business Economics & Financial Accounting',
    lecturer: 'Prof. P. Wickramasinghe',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'MBP AUD',
    day: 'Monday',
    dayIndex: 1,
    startTime: '13:15',
    endTime: '16:15',
    duration: '3h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },

  // --- TUESDAY ---
  {
    id: 'TUE_1015_MA3024',
    courseCode: 'MA3024',
    courseName: 'Numerical Methods',
    lecturer: 'Dr. K. Perera',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'JG',
    day: 'Tuesday',
    dayIndex: 2,
    startTime: '10:15',
    endTime: '12:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'TUE_1215_LUNCH',
    courseCode: 'BREAK',
    courseName: 'Lunch Break',
    lecturer: 'Break',
    type: 'Break',
    typeLabel: 'Break',
    venue: 'Cafeteria',
    day: 'Tuesday',
    dayIndex: 2,
    startTime: '12:15',
    endTime: '13:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'TUE_1315_MA3030',
    courseCode: 'MA3030',
    courseName: 'Operational Research',
    lecturer: 'Dr. T. Fernando',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'NA2',
    day: 'Tuesday',
    dayIndex: 2,
    startTime: '13:15',
    endTime: '15:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'TUE_1515_CS3413',
    courseCode: 'CS3413',
    courseName: 'Advanced Networking',
    lecturer: 'Dr. A. Jayasumana',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'Seminar Room',
    day: 'Tuesday',
    dayIndex: 2,
    startTime: '15:15',
    endTime: '17:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'TUE_1715_CS3880',
    courseCode: 'CS3880',
    courseName: 'Engineer and Society',
    lecturer: 'Eng. N. Bandara',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'Online',
    day: 'Tuesday',
    dayIndex: 2,
    startTime: '17:15',
    endTime: '19:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },

  // --- WEDNESDAY ---
  {
    id: 'WED_0815_CS3713P',
    courseCode: 'CS3713',
    courseName: 'Image Processing (P)',
    lecturer: 'Dr. R. Gamage',
    type: 'P',
    typeLabel: 'Practical (P)',
    venue: 'CSE Dept Lab',
    day: 'Wednesday',
    dayIndex: 3,
    startTime: '08:15',
    endTime: '10:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'WED_1015_CS3713L',
    courseCode: 'CS3713',
    courseName: 'Image Processing (L)',
    lecturer: 'Dr. R. Gamage',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'Seminar Room',
    day: 'Wednesday',
    dayIndex: 3,
    startTime: '10:15',
    endTime: '12:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'WED_1215_LUNCH',
    courseCode: 'BREAK',
    courseName: 'Lunch Break',
    lecturer: 'Break',
    type: 'Break',
    typeLabel: 'Break',
    venue: 'Cafeteria',
    day: 'Wednesday',
    dayIndex: 3,
    startTime: '12:15',
    endTime: '13:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'WED_1315_CS3213P',
    courseCode: 'CS3213',
    courseName: 'Advanced Software Engineering (P)',
    lecturer: 'Dr. S. De Silva',
    type: 'P',
    typeLabel: 'Practical (P)',
    venue: 'CSE Lab 2',
    day: 'Wednesday',
    dayIndex: 3,
    startTime: '13:15',
    endTime: '15:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'WED_1515_CS3413P',
    courseCode: 'CS3413',
    courseName: 'Advanced Networking (P)',
    lecturer: 'Dr. A. Jayasumana',
    type: 'P',
    typeLabel: 'Practical (P)',
    venue: 'Networking Lab',
    day: 'Wednesday',
    dayIndex: 3,
    startTime: '15:15',
    endTime: '17:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },

  // --- THURSDAY ---
  {
    id: 'THU_1015_RESEARCH',
    courseCode: 'RESEARCH',
    courseName: 'University Research Hour',
    lecturer: 'Faculty Board',
    type: 'Event',
    typeLabel: 'University Event',
    venue: 'University',
    day: 'Thursday',
    dayIndex: 4,
    startTime: '10:15',
    endTime: '11:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'THU_1115_UNION',
    courseCode: 'UNION',
    courseName: 'Union Hour',
    lecturer: 'Student Union',
    type: 'Event',
    typeLabel: 'University Event',
    venue: 'Campus',
    day: 'Thursday',
    dayIndex: 4,
    startTime: '11:15',
    endTime: '12:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'THU_1215_LUNCH',
    courseCode: 'BREAK',
    courseName: 'Lunch Break',
    lecturer: 'Break',
    type: 'Break',
    typeLabel: 'Break',
    venue: 'Cafeteria',
    day: 'Thursday',
    dayIndex: 4,
    startTime: '12:15',
    endTime: '13:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'THU_1415_CS3203LP',
    courseCode: 'CS3203',
    courseName: 'Software Engineering Project (L & P)',
    lecturer: 'Prof. G. Dias',
    type: 'L & P',
    typeLabel: 'Lecture & Practical (L & P)',
    venue: 'Seminar Room',
    day: 'Thursday',
    dayIndex: 4,
    startTime: '14:15',
    endTime: '17:15',
    duration: '3h',
    isActive: true,
    geofence: UOM_CSE_COORDS,
  },

  // --- FRIDAY ---
  {
    id: 'FRI_0815_MA2024',
    courseCode: 'MA2024',
    courseName: 'Calculus',
    lecturer: 'Prof. S. Walisinghe',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'NA2',
    day: 'Friday',
    dayIndex: 5,
    startTime: '08:15',
    endTime: '10:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'FRI_1015_CS3203P',
    courseCode: 'CS3203',
    courseName: 'Software Engineering Project (P)',
    lecturer: 'Prof. G. Dias',
    type: 'P',
    typeLabel: 'Practical (P)',
    venue: 'Insight Hub',
    day: 'Friday',
    dayIndex: 5,
    startTime: '10:15',
    endTime: '12:15',
    duration: '2h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'FRI_1215_LUNCH',
    courseCode: 'BREAK',
    courseName: 'Lunch Break',
    lecturer: 'Break',
    type: 'Break',
    typeLabel: 'Break',
    venue: 'Cafeteria',
    day: 'Friday',
    dayIndex: 5,
    startTime: '12:15',
    endTime: '13:15',
    duration: '1h',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },
  {
    id: 'FRI_1315_CS3213L',
    courseCode: 'CS3213',
    courseName: 'Advanced Software Engineering (L)',
    lecturer: 'Dr. S. De Silva',
    type: 'L',
    typeLabel: 'Lecture (L)',
    venue: 'Seminar Room',
    day: 'Friday',
    dayIndex: 5,
    startTime: '13:15',
    endTime: '15:15',
    isActive: false,
    geofence: UOM_CSE_COORDS,
  },

  // --- ALWAYS AVAILABLE MOCK CLASS FOR TESTING ---
  {
    id: 'TEST_MOCK_CLASS',
    courseCode: 'TEST0000',
    courseName: 'Testing & Debugging (Mock)',
    lecturer: 'System',
    type: 'L',
    typeLabel: 'Mock (L)',
    venue: 'Anywhere',
    day: 'Everyday' as any,
    dayIndex: 0,
    startTime: '00:00',
    endTime: '23:59',
    duration: '24h',
    isActive: true,
    geofence: UOM_CSE_COORDS,
  },
];

// Active sessions for quick check-in & Dashboard display (excluding breaks/events)
export const mockSessions: ClassSession[] = mockTimetableSchedule.filter(
  session => session.type !== 'Break' && session.type !== 'Event'
);

export const mockAttendanceHistory = [
  { id: '1', date: '2026-07-01', course: 'CS3053 Computer Security', status: 'Present' },
  { id: '2', date: '2026-07-02', course: 'MA3024 Numerical Methods', status: 'Present' },
  { id: '3', date: '2026-07-03', course: 'CS3713 Image Processing', status: 'Present' },
  { id: '4', date: '2026-07-04', course: 'CS3203 Software Engineering Project', status: 'Present' },
  { id: '5', date: '2026-07-05', course: 'MA2024 Calculus', status: 'Absent' },
];

