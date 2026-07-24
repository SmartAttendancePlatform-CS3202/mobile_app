# Smart Attendance Platform - Mobile App

This is the mobile application for the Smart Attendance Platform, built using **React Native** and **Expo**.

## Features

- **Authentication & Onboarding:** Secure login and initial face registration flow.
- **Session Check-In:** Easily check in to classes and scheduled sessions.
- **Timetable:** View your upcoming schedules in an intuitive interface.
- **History:** Track your past attendance records and history.

## Getting Started

### Prerequisites

Ensure you have the following installed on your development machine:
- [Node.js](https://nodejs.org/en/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Android Studio / Android Emulator (for Android testing)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SmartAttendancePlatform-CS3202/mobile_app.git
   ```
2. Navigate to the project directory:
   ```bash
   cd mobile-app
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. If working with native code, you can prebuild the Android folder:
   ```bash
   npx expo prebuild -p android
   ```

### Running the App

Start the development server using Expo:

```bash
npx expo start --clear
```

Press `a` in the terminal to open the app in the Android emulator, or `i` for the iOS simulator.

## Project Structure

- `src/screens/`: Contains all the UI screens for the app (Login, Home, Check-In, Timetable, etc.).
- `src/navigation/`: Handles the routing and bottom-tab/stack navigation logic.
- `src/services/`: Includes API handlers, mock data, and notification services.
