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
import { NodeInfo } from '../../core/models/NodeInfo';

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
    const current = this.facade.filteredPackages();
    // Re-clicar no pacote já filtrado desfaz o filtro (volta à visão completa).
    if (current.size === 1 && current.has(pkg)) {
      this.facade.setPackageFilter(null);
    } else {
      this.facade.setPackageFilter(pkg);
    }
  }

  onClassTableSelect(node: NodeInfo): void {
    // Re-clicar na classe já selecionada a desseleciona.
    if (this.facade.selectedNode()?.id === node.id) {
      this.facade.selectNode(null);
      return;
    }
    this.facade.selectNode(node);
    document
      .querySelector('app-force-graph')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onCoChangeCellSelected(cell: CoChangeCell): void {
    // Re-clicar na mesma célula desfaz o foco e o filtro (volta à visão completa).
    const focus = this.facade.coChangeFocus();
    if (focus && focus.a === cell.rowPackage && focus.b === cell.colPackage) {
      this.facade.setCoChangeFocus(null);
      this.facade.setPackageFilter(null);
      return;
    }

    const packages =
      cell.rowPackage === cell.colPackage
        ? [cell.rowPackage]
        : [cell.rowPackage, cell.colPackage];
    this.facade.setPackageFilters(packages);
    this.facade.ensureCategory('LOGICAL');
    this.facade.setCoChangeFocus({ a: cell.rowPackage, b: cell.colPackage });
    document
      .querySelector('app-force-graph')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
