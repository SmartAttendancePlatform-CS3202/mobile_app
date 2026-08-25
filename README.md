# Smart Attendance Platform - Mobile App

A cross-platform mobile application for real-time automated attendance verification using **React Native**, **Expo (SDK 57)**, **VisionCamera**, **TensorFlow Lite (Fast-TFLite)**, on-device face embeddings, dynamic liveness detection, and GPS geolocation validation.

---

## Key Features

- **Authentication & Onboarding:** Secure user login, session management, and guided face registration workflow.
- **On-Device Face Embeddings & Liveness:**
  - Fast-TFLite integration for low-latency facial embedding extraction on device.
  - State-machine driven passive & active liveness verification (blink detection, head movement verification, anti-spoofing checks).
- **Session Check-In & Verification:**
  - Real-time camera feed with automated face detection.
  - Multi-factor verification combining facial biometric matching and geofenced GPS location checks.
- **Timetable Management:** Interactive schedule showing upcoming classes, locations, and time slots.
- **Attendance History & Analytics:** Comprehensive attendance tracking, check-in history logs, and attendance status metrics.
- **Account & Profile Management:** Profile detail views, biometric re-enrollment options, and app configuration settings.

---

## Tech Stack & Dependencies

- **Framework:** [React Native](https://reactnative.dev/) (v0.86.0) with [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- **Navigation:** `@react-navigation/native` (v7), `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`
- **Camera & Machine Learning:**
  - `react-native-vision-camera` (v5.2.0)
  - `react-native-fast-tflite` (v3.0.1)
  - `react-native-vision-camera-face-detector` (v2.0.6)
  - `react-native-worklets-core` (v1.6.3)
- **Device Capabilities:** `expo-location`, `expo-image-manipulator`, `@react-native-async-storage/async-storage`
- **Network / API:** Axios HTTP client, Supabase Client Integration

---

## Important Notice: Expo Dev Client Workflow

> [!IMPORTANT]
> **Do NOT use Expo Go!**  
> This application relies on custom C++ native modules and native ML binaries (`react-native-fast-tflite`, `react-native-vision-camera`). These native dependencies **cannot** execute inside the standard Expo Go client app. You **must** run and test using **Expo Dev Client** (`npx expo run:android` / `npm run android`).

---

## Getting Started

### Prerequisites

Ensure your development environment meets the following requirements:
- **Node.js:** v18.0.0 or higher
- **Package Manager:** `npm` or `yarn`
- **Android Development:**
  - Android Studio with Android SDK (minimum SDK version: 26 / Android 8.0)
  - JDK 17+
  - Android Debug Bridge (`adb`) added to environment system `PATH`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SmartAttendancePlatform-CS3202/mobile_app.git
   cd mobile-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` and fill in the required API endpoints:
   ```bash
   cp .env.example .env
   ```

   *Sample Configuration (`.env`):*
   ```env
   EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
   EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```
   > **Note for physical device testing:** Replace `10.0.2.2` with your host machine's local IP address (e.g., `http://192.168.1.100:8000`).

---

## Running the Application

### 1. Android Emulator Setup

To build and run the development build on an Android emulator:

```bash
npm run android
```

### 2. Physical Android Device Workflow (USB Debugging)

When running on a physical Android device connected via USB:

1. **Verify connected device:**
   ```bash
   adb devices
   ```
2. **Setup ADB port forwarding for Metro (8081):**
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```
3. **Start the Metro bundler with Dev Client enabled:**
   ```bash
   npx expo start --dev-client
   ```
4. **Launch the Development Client via Deep Link:**
   ```bash
   adb shell am start -a android.intent.action.VIEW -d "exp+mobile-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" com.anonymous.mobileapp
   ```
   *(Alternatively, enter `http://127.0.0.1:8081` manually on the app's connection screen).*

---

## Build & Release Commands

| Command | Description |
| :--- | :--- |
| `npm run start` | Starts the Expo Metro bundler. |
| `npm run android` | Builds and launches the Android development build (`expo run:android`). |
| `npm run android:release` | Builds and launches the Android release variant. |
| `npm run build:apk` | Compiles the standalone release APK using Gradle (`./gradlew assembleRelease`). |
| `npm run install:apk` | Installs the generated release APK directly to an attached Android device via ADB. |
| `npm run ios` | Builds and launches the iOS development build (macOS required). |

---

## Project Structure

```text
mobile-app/
├── android/                 # Native Android project files & Gradle build setup
├── assets/                  # App icons, splash screens, and static images
├── src/
│   ├── camera/              # VisionCamera component wrappers & frame handlers
│   ├── components/          # Reusable UI components (buttons, cards, headers)
│   ├── context/             # React context providers (AuthContext, App State)
│   ├── embedding/           # Fast-TFLite model integration & face vector generation
│   ├── liveness/            # Active & passive liveness verification state machine
│   ├── navigation/          # React Navigation stacks & bottom tab navigator
│   ├── screens/             # App views (Login, Home, CheckIn, LocationCheck, etc.)
│   └── services/            # API client (Axios), backend services, notification handlers
├── app.json                 # Expo config (permissions, build properties, plugins)
├── index.ts                 # App entry point
├── metro.config.js          # Metro bundler custom configuration
├── package.json             # Project dependencies and npm scripts
└── tsconfig.json            # TypeScript configuration
```

---

## License

This project is part of the **Smart Attendance Platform (CS3202)** repository and is licensed under the [MIT License](LICENSE).
