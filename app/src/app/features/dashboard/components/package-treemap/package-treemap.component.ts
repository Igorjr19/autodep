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
import { NodeInfo } from '../../../../core/models/NodeInfo';
import { buildPackageTree, TreemapClass, TreemapPackage } from '../../../../core/aggregations';
import { cboColorScale } from '../../../../core/d3';

const ROOT_PACKAGE_LABEL = '(root)';

interface TreemapTooltip {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly lines: readonly string[];
}

/** Datum da hierarquia d3: raiz, pacote (depth 1) ou classe (depth 2, folha). */
interface HierDatum {
  kind: 'root' | 'package' | 'class';
  children?: HierDatum[];
  pkg?: TreemapPackage;
  cls?: TreemapClass;
}

type PackedNode = HierarchyRectangularNode<HierDatum>;

const EMPTY_TOOLTIP: TreemapTooltip = { visible: false, x: 0, y: 0, title: '', lines: [] };

@Component({
  selector: 'app-package-treemap',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-treemap.component.html',
  styleUrls: ['./package-treemap.component.scss'],
})
export class PackageTreemapComponent implements OnDestroy {
  nodes = input.required<readonly NodeInfo[]>();
  selectedNodeId = input<string | null>(null);
  filteredPackages = input<ReadonlySet<string>>(new Set());

  packageSelected = output<string>();
  classSelected = output<NodeInfo>();

  host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly showClasses = signal(false);
  protected readonly tooltip = signal<TreemapTooltip>(EMPTY_TOOLTIP);

  private resizeObserver: ResizeObserver | null = null;
  private readonly dimensions = signal<{ width: number; height: number }>({ width: 0, height: 0 });

  constructor() {
    afterNextRender(() => {
      this.observeResize();
      this.measure();
    });

    effect(() => {
      const { width, height } = this.dimensions();
      const tree = buildPackageTree(this.nodes());
      const showClasses = this.showClasses();
      const selectedId = this.selectedNodeId();
      const filtered = this.filteredPackages();
      if (width > 0 && height > 0) {
        this.render(tree, showClasses, selectedId, filtered, width, height);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected toggleClasses(): void {
    this.showClasses.update((v) => !v);
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
    tree: readonly TreemapPackage[],
    showClasses: boolean,
    selectedId: string | null,
    filtered: ReadonlySet<string>,
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

    svg.selectAll('*').remove();
    if (tree.length === 0) return;

    const root = hierarchy<HierDatum>(
      {
        kind: 'root',
        children: tree.map<HierDatum>((pkg) => ({
          kind: 'package',
          pkg,
          children: pkg.classes.map<HierDatum>((cls) => ({ kind: 'class', cls })),
        })),
      },
      (d) => d.children,
    )
      .sum((d) => (d.kind === 'class' ? Math.max(d.cls!.loc, 1) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const packed = treemap<HierDatum>()
      .size([width, height])
      .paddingInner(showClasses ? 1 : 2)
      .paddingTop(showClasses ? 15 : 0)
      .round(true)(root);

    const selectedPackage = this.packageOfSelected(tree, selectedId);

    if (showClasses) {
      this.renderNested(packed, selectedId, selectedPackage, filtered);
    } else {
      this.renderFlat(packed, selectedPackage, filtered);
    }
  }

  private renderFlat(
    root: PackedNode,
    selectedPackage: string | null,
    filtered: ReadonlySet<string>,
  ): void {
    const packages = (root.children ?? []) as PackedNode[];
    const g = this.selectSvg().append('g');

    for (const node of packages) {
      const pkg = node.data.pkg!;
      const emphasized = filtered.has(pkg.name) || pkg.name === selectedPackage;
      const cell = g
        .append('g')
        .attr('transform', `translate(${node.x0},${node.y0})`)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent) => this.showPackageTooltip(event, pkg))
        .on('mouseleave', () => this.hideTooltip())
        .on('click', () => this.packageSelected.emit(pkg.name));

      const w = node.x1 - node.x0;
      const h = node.y1 - node.y0;

      cell
        .append('rect')
        .attr('width', Math.max(0, w))
        .attr('height', Math.max(0, h))
        .attr('fill', cboColorScale(pkg.meanCbo))
        .attr('stroke', emphasized ? '#1565c0' : '#ffffff')
        .attr('stroke-width', emphasized ? 2.5 : 1);

      if (w > 60 && h > 22) {
        cell
          .append('text')
          .attr('x', 6)
          .attr('y', 16)
          .attr('font-size', 11)
          .attr('font-weight', 600)
          .attr('fill', '#212121')
          .text(this.shortPackageName(pkg.name));
      }
      if (w > 80 && h > 40) {
        cell
          .append('text')
          .attr('x', 6)
          .attr('y', 32)
          .attr('font-size', 10)
          .attr('fill', '#424242')
          .text(`${pkg.classCount} cl. · LOC ${pkg.totalLoc}`);
      }
    }
  }

  private renderNested(
    root: PackedNode,
    selectedId: string | null,
    selectedPackage: string | null,
    filtered: ReadonlySet<string>,
  ): void {
    const packages = (root.children ?? []) as PackedNode[];
    const svg = this.selectSvg();
    const frames = svg.append('g');
    const leavesG = svg.append('g');

    for (const pkgNode of packages) {
      const pkg = pkgNode.data.pkg!;
      const emphasized = filtered.has(pkg.name) || pkg.name === selectedPackage;
      const w = pkgNode.x1 - pkgNode.x0;
      const h = pkgNode.y1 - pkgNode.y0;

      const frame = frames
        .append('g')
        .attr('transform', `translate(${pkgNode.x0},${pkgNode.y0})`)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent) => this.showPackageTooltip(event, pkg))
        .on('mouseleave', () => this.hideTooltip())
        .on('click', () => this.packageSelected.emit(pkg.name));

      frame
        .append('rect')
        .attr('width', Math.max(0, w))
        .attr('height', Math.max(0, h))
        .attr('fill', 'rgba(0,0,0,0.02)')
        .attr('stroke', emphasized ? '#1565c0' : '#cfcfcf')
        .attr('stroke-width', emphasized ? 2.5 : 1);

      if (w > 50) {
        frame
          .append('text')
          .attr('x', 4)
          .attr('y', 11)
          .attr('font-size', 10)
          .attr('font-weight', 600)
          .attr('fill', '#424242')
          .text(this.shortPackageName(pkg.name));
      }
    }

    const leaves = (root.leaves() as PackedNode[]).filter((n) => n.data.kind === 'class');
    for (const leaf of leaves) {
      const cls = leaf.data.cls!;
      const w = leaf.x1 - leaf.x0;
      const h = leaf.y1 - leaf.y0;
      if (w <= 0 || h <= 0) continue;

      const isSelected = cls.id === selectedId;
      const cell = leavesG
        .append('g')
        .attr('transform', `translate(${leaf.x0},${leaf.y0})`)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent) => this.showClassTooltip(event, cls))
        .on('mouseleave', () => this.hideTooltip())
        .on('click', () => this.classSelected.emit(cls.node));

      cell
        .append('rect')
        .attr('width', w)
        .attr('height', h)
        .attr('fill', cboColorScale(cls.cbo))
        .attr('stroke', isSelected ? '#1565c0' : '#ffffff')
        .attr('stroke-width', isSelected ? 2.5 : 0.5);

      if (w > 42 && h > 14) {
        cell
          .append('text')
          .attr('x', 3)
          .attr('y', 11)
          .attr('font-size', 9)
          .attr('fill', '#212121')
          .text(this.truncate(cls.simpleName, Math.floor(w / 6)));
      }
    }
  }

