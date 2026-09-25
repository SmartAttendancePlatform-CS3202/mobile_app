export function getSimilarityTransform(src: number[][], dst: number[][]): number[] {
  let meanSrcX = 0, meanSrcY = 0, meanDstX = 0, meanDstY = 0;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    meanSrcX += src[i][0]; meanSrcY += src[i][1];
    meanDstX += dst[i][0]; meanDstY += dst[i][1];
  }
  meanSrcX /= n; meanSrcY /= n; meanDstX /= n; meanDstY /= n;

  let varSrc = 0, covXX = 0, covYY = 0, covXY = 0, covYX = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - meanSrcX;
    const sy = src[i][1] - meanSrcY;
    const dx = dst[i][0] - meanDstX;
    const dy = dst[i][1] - meanDstY;
    varSrc += sx * sx + sy * sy;
    covXX += sx * dx;
    covXY += sx * dy;
    covYX += sy * dx;
    covYY += sy * dy;
  }
  
  if (varSrc < 1e-10) return [1, 0, 0, 0];

  const a = (covXX + covYY) / varSrc;
  const b = (covXY - covYX) / varSrc;
  
  const tx = meanDstX - (a * meanSrcX - b * meanSrcY);
  const ty = meanDstY - (b * meanSrcX + a * meanSrcY);
  
  // Transformation is: 
  // srcX = a * x - b * y + tx
  // srcY = b * x + a * y + ty
  return [a, b, tx, ty];
}

export const CANONICAL_POINTS_160 = [
  [54.706, 73.851],   // Left Eye
  [105.045, 73.573],  // Right Eye
  [80.036, 102.480],  // Nose
  [59.356, 131.950],  // Left Mouth
  [101.042, 131.720], // Right Mouth
];
