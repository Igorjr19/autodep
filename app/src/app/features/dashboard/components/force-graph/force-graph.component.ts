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
import { ButtonModule } from 'primeng/button';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  Simulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force';
import { quadtree, Quadtree } from 'd3-quadtree';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, ZoomTransform } from 'd3-zoom';
import { NodeInfo } from '../../../../core/models/NodeInfo';
import { EdgeInfo } from '../../../../core/models/EdgeInfo';
import { RelationCategory, NodeType } from '../../../../core/models/types';
import { METRIC_DEFINITIONS } from '../../../../core/models/metricDefinitions';
import {
  cboColorScale,
  categoryColor,
  circularFisheye,
  FisheyeLens,
  mulberry32,
} from '../../../../core/d3';

const TYPE_LABELS: Record<NodeType, string> = {
  CLASS: 'Classe',
  INTERFACE: 'Interface',
  ENUM: 'Enum',
  RECORD: 'Record',
};

const CATEGORY_TOOLTIPS: Record<RelationCategory, string> = {
  STRUCTURAL:
    'Relações estruturais: herança, implementação de interface, composição, agregação e associação entre classes',
  BEHAVIORAL:
    'Relações comportamentais: chamadas de método, acesso a atributos e referências de tipo',
  LOGICAL:
    'Relações de co-mudança: classes que historicamente foram modificadas no mesmo commit no Git',
};

const SIMULATION_SEED = 42;
const FISHEYE_RADIUS = 200;
const FISHEYE_DISTORTION = 3;
const MIN_NODE_RADIUS = 6;
const MAX_NODE_RADIUS = 22;
const CBO_RADIUS_DOMAIN = 30;
const SYNC_TICK_ALPHA_TARGET = 0.02;

const CATEGORIES: ReadonlyArray<RelationCategory> = ['STRUCTURAL', 'BEHAVIORAL', 'LOGICAL'];

const EDGE_OPACITY_NO_SELECTION = 0.5;
const EDGE_OPACITY_BRIGHT = 0.85;
const EDGE_OPACITY_DIM = 0.04;
const NODE_OPACITY_DIM = 0.15;

interface SimNode extends SimulationNodeDatum {
  readonly id: string;
  readonly info: NodeInfo;
  radius: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode | string;
  target: SimNode | string;
  readonly info: EdgeInfo;
}

@Component({
  selector: 'app-force-graph',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './force-graph.component.html',
  styleUrls: ['./force-graph.component.scss'],
})
export class ForceGraphComponent implements OnDestroy {
  nodes = input.required<readonly NodeInfo[]>();
  edges = input.required<readonly EdgeInfo[]>();
  activeCategories = input.required<Set<RelationCategory>>();
  visibleNodeIds = input.required<Set<string>>();

  nodeSelected = output<NodeInfo | null>();
  categoryToggled = output<RelationCategory>();

  host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');

  protected readonly fisheyeEnabled = signal(false);
  protected readonly hoverTooltip = signal<{
    readonly visible: boolean;
    readonly x: number;
    readonly y: number;
    readonly node: NodeInfo | null;
  }>({ visible: false, x: 0, y: 0, node: null });
  protected readonly defs = METRIC_DEFINITIONS;
  protected readonly categories: ReadonlyArray<{
    key: RelationCategory;
    label: string;
    color: string;
    tooltip: string;
  }> = [
    {
      key: 'STRUCTURAL',
      label: 'Estruturais',
      color: categoryColor.STRUCTURAL,
      tooltip: CATEGORY_TOOLTIPS.STRUCTURAL,
    },
    {
      key: 'BEHAVIORAL',
      label: 'Comportamentais',
      color: categoryColor.BEHAVIORAL,
      tooltip: CATEGORY_TOOLTIPS.BEHAVIORAL,
    },
    {
      key: 'LOGICAL',
      label: 'Co-mudança',
      color: categoryColor.LOGICAL,
      tooltip: CATEGORY_TOOLTIPS.LOGICAL,
    },
  ];

  protected typeLabel(type: NodeType): string {
    return TYPE_LABELS[type] ?? type;
  }