  /** Helper apenas para tipar o retorno do select sem repetir a assinatura. */
  private selectSvg() {
    return select(this.host().nativeElement).select<SVGSVGElement>('svg.treemap-svg');
  }

  private packageOfSelected(
    tree: readonly TreemapPackage[],
    selectedId: string | null,
  ): string | null {
    if (selectedId === null) return null;
    for (const pkg of tree) {
      if (pkg.classes.some((c) => c.id === selectedId)) return pkg.name;
    }
    return null;
  }

  private showPackageTooltip(event: MouseEvent, pkg: TreemapPackage): void {
    this.setTooltip(event, pkg.name, [
      `Classes: ${pkg.classCount}`,
      `Linhas de código (total): ${pkg.totalLoc}`,
      `Acoplamento (CBO) médio: ${pkg.meanCbo}`,
      `Coesão (LCOM) média: ${pkg.meanLcom}`,
    ]);
  }

  private showClassTooltip(event: MouseEvent, cls: TreemapClass): void {
    this.setTooltip(event, cls.simpleName, [
      `Linhas de código: ${cls.loc}`,
      `Acoplamento (CBO): ${cls.cbo}`,
      'Clique para destacar no grafo',
    ]);
  }

  private setTooltip(event: MouseEvent, title: string, lines: string[]): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.tooltip.set({
      visible: true,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
      title,
      lines,
    });
  }

  private hideTooltip(): void {
    this.tooltip.set(EMPTY_TOOLTIP);
  }

  private shortPackageName(name: string): string {
    if (name === ROOT_PACKAGE_LABEL) return name;
    const parts = name.split('.');
    if (parts.length <= 2) return name;
    return `…${parts.slice(-2).join('.')}`;
  }

  private truncate(text: string, max: number): string {
    if (max <= 1) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }
}
