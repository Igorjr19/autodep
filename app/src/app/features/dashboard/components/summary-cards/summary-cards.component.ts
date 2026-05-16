import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SummaryInfo } from '../../../../core/models/SummaryInfo';
import { METRIC_DEFINITIONS } from '../../../../core/models/metricDefinitions';

@Component({
  selector: 'app-summary-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary-cards.component.html',
  styleUrls: ['./summary-cards.component.scss'],
})
export class SummaryCardsComponent {
  summary = input.required<SummaryInfo>();
  protected readonly defs = METRIC_DEFINITIONS;

  cboColor(value: number): string {
    if (value > 10) return 'text-red-600';
    if (value > 5) return 'text-orange-600';
    if (value > 2) return 'text-yellow-600';
    return 'text-green-600';
  }

  lcomColor(value: number): string {
    if (value > 0.8) return 'text-red-600';
    if (value > 0.5) return 'text-orange-600';
    return 'text-green-600';
  }
}
