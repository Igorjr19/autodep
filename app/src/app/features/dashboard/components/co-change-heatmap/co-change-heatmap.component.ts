import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { select } from 'd3-selection';
import { CoChangeCell, CoChangeMatrix } from '../../../../core/models/CoChangeMatrix';
import { coChangeIntensityScale } from '../../../../core/d3';

interface HeatmapTooltip {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly rowPackage?: string;
  readonly colPackage?: string;
  readonly totalWeight?: number;
  readonly edgeCount?: number;
}

const MARGIN = { top: 90, right: 20, bottom: 20, left: 120 } as const;
const EMPTY_CELL_FILL = '#f5f5f5';
const NO_DATA_TEXT = 'Nenhuma co-mudança detectada entre pacotes.';

@Component({
  selector: 'app-co-change-heatmap',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './co-change-heatmap.component.html',
  styleUrls: ['./co-change-heatmap.component.scss'],
})
export class CoChangeHeatmapComponent implements OnDestroy {
  matrix = input.required<CoChangeMatrix>();

  cellSelected = output<CoChangeCell>();

  host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly tooltip = signal<HeatmapTooltip>({ visible: false, x: 0, y: 0 });
  protected readonly hasData = signal(false);

  private resizeObserver: ResizeObserver | null = null;
  private readonly dimensions = signal<{ width: number; height: number }>({ width: 0, height: 0 });

  constructor() {
    afterNextRender(() => {
      this.observeResize();
      this.measure();
    });

    effect(() => {
      const { width, height } = this.dimensions();
      const matrix = this.matrix();
      this.hasData.set(matrix.cells.length > 0);
      if (width > 0 && height > 0) {
        this.render(matrix, width, height);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.host().nativeElement);
  }

  private measure(): void {
    const el = this.host().nativeElement;
    this.dimensions.set({ width: el.clientWidth, height: el.clientHeight });
  }

  private render(matrix: CoChangeMatrix, width: number, height: number): void {
    const svg = select(this.host().nativeElement)
      .selectAll<SVGSVGElement, null>('svg.heatmap-svg')
      .data([null])
      .join('svg')
      .attr('class', 'heatmap-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    if (matrix.cells.length === 0) return;

    const packages = matrix.packages;
    const n = packages.length;
    const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);
    const cellSize = Math.max(4, Math.min(innerWidth / n, innerHeight / n));

    const cellIndex = new Map<string, CoChangeCell>();
    for (const cell of matrix.cells) {
      cellIndex.set(`${cell.rowPackage}|${cell.colPackage}`, cell);
    }

    const colorOf = coChangeIntensityScale(matrix.maxWeight);

    const grid = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Cells (full matrix, mirror via normalized lookup)
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const rowPkg = packages[row];
        const colPkg = packages[col];
        const [a, b] = rowPkg <= colPkg ? [rowPkg, colPkg] : [colPkg, rowPkg];
        const cell = cellIndex.get(`${a}|${b}`);
        const fill = cell ? colorOf(cell.totalWeight) : EMPTY_CELL_FILL;

        const rect = grid
          .append('rect')
          .attr('x', col * cellSize)
          .attr('y', row * cellSize)
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('fill', fill)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 0.5)
          .attr('data-row', String(row))
          .attr('data-col', String(col));

        if (cell) {
          rect
            .style('cursor', 'pointer')
            .on('mousemove', (event: MouseEvent) =>
              this.showTooltip(event, cell, row, col, grid.node() as SVGGElement),
            )
            .on('mouseleave', () => this.hideTooltip(grid.node() as SVGGElement))
            .on('click', () => this.cellSelected.emit(cell));
        }
      }
    }

    // Row labels (left axis)
    grid
      .append('g')
      .attr('class', 'row-labels')
      .selectAll('text')
      .data(packages)
      .join('text')
      .attr('x', -6)
      .attr('y', (_d, i) => i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', this.labelFontSize(cellSize))
      .attr('fill', '#424242')
      .text((d) => this.shortPackageName(d));

    // Column labels (top axis, rotated -45°)
    grid
      .append('g')
      .attr('class', 'col-labels')
      .selectAll('text')
      .data(packages)
      .join('text')
      .attr('transform', (_d, i) => `translate(${i * cellSize + cellSize / 2}, -6) rotate(-45)`)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', this.labelFontSize(cellSize))
      .attr('fill', '#424242')
      .text((d) => this.shortPackageName(d));
  }

  private showTooltip(
    event: MouseEvent,
    cell: CoChangeCell,
    row: number,
    col: number,
    gridNode: SVGGElement,
  ): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.tooltip.set({
      visible: true,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
      rowPackage: cell.rowPackage,
      colPackage: cell.colPackage,
      totalWeight: cell.totalWeight,
      edgeCount: cell.edgeCount,
    });
    this.highlightRowCol(gridNode, row, col);
  }

  private hideTooltip(gridNode: SVGGElement): void {
    this.tooltip.set({ visible: false, x: 0, y: 0 });
    this.clearHighlight(gridNode);
  }

  private highlightRowCol(gridNode: SVGGElement, row: number, col: number): void {
    select(gridNode)
      .selectAll<SVGRectElement, unknown>('rect')
      .each(function () {
        const r = Number(this.getAttribute('data-row'));
        const c = Number(this.getAttribute('data-col'));
        const inLine = r === row || c === col;
        this.setAttribute('stroke', inLine ? '#1565c0' : '#ffffff');
        this.setAttribute('stroke-width', inLine ? '1.5' : '0.5');
      });
  }

  private clearHighlight(gridNode: SVGGElement): void {
    select(gridNode)
      .selectAll<SVGRectElement, unknown>('rect')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 0.5);
  }

  private shortPackageName(name: string): string {
    if (name === '(root)') return name;
    const parts = name.split('.');
    if (parts.length <= 2) return name;
    return `…${parts.slice(-2).join('.')}`;
  }

  private labelFontSize(cellSize: number): number {
    if (cellSize >= 18) return 10;
    if (cellSize >= 10) return 8;
    return 7;
  }

  protected readonly noDataText = NO_DATA_TEXT;
}