  private simulation: Simulation<SimNode, SimLink> | null = null;
  private simNodes: SimNode[] = [];
  private simLinks: SimLink[] = [];
  private spatialIndex: Quadtree<SimNode> | null = null;
  private lens: FisheyeLens = circularFisheye()
    .radius(FISHEYE_RADIUS)
    .distortion(FISHEYE_DISTORTION);
  private mouse: [number, number] | null = null;
  private transform: ZoomTransform = zoomIdentity;
  private resizeObserver: ResizeObserver | null = null;
  private dimensions = { width: 0, height: 0 };
  private dpr = 1;
  private drawRequested = false;
  private lastDatasetKey = '';
  private selectedNodeId: string | null = null;
  private neighborIds: Set<string> = new Set();
  private cleanupHandlers: Array<() => void> = [];

  constructor() {
    afterNextRender(() => {
      this.setupCanvas();
      this.setupInteractions();
      this.observeResize();
    });

    effect(() => {
      const nodes = this.nodes();
      const edges = this.edges();
      const key = this.computeDatasetKey(nodes, edges);
      if (key !== this.lastDatasetKey && this.dimensions.width > 0) {
        this.lastDatasetKey = key;
        this.clearSelection();
        this.rebuildSimulation(nodes, edges);
      }
    });

    effect(() => {
      this.visibleNodeIds();
      this.activeCategories();
      this.requestDraw();
    });
  }

  ngOnDestroy(): void {
    this.simulation?.stop();
    this.resizeObserver?.disconnect();
    for (const cleanup of this.cleanupHandlers) cleanup();
  }

  protected toggleFisheye(): void {
    this.fisheyeEnabled.update((v) => !v);
    this.requestDraw();
  }

  protected toggleCategory(cat: RelationCategory): void {
    this.categoryToggled.emit(cat);
  }

  protected isCategoryActive(cat: RelationCategory): boolean {
    return this.activeCategories().has(cat);
  }

  private setupCanvas(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.measure();
  }

