import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeInfo } from '../../../../core/models/NodeInfo';
import { NodeType } from '../../../../core/models/types';
import { METRIC_DEFINITIONS } from '../../../../core/models/metricDefinitions';

const TYPE_LABELS: Record<NodeType, string> = {
  CLASS: 'Classe',
  INTERFACE: 'Interface',
  ENUM: 'Enum',
  RECORD: 'Record',
};

@Component({
  selector: 'app-metrics-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metrics-panel.component.html',
  styleUrls: ['./metrics-panel.component.scss'],
})
export class MetricsPanelComponent {
  node = input.required<NodeInfo>();
  protected readonly defs = METRIC_DEFINITIONS;

  protected typeLabel(type: NodeType): string {
    return TYPE_LABELS[type] ?? type;
  }
}
