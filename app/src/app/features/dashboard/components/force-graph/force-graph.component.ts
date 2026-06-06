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
  forceX,
  forceY,
  Simulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force';
import { quadtree, Quadtree } from 'd3-quadtree';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { NodeInfo } from '../../../../core/models/NodeInfo';
import { EdgeInfo } from '../../../../core/models/EdgeInfo';
import { RelationCategory, NodeType } from '../../../../core/models/types';
import { METRIC_DEFINITIONS } from '../../../../core/models/metricDefinitions';
import { CoChangeFocus } from '../../../../core/state/AnalysisFacade';
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

const LINK_DISTANCE = 160;
const CHARGE_STRENGTH = -620;
const COLLIDE_PADDING = 6;
const NODE_HALO_PADDING = 1.5;
const PACKAGE_CLUSTER_STRENGTH = 0.08;
const PACKAGE_RING_RATIO = 0.32;
const ROOT_PACKAGE_LABEL = '(root)';

// Categorias em ordem de prioridade visual (do fundo para a frente).
// Co-mudança no fundo (mais ruidosa), estruturais por cima (mais informativas).
const CATEGORY_DRAW_ORDER: ReadonlyArray<RelationCategory> = [
  'LOGICAL',
  'BEHAVIORAL',
  'STRUCTURAL',
];

const EDGE_BASE_OPACITY: Record<RelationCategory, number> = {
  STRUCTURAL: 0.55,
  BEHAVIORAL: 0.4,
  LOGICAL: 0.12,
};

const EDGE_LINE_WIDTH: Record<RelationCategory, number> = {
  STRUCTURAL: 1.0,
  BEHAVIORAL: 0.9,
  LOGICAL: 0.7,
};

const EDGE_OPACITY_BRIGHT = 0.9;
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

