import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeInfo } from '../../../../core/models/NodeInfo';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { NodeType } from '../../../../core/models/types';
import { METRIC_DEFINITIONS } from '../../../../core/models/metricDefinitions';

const TYPE_LABELS: Record<NodeType, string> = {
  CLASS: 'Classe',
  INTERFACE: 'Interface',
  ENUM: 'Enum',
  RECORD: 'Record',
};

@Component({
  selector: 'app-class-table',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, ButtonModule],
  templateUrl: './class-table.component.html',
  styleUrls: ['./class-table.component.scss'],
})
export class ClassTableComponent {
  nodes = input.required<NodeInfo[]>();
  selectedNodeId = input<string | null>(null);
  nodeSelected = output<NodeInfo>();

  protected readonly defs = METRIC_DEFINITIONS;

  protected typeLabel(type: NodeType): string {
    return TYPE_LABELS[type] ?? type;
  }

  protected onRowClick(node: NodeInfo): void {
    this.nodeSelected.emit(node);
  }

  getCboSeverity(cbo: number): 'success' | 'warn' | 'danger' | 'info' {
    if (cbo > 10) return 'danger';
    if (cbo > 5) return 'warn';
    if (cbo > 2) return 'info';
    return 'success';
  }

  getLcomSeverity(lcom: number): 'success' | 'warn' | 'danger' | 'info' {
    if (lcom > 0.8) return 'danger';
    if (lcom > 0.5) return 'warn';
    return 'success';
  }

  exportCsv(): void {
    const header = 'Classe,Pacote,Tipo,CBO,LCOM,DIT,NOC,RFC,LOC,Métodos,Atributos';
    const rows = this.nodes().map((n) =>
      [
        n.simpleName,
        n.packageName,
        n.type,
        n.metrics.cbo,
        n.metrics.lcom.toFixed(2),
        n.metrics.dit,
        n.metrics.noc,
        n.metrics.rfc,
        n.metrics.linesOfCode,
        n.metrics.numberOfMethods,
        n.metrics.numberOfAttributes,
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    this.downloadFile(csv, 'metricas-classes.csv', 'text/csv');
  }

  private downloadFile(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