  private setupInteractions(): void {
    const canvas = this.canvasRef().nativeElement;

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .filter((event) => !event.shiftKey)
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.requestDraw();
      });
    select(canvas).call(zoomBehavior);

    const onMove = (event: MouseEvent) => this.handleMouseMove(event);
    const onLeave = () => this.handleMouseLeave();
    const onClick = (event: MouseEvent) => this.handleClick(event);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    this.cleanupHandlers.push(() => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    });
  }

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.measure();
      const nodes = this.nodes();
      const edges = this.edges();
      if (this.simulation === null && nodes.length > 0) {
        this.lastDatasetKey = this.computeDatasetKey(nodes, edges);
        this.rebuildSimulation(nodes, edges);
      } else {
        this.requestDraw();
      }
    });
    this.resizeObserver.observe(this.host().nativeElement);
  }

  private measure(): void {
    const el = this.host().nativeElement;
    const canvas = this.canvasRef().nativeElement;
    const width = el.clientWidth;
    const height = el.clientHeight;
    this.dimensions = { width, height };
    canvas.width = width * this.dpr;
    canvas.height = height * this.dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  private computeDatasetKey(nodes: readonly NodeInfo[], edges: readonly EdgeInfo[]): string {
    const firstNode = nodes[0]?.id ?? '';
    const lastNode = nodes[nodes.length - 1]?.id ?? '';
    return `${nodes.length}:${edges.length}:${firstNode}:${lastNode}`;
  }

  private rebuildSimulation(nodes: readonly NodeInfo[], edges: readonly EdgeInfo[]): void {
    this.simulation?.stop();

    this.simNodes = nodes.map<SimNode>((n) => ({
      id: n.id,
      info: n,
      radius: nodeRadius(n.metrics.cbo),
    }));

    const nodeIndex = new Map(this.simNodes.map((n) => [n.id, n]));
    this.simLinks = edges
      .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
      .map<SimLink>((e) => ({
        source: e.source,
        target: e.target,
        info: e,
      }));

    const { width, height } = this.dimensions;
    const rand = mulberry32(SIMULATION_SEED);

    const sim = forceSimulation<SimNode, SimLink>(this.simNodes)
      .randomSource(rand)
      .force(
        'link',
        forceLink<SimNode, SimLink>(this.simLinks)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3),
      )
      .force('charge', forceManyBody<SimNode>().strength(-300))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => d.radius + 2),
      )
      .alphaDecay(0.05)
      .stop();

    const alphaMin = sim.alphaMin();
    const alphaDecay = sim.alphaDecay();
    const maxTicks = Math.ceil(
      Math.log(SYNC_TICK_ALPHA_TARGET / sim.alpha()) / Math.log(1 - alphaDecay),
    );
    const ticks = Math.min(Math.max(maxTicks, 60), 400);
    for (let i = 0; i < ticks; i++) sim.tick();

    this.simulation = sim;
    this.buildSpatialIndex();
    this.requestDraw();
    void alphaMin;
  }

  private buildSpatialIndex(): void {
    this.spatialIndex = quadtree<SimNode>()
      .x((n) => n.x ?? 0)
      .y((n) => n.y ?? 0)
      .addAll(this.simNodes);
  }

  private clearSelection(): void {
    this.selectedNodeId = null;
    this.neighborIds = new Set();
  }

  private updateNeighbors(): void {
    this.neighborIds = new Set();
    if (this.selectedNodeId === null) return;
    for (const link of this.simLinks) {
      const sid = (link.source as SimNode).id;
      const tid = (link.target as SimNode).id;
      if (sid === this.selectedNodeId) this.neighborIds.add(tid);
      else if (tid === this.selectedNodeId) this.neighborIds.add(sid);
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse = [event.clientX - rect.left, event.clientY - rect.top];
    const [wx, wy] = this.screenToWorld(this.mouse[0], this.mouse[1]);
    this.lens.focus([wx, wy]);

    const hovered = this.findNearestNode(wx, wy);
    if (hovered) {
      this.hoverTooltip.set({
        visible: true,
        x: this.mouse[0] + 14,
        y: this.mouse[1] + 14,
        node: hovered.info,
      });
      canvas.style.cursor = 'pointer';
    } else if (this.hoverTooltip().visible) {
      this.hoverTooltip.set({ visible: false, x: 0, y: 0, node: null });
      canvas.style.cursor = '';
    }

    if (this.fisheyeEnabled()) this.requestDraw();
  }

  private handleMouseLeave(): void {
    this.mouse = null;
    this.hoverTooltip.set({ visible: false, x: 0, y: 0, node: null });
    this.canvasRef().nativeElement.style.cursor = '';
    if (this.fisheyeEnabled()) this.requestDraw();
  }

  private handleClick(event: MouseEvent): void {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const [wx, wy] = this.screenToWorld(screenX, screenY);
    const hit = this.findNearestNode(wx, wy);
    this.selectedNodeId = hit?.id ?? null;
    this.updateNeighbors();
    this.nodeSelected.emit(hit?.info ?? null);
    this.requestDraw();
  }

  private screenToWorld(sx: number, sy: number): [number, number] {
    return this.transform.invert([sx, sy]);
  }

  private findNearestNode(wx: number, wy: number): SimNode | null {
    if (this.spatialIndex === null) this.buildSpatialIndex();
    if (this.spatialIndex === null) return null;
    const hitThreshold = MAX_NODE_RADIUS / Math.max(this.transform.k, 0.01);
    const candidate = this.spatialIndex.find(wx, wy, hitThreshold);
    if (!candidate) return null;
    const dx = (candidate.x ?? 0) - wx;
    const dy = (candidate.y ?? 0) - wy;
    if (Math.sqrt(dx * dx + dy * dy) > candidate.radius + 4) return null;
    return candidate;
  }

  private requestDraw(): void {
    if (this.drawRequested) return;
    this.drawRequested = true;
    requestAnimationFrame(() => {
      this.drawRequested = false;
      this.draw();
    });
  }

  private draw(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = this.dimensions;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    const visibleIds = this.visibleNodeIds();
    const cats = this.activeCategories();
    const useFisheye = this.fisheyeEnabled() && this.mouse !== null;
    const hasSelection = this.selectedNodeId !== null;

    this.drawEdges(ctx, visibleIds, cats, useFisheye, hasSelection);
    this.drawNodes(ctx, visibleIds, useFisheye, hasSelection);

    ctx.restore();

    if (useFisheye) this.drawLensIndicator(ctx);
  }

  private drawEdges(
    ctx: CanvasRenderingContext2D,
    visibleIds: Set<string>,
    cats: Set<RelationCategory>,
    useFisheye: boolean,
    hasSelection: boolean,
  ): void {
    const buckets: Record<RelationCategory, { dim: SimLink[]; bright: SimLink[] }> = {
      STRUCTURAL: { dim: [], bright: [] },
      BEHAVIORAL: { dim: [], bright: [] },
      LOGICAL: { dim: [], bright: [] },
    };

    for (const link of this.simLinks) {
      const src = link.source as SimNode;
      const tgt = link.target as SimNode;
      if (!visibleIds.has(src.id) || !visibleIds.has(tgt.id)) continue;
      if (!cats.has(link.info.category)) continue;

      const isHighlighted =
        hasSelection &&
        (src.id === this.selectedNodeId || tgt.id === this.selectedNodeId);
      buckets[link.info.category][isHighlighted ? 'bright' : 'dim'].push(link);
    }

    for (const cat of CATEGORIES) {
      const dim = buckets[cat].dim;
      const bright = buckets[cat].bright;
      const lineWidth = cat === 'LOGICAL' ? 2 : 1;
      const dash = edgeDash(cat);

      if (dim.length > 0) {
        ctx.strokeStyle = categoryColor[cat];
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = hasSelection ? EDGE_OPACITY_DIM : EDGE_OPACITY_NO_SELECTION;
        ctx.setLineDash(dash);
        this.strokeBatch(ctx, dim, useFisheye);
      }

      if (bright.length > 0) {
        ctx.strokeStyle = categoryColor[cat];
        ctx.lineWidth = lineWidth + 0.5;
        ctx.globalAlpha = EDGE_OPACITY_BRIGHT;
        ctx.setLineDash(dash);
        this.strokeBatch(ctx, bright, useFisheye);
      }
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private strokeBatch(
    ctx: CanvasRenderingContext2D,
    links: SimLink[],
    useFisheye: boolean,
  ): void {
    ctx.beginPath();
    for (const link of links) {
      const src = link.source as SimNode;
      const tgt = link.target as SimNode;
      if (src.x === undefined || src.y === undefined) continue;
      if (tgt.x === undefined || tgt.y === undefined) continue;
      const [sx, sy] = useFisheye ? lensProject(this.lens, src.x, src.y) : [src.x, src.y];
      const [tx, ty] = useFisheye ? lensProject(this.lens, tgt.x, tgt.y) : [tgt.x, tgt.y];
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
  }

  private drawNodes(
    ctx: CanvasRenderingContext2D,
    visibleIds: Set<string>,
    useFisheye: boolean,
    hasSelection: boolean,
  ): void {
    const dimNodes: SimNode[] = [];
    const brightNodes: SimNode[] = [];

    for (const node of this.simNodes) {
      if (!visibleIds.has(node.id)) continue;
      if (node.x === undefined || node.y === undefined) continue;
      const isFocus =
        !hasSelection ||
        node.id === this.selectedNodeId ||
        this.neighborIds.has(node.id);
      (isFocus ? brightNodes : dimNodes).push(node);
    }

    if (dimNodes.length > 0) {
      ctx.globalAlpha = NODE_OPACITY_DIM;
      this.paintNodes(ctx, dimNodes, useFisheye, false);
    }

    ctx.globalAlpha = 1;
    this.paintNodes(ctx, brightNodes, useFisheye, true);
  }

  private paintNodes(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    useFisheye: boolean,
    canBeSelected: boolean,
  ): void {
    for (const node of nodes) {
      let x = node.x ?? 0;
      let y = node.y ?? 0;
      let r = node.radius;
      if (useFisheye) {
        const projected = this.lens(x, y);
        x = projected.x;
        y = projected.y;
        r = node.radius * projected.z;
      }

      ctx.fillStyle = cboColorScale(node.info.metrics.cbo);
      const isSelected = canBeSelected && node.id === this.selectedNodeId;
      ctx.strokeStyle = isSelected ? '#1565c0' : '#cccccc';
      ctx.lineWidth = isSelected ? 2 : 1;
      drawNodeShape(ctx, node.info.type, x, y, r);
    }
  }

  private drawLensIndicator(ctx: CanvasRenderingContext2D): void {
    if (this.mouse === null) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = 'rgba(21, 101, 192, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(this.mouse[0], this.mouse[1], FISHEYE_RADIUS * this.transform.k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function nodeRadius(cbo: number): number {
  const normalized = Math.min(1, Math.max(0, cbo / CBO_RADIUS_DOMAIN));
  return MIN_NODE_RADIUS + normalized * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
}

function edgeDash(category: RelationCategory): number[] {
  if (category === 'BEHAVIORAL') return [4, 3];
  if (category === 'LOGICAL') return [1, 3];
  return [];
}

function drawNodeShape(
  ctx: CanvasRenderingContext2D,
  type: NodeType,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (type) {
    case 'INTERFACE':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'ENUM':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.87, y + r * 0.5);
      ctx.lineTo(x - r * 0.87, y + r * 0.5);
      ctx.closePath();
      break;
    case 'RECORD':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'CLASS':
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
  }
  ctx.fill();
  ctx.stroke();
}

function lensProject(lens: FisheyeLens, x: number, y: number): [number, number] {
  const p = lens(x, y);
  return [p.x, p.y];
}
