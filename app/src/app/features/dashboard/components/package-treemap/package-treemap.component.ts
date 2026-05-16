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
import { hierarchy, treemap, HierarchyRectangularNode } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { PackageMetrics } from '../../../../core/models/PackageMetrics';
import { cboColorScale } from '../../../../core/d3';

type TreemapMetric = 'totalLoc' | 'meanCbo';

interface TreemapDatum {
  readonly name: string;
  readonly value: number;
  readonly source: PackageMetrics;
}

interface TreemapTooltip {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly pkg?: PackageMetrics;
}

@Component({
  selector: 'app-package-treemap',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-treemap.component.html',
  styleUrls: ['./package-treemap.component.scss'],
})
export class PackageTreemapComponent implements OnDestroy {
  data = input.required<readonly PackageMetrics[]>();
  metric = input<TreemapMetric>('totalLoc');

  packageSelected = output<string>();

  host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly tooltip = signal<TreemapTooltip>({ visible: false, x: 0, y: 0 });

  private resizeObserver: ResizeObserver | null = null;
  private dimensions = signal<{ width: number; height: number }>({ width: 0, height: 0 });

  constructor() {
    afterNextRender(() => {
      this.observeResize();
      this.measure();
    });

    effect(() => {
      const { width, height } = this.dimensions();
      const data = this.data();
      const metric = this.metric();
      if (width > 0 && height > 0) {
        this.render(data, metric, width, height);
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

  private render(
    data: readonly PackageMetrics[],
    metric: TreemapMetric,
    width: number,
    height: number,
  ): void {
    const svg = select(this.host().nativeElement)
      .selectAll<SVGSVGElement, null>('svg.treemap-svg')
      .data([null])
      .join('svg')
      .attr('class', 'treemap-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height);

    if (data.length === 0) {
      svg.selectAll('*').remove();
      return;
    }

    const root = hierarchy<TreemapDatum | { children: TreemapDatum[] }>({
      children: data.map<TreemapDatum>((p) => ({ name: p.name, value: p[metric], source: p })),
    } as any)
      .sum((d) => ('value' in d ? d.value : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<TreemapDatum | { children: TreemapDatum[] }>()
      .size([width, height])
      .paddingInner(2)
      .round(true)(root);

    const leaves = (root.leaves() as Array<HierarchyRectangularNode<TreemapDatum>>).filter(
      (n) => 'source' in n.data,
    );

    const groups = svg
      .selectAll<SVGGElement, HierarchyRectangularNode<TreemapDatum>>('g.cell')
      .data(leaves, (d) => d.data.name);

    groups.exit().remove();

    const groupsEnter = groups.enter().append('g').attr('class', 'cell').style('cursor', 'pointer');

    groupsEnter.append('rect');
    groupsEnter.append('text').attr('class', 'cell-label');
    groupsEnter.append('text').attr('class', 'cell-sublabel');

    const merged = groupsEnter.merge(groups);

    merged
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .on('mousemove', (event: MouseEvent, d) => this.showTooltip(event, d.data.source))
      .on('mouseleave', () => this.hideTooltip())
      .on('click', (_event, d) => this.packageSelected.emit(d.data.source.name));

    merged
      .select<SVGRectElement>('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => cboColorScale(d.data.source.meanCbo))
      .attr('stroke', '#ffffff');

    merged
      .select<SVGTextElement>('text.cell-label')
      .attr('x', 6)
      .attr('y', 16)
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('fill', '#212121')
      .text((d) => this.shortPackageName(d.data.source.name))
      .attr('visibility', (d) => (d.x1 - d.x0 > 60 && d.y1 - d.y0 > 22 ? 'visible' : 'hidden'));

    merged
      .select<SVGTextElement>('text.cell-sublabel')
      .attr('x', 6)
      .attr('y', 32)
      .attr('font-size', 10)
      .attr('fill', '#424242')
      .text((d) => `${d.data.source.classCount} cl. · LOC ${d.data.source.totalLoc}`)
      .attr('visibility', (d) => (d.x1 - d.x0 > 80 && d.y1 - d.y0 > 40 ? 'visible' : 'hidden'));
  }

  private shortPackageName(name: string): string {
    if (name === '(root)') return name;
    const parts = name.split('.');
    if (parts.length <= 2) return name;
    return `…${parts.slice(-2).join('.')}`;
  }

  private showTooltip(event: MouseEvent, pkg: PackageMetrics): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.tooltip.set({
      visible: true,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
      pkg,
    });
  }

  private hideTooltip(): void {
    this.tooltip.set({ visible: false, x: 0, y: 0 });
  }
}
