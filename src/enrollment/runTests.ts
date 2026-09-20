import { runEnrollmentTests } from './__tests__/enrollment.test';

const { passed, failed } = runEnrollmentTests();
if (failed > 0) {
  console.error(`Biometric enrollment tests failed: ${failed} failure(s).`);
  process.exit(1);
} else {
  console.log(`All ${passed} biometric enrollment unit tests passed successfully!`);
  process.exit(0);
}
