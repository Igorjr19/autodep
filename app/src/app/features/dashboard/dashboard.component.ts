import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { AnalysisFacade } from '../../core/state/AnalysisFacade';
import { RelationCategory } from '../../core/models/types';
import { SummaryCardsComponent } from './components/summary-cards/summary-cards.component';
import { ClassTableComponent } from './components/class-table/class-table.component';
import { ForceGraphComponent } from './components/force-graph/force-graph.component';
import { MetricsPanelComponent } from './components/metrics-panel/metrics-panel.component';
import { PackageTreemapComponent } from './components/package-treemap/package-treemap.component';
import { CoChangeHeatmapComponent } from './components/co-change-heatmap/co-change-heatmap.component';
import { CoChangeCell } from '../../core/models/CoChangeMatrix';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    SummaryCardsComponent,
    ClassTableComponent,
    ForceGraphComponent,
    MetricsPanelComponent,
    PackageTreemapComponent,
    CoChangeHeatmapComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  facade = inject(AnalysisFacade);

  onCategoryToggled(cat: RelationCategory): void {
    this.facade.toggleCategory(cat);
  }

  onPackageFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.setPackageFilter(value || null);
  }

  onMinCboChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.facade.setMinCboFilter(isNaN(value) ? 0 : value);
  }

  onPackageSelected(pkg: string): void {
    this.facade.setPackageFilter(pkg);
  }

  onClassTableSelect(node: import('../../core/models/NodeInfo').NodeInfo): void {
    this.facade.selectNode(node);
    document
      .querySelector('app-force-graph')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onCoChangeCellSelected(cell: CoChangeCell): void {
    if (cell.rowPackage === cell.colPackage) {
      this.facade.setPackageFilter(cell.rowPackage);
    }
  }

  exportJson(): void {
    const data = this.facade.analysisData();
    if (!data) return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.projectName}-analysis.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
