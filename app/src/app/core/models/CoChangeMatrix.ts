export interface CoChangeCell {
  readonly rowPackage: string;
  readonly colPackage: string;
  readonly totalWeight: number;
  readonly edgeCount: number;
}

export interface CoChangeMatrix {
  readonly packages: readonly string[];
  readonly cells: readonly CoChangeCell[];
  readonly maxWeight: number;
}
