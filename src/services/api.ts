import { mockStudent, mockSessions, mockAttendanceHistory } from './mockData';
import { sendFaceVerificationRequest } from '../embedding/embeddingApi';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class ApiService {
  private student = { ...mockStudent };

  async login(email: string, password: string) {
    await delay(1000);
    if (email === this.student.email) {
      return { success: true, student: this.student };
    }
    return { success: false, message: 'Invalid credentials' };
  }

  async registerFace(faceEmbeddingCode: string) {
    await delay(1500);
    this.student.isFaceRegistered = true;
    this.student.faceEmbeddingCode = faceEmbeddingCode;
    return { success: true, message: 'Face registered successfully' };
  }

  generateFaceCodeFromPhoto(photoUri: string): string {
    return `face_embedding_${Math.random().toString(36).substring(7)}`;
  }

  async getSessions() {
    await delay(800);
    return { success: true, sessions: mockSessions };
  }

  async checkIn(sessionId: string, currentLat: number, currentLng: number, currentFaceCode: string) {
    await delay(2000);
    const session = mockSessions.find(s => s.id === sessionId);
    if (!session) return { success: false, message: 'Session not found' };

    const distance = this.calculateDistance(currentLat, currentLng, session.geofence.latitude, session.geofence.longitude);
    if (distance > session.geofence.radiusInMeters) {
      return { success: false, message: `You are out of the classroom zone (Distance: ${Math.round(distance)}m).` };
    }

    if (!this.student.faceEmbeddingCode || this.student.faceEmbeddingCode !== currentFaceCode) {
       if (!currentFaceCode.startsWith('face_embedding_')) {
          return { success: false, message: 'Face recognition failed to match your registered face.' };
       }
    }

    return { success: true, message: 'Attendance marked successfully!' };
  }

  async getHistory() {
    await delay(800);
    return { success: true, history: mockAttendanceHistory };
  }

  async sendFaceVerification(embedding: Float32Array) {
    return await sendFaceVerificationRequest(embedding);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }
}

export default new ApiService();
