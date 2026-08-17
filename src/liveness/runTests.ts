import { runLivenessTests } from './__tests__/liveness.test';

const { passed, failed } = runLivenessTests();
if (failed > 0) {
  console.error(`Liveness pipeline tests failed: ${failed} failure(s).`);
} else {
  console.log('All liveness pipeline unit tests passed successfully!');
}
