# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Native & ML Modules Workflow
- This project uses native C++ and ML dependencies (`react-native-fast-tflite`, `react-native-vision-camera`, `react-native-worklets-core`).
- **Do not use Expo Go**: These native ML libraries cannot run in the generic Expo Go app.
- **Use Expo Dev Client (`npx expo run:android` / `npm run android`)**: Always run with a custom development build where native C++ and camera plugins are compiled into the binary.

## USB Connected Physical Device Workflow
When testing on a physical Android device connected via USB:
1. **Verify ADB device**: Ensure `adb devices` lists the attached device.
2. **Set up port forwarding**: Run `adb reverse tcp:8081 tcp:8081` so the device can seamlessly connect to Metro on localhost.
3. **Start Metro**: Run `npx expo start --dev-client`.
4. **Launch Dev Client**: Press `a` in the Expo CLI or launch directly via `adb shell am start -n com.anonymous.mobileapp/.MainActivity --user 0`.

