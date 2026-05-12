export interface PackageMetrics {
  readonly name: string;
  readonly classCount: number;
  readonly totalLoc: number;
  readonly meanCbo: number;
  readonly meanLcom: number;
  readonly meanDit: number;
  readonly meanRfc: number;
}
