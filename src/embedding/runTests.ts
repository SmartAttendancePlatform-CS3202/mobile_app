import { runEmbeddingTests } from './__tests__/embedding.test';

async function main() {
  const { passed, failed } = runEmbeddingTests();
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (failed > 0) {
    console.error(`Embedding pipeline tests failed: ${failed} failure(s).`);
  } else {
    console.log('All embedding pipeline unit tests passed successfully!');
  }
}

main().catch((err) => {
  console.error('Error running embedding tests:', err);
});
