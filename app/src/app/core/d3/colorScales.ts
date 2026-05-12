import { scaleSequential, scaleThreshold, ScaleSequential } from 'd3-scale';
import { interpolateOranges } from 'd3-scale-chromatic';
import { RelationCategory } from '../models/types';

export const cboColorScale = scaleThreshold<number, string>()
  .domain([3, 6, 11])
  .range(['#4CAF50', '#FFC107', '#FF9800', '#f44336']);

export const categoryColor: Record<RelationCategory, string> = {
  STRUCTURAL: '#2196F3',
  BEHAVIORAL: '#FF9800',
  LOGICAL: '#4CAF50',
};

export function coChangeIntensityScale(maxWeight: number): ScaleSequential<string> {
  const safeMax = maxWeight > 0 ? maxWeight : 1;
  return scaleSequential(interpolateOranges).domain([0, safeMax]);
}