/** Estado de realce do grafo (seleção de classe ou foco de co-mudança). */
interface Emphasis {
  readonly active: boolean;
  readonly brightNodes: Set<string>;
  readonly brightLinks: Set<SimLink>;
  readonly selectedId: string | null;
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
  selectedNode = input<NodeInfo | null>(null);
  coChangeFocus = input<CoChangeFocus | null>(null);

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
  private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
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
  private neighborIds: Set<string> = new Set();
  private internalSelection = false;
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
        this.rebuildSimulation(nodes, edges);
      }
    });

    effect(() => {
      this.visibleNodeIds();
      this.activeCategories();
      this.coChangeFocus();
      this.requestDraw();
    });

    effect(() => {
      const selectedId = this.selectedNode()?.id ?? null;
      this.neighborIds = this.computeNeighbors(selectedId);
      if (selectedId !== null && !this.internalSelection && this.simulation !== null) {
        this.centerOnNode(selectedId);
      }
      this.internalSelection = false;
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

    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .filter((event) => !event.shiftKey)
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.requestDraw();
      });
    select(canvas).call(this.zoomBehavior);

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
    const packageCenters = this.computePackageCenters(width, height);

    const sim = forceSimulation<SimNode, SimLink>(this.simNodes)
      .randomSource(rand)
      .force(
        'link',
        forceLink<SimNode, SimLink>(this.simLinks)
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
          .strength(0.25),
      )
      .force('charge', forceManyBody<SimNode>().strength(CHARGE_STRENGTH))
      .force('center', forceCenter(width / 2, height / 2).strength(0.04))
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => d.radius + COLLIDE_PADDING),
      )
      .force(
        'x',
        forceX<SimNode>((d) => packageCenters.get(packageKeyOf(d))?.[0] ?? width / 2).strength(
          PACKAGE_CLUSTER_STRENGTH,
        ),
      )
      .force(
        'y',
        forceY<SimNode>((d) => packageCenters.get(packageKeyOf(d))?.[1] ?? height / 2).strength(
          PACKAGE_CLUSTER_STRENGTH,
        ),
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

  /**
   * Distribui os pacotes do projeto em pontos espaçados num anel ao redor do centro.
   * Cada classe é então puxada (via forceX/forceY) para o ponto do seu pacote,
   * gerando agrupamentos naturais que reduzem o emaranhado de arestas.
   */
  private computePackageCenters(width: number, height: number): Map<string, [number, number]> {
    const packages = new Set<string>();
    for (const node of this.simNodes) packages.add(packageKeyOf(node));

    const list = [...packages].sort();
    const count = list.length;
    const centers = new Map<string, [number, number]>();
    if (count === 0) return centers;

    const cx = width / 2;
    const cy = height / 2;
    if (count === 1) {
      centers.set(list[0], [cx, cy]);
      return centers;
    }

    const ringRadius = Math.min(width, height) * PACKAGE_RING_RATIO;
    const step = (2 * Math.PI) / count;
    for (let i = 0; i < count; i++) {
      const angle = i * step - Math.PI / 2;
      centers.set(list[i], [cx + ringRadius * Math.cos(angle), cy + ringRadius * Math.sin(angle)]);
    }
    return centers;
  }

  private buildSpatialIndex(): void {
    this.spatialIndex = quadtree<SimNode>()
      .x((n) => n.x ?? 0)
      .y((n) => n.y ?? 0)
      .addAll(this.simNodes);
  }

  private computeNeighbors(selectedId: string | null): Set<string> {
    const result = new Set<string>();
    if (selectedId === null) return result;
    for (const link of this.simLinks) {
      const sid = (link.source as SimNode).id;
      const tid = (link.target as SimNode).id;
      if (sid === selectedId) result.add(tid);
      else if (tid === selectedId) result.add(sid);
    }
    return result;
  }

  private centerOnNode(nodeId: string): void {
    const node = this.simNodes.find((n) => n.id === nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;
    if (this.zoomBehavior === null) return;
    const canvas = select(this.canvasRef().nativeElement);
    canvas.call(this.zoomBehavior.translateTo, node.x, node.y);
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
    this.internalSelection = true;
    this.nodeSelected.emit(hit?.info ?? null);
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
    const emphasis = this.computeEmphasis();

    this.drawEdges(ctx, visibleIds, cats, useFisheye, emphasis);
    this.drawNodes(ctx, visibleIds, useFisheye, emphasis);

    ctx.restore();

    if (useFisheye) this.drawLensIndicator(ctx);
  }

  /**
   * Determina a ênfase visual corrente. Seleção de classe tem prioridade; na
   * ausência dela, aplica o foco de co-mudança (par de pacotes vindo do heatmap).
   */
  private computeEmphasis(): Emphasis {
    const selectedId = this.selectedNode()?.id ?? null;
    if (selectedId !== null) {
      const brightLinks = new Set<SimLink>();
      for (const link of this.simLinks) {
        if ((link.source as SimNode).id === selectedId || (link.target as SimNode).id === selectedId) {
          brightLinks.add(link);
        }
      }
      const brightNodes = new Set<string>([selectedId, ...this.neighborIds]);
      return { active: true, brightNodes, brightLinks, selectedId };
    }

    const focus = this.coChangeFocus();
    if (focus) {
      const brightLinks = new Set<SimLink>();
      const brightNodes = new Set<string>();
      for (const link of this.simLinks) {
        if (link.info.category !== 'LOGICAL') continue;
        const sp = packageKeyOf(link.source as SimNode);
        const tp = packageKeyOf(link.target as SimNode);
        const matches = (sp === focus.a && tp === focus.b) || (sp === focus.b && tp === focus.a);
        if (matches) {
          brightLinks.add(link);
          brightNodes.add((link.source as SimNode).id);
          brightNodes.add((link.target as SimNode).id);
        }
      }
      return { active: true, brightNodes, brightLinks, selectedId: null };
    }

    return { active: false, brightNodes: new Set(), brightLinks: new Set(), selectedId: null };
  }

  private drawEdges(
    ctx: CanvasRenderingContext2D,
    visibleIds: Set<string>,
    cats: Set<RelationCategory>,
    useFisheye: boolean,
    emphasis: Emphasis,
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

      const isHighlighted = emphasis.active && emphasis.brightLinks.has(link);
      buckets[link.info.category][isHighlighted ? 'bright' : 'dim'].push(link);
    }

    for (const cat of CATEGORY_DRAW_ORDER) {
      const dim = buckets[cat].dim;
      const bright = buckets[cat].bright;
      const lineWidth = EDGE_LINE_WIDTH[cat];
      const dash = edgeDash(cat);

      if (dim.length > 0) {
        ctx.strokeStyle = categoryColor[cat];
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = emphasis.active ? EDGE_OPACITY_DIM : EDGE_BASE_OPACITY[cat];
        ctx.setLineDash(dash);
        this.strokeBatch(ctx, dim, useFisheye);
      }

      if (bright.length > 0) {
        ctx.strokeStyle = categoryColor[cat];
        ctx.lineWidth = lineWidth + 0.6;
        ctx.globalAlpha = EDGE_OPACITY_BRIGHT;
        ctx.setLineDash(dash);
        this.strokeBatch(ctx, bright, useFisheye);
      }
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private strokeBatch(ctx: CanvasRenderingContext2D, links: SimLink[], useFisheye: boolean): void {
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
    emphasis: Emphasis,
  ): void {
    const dimNodes: SimNode[] = [];
    const brightNodes: SimNode[] = [];

    for (const node of this.simNodes) {
      if (!visibleIds.has(node.id)) continue;
      if (node.x === undefined || node.y === undefined) continue;
      const isFocus = !emphasis.active || emphasis.brightNodes.has(node.id);
      (isFocus ? brightNodes : dimNodes).push(node);
    }

    if (dimNodes.length > 0) {
      ctx.globalAlpha = NODE_OPACITY_DIM;
      this.paintNodes(ctx, dimNodes, useFisheye, false, emphasis.selectedId);
    }

    ctx.globalAlpha = 1;
    this.paintNodes(ctx, brightNodes, useFisheye, true, emphasis.selectedId);
  }

  private paintNodes(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    useFisheye: boolean,
    canBeSelected: boolean,
    selectedId: string | null,
  ): void {
    // Pré-calcula posições e raios (usados duas vezes: halo + nó).
    const projections: Array<{ node: SimNode; x: number; y: number; r: number }> = [];
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
      projections.push({ node, x, y, r });
    }

    // Camada 1 — halo branco: oculta arestas que passariam por dentro do nó,
    // criando separação visual clara entre estrutura do grafo e nós.
    ctx.fillStyle = '#ffffff';
    for (const p of projections) {
      drawNodeShape(ctx, p.node.info.type, p.x, p.y, p.r + NODE_HALO_PADDING, false);
    }

    // Camada 2 — preenchimento colorido + contorno.
    for (const p of projections) {
      ctx.fillStyle = cboColorScale(p.node.info.metrics.cbo);
      const isSelected = canBeSelected && p.node.id === selectedId;
      ctx.strokeStyle = isSelected ? '#1565c0' : '#9e9e9e';
      ctx.lineWidth = isSelected ? 2 : 1;
      drawNodeShape(ctx, p.node.info.type, p.x, p.y, p.r, true);
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
  withStroke: boolean,
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
  if (withStroke) ctx.stroke();
}

function lensProject(lens: FisheyeLens, x: number, y: number): [number, number] {
  const p = lens(x, y);
  return [p.x, p.y];
}

function packageKeyOf(node: SimNode): string {
  return node.info.packageName === '' ? ROOT_PACKAGE_LABEL : node.info.packageName;
}
