export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  isFaceRegistered: boolean;
  faceEmbeddingCode?: string;
}

export interface ClassSession {
  id: string;
  courseName: string;
  lecturer: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  geofence: {
    latitude: number;
    longitude: number;
    radiusInMeters: number;
  };
}

export const mockStudent: StudentProfile = {
  id: 'STU1001',
  name: 'John Doe',
  email: 'johndoe@university.edu',
  isFaceRegistered: false,
};

export const mockSessions: ClassSession[] = [
  {
    id: 'SESSION1',
    courseName: 'Mobile Application Development',
    lecturer: 'Dr. Smith',
    startTime: '10:00 AM',
    endTime: '12:00 PM',
    isActive: true,
    geofence: {
      latitude: 37.4220936, // Googleplex default simulator location
      longitude: -122.083922,
      radiusInMeters: 100, // 100 meters
    },
  },
  {
    id: 'SESSION2',
    courseName: 'Software Engineering',
    lecturer: 'Prof. Davis',
    startTime: '1:00 PM',
    endTime: '3:00 PM',
    isActive: false,
    geofence: {
      latitude: 37.4220936,
      longitude: -122.083922,
      radiusInMeters: 50,
    },
  }
];

export const mockAttendanceHistory = [
  { id: '1', date: '2023-10-01', course: 'Mobile Application Development', status: 'Present' },
  { id: '2', date: '2023-10-02', course: 'Software Engineering', status: 'Present' },
  { id: '3', date: '2023-10-03', course: 'Data Structures', status: 'Absent' },
];
