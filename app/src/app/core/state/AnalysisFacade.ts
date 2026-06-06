import { Injectable, inject, signal, computed } from '@angular/core';
import { AnalysisResult } from '../models/AnalysisResult';
import { NodeInfo } from '../models/NodeInfo';
import { RelationCategory } from '../models/types';
import { ANALYSIS_SERVICE_TOKEN } from '../services/AnalysisPort';
import { buildCoChangeMatrix } from '../aggregations';

/** Ênfase nas arestas de co-mudança entre dois pacotes (a = b indica intra-pacote). */
export interface CoChangeFocus {
  readonly a: string;
  readonly b: string;
}

@Injectable({ providedIn: 'root' })
export class AnalysisFacade {
  private analysisService = inject(ANALYSIS_SERVICE_TOKEN);

  private readonly _analysisData = signal<AnalysisResult | null>(null);
  private readonly _selectedPath = signal<string | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _selectedNode = signal<NodeInfo | null>(null);
  private readonly _activeCategories = signal<Set<RelationCategory>>(
    new Set(['STRUCTURAL', 'BEHAVIORAL', 'LOGICAL']),
  );
  private readonly _packageFilter = signal<Set<string>>(new Set());
  private readonly _minCboFilter = signal<number>(0);
  private readonly _coChangeFocus = signal<CoChangeFocus | null>(null);

  readonly analysisData = computed(() => this._analysisData());
  readonly selectedPath = computed(() => this._selectedPath());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly selectedNode = computed(() => this._selectedNode());
  readonly activeCategories = computed(() => this._activeCategories());
  readonly filteredPackages = computed(() => this._packageFilter());
  readonly minCboFilter = computed(() => this._minCboFilter());
  readonly coChangeFocus = computed(() => this._coChangeFocus());

  /** Valor único para o dropdown de pacote (null quando há 0 ou múltiplos pacotes). */
  readonly packageFilterValue = computed(() => {
    const set = this._packageFilter();
    return set.size === 1 ? [...set][0] : null;
  });

  readonly availablePackages = computed(() => {
    const data = this._analysisData();
    if (!data) return [];
    const pkgs = new Set(data.nodes.map((n) => n.packageName));
    return [...pkgs].sort();
  });

  readonly visibleNodeIds = computed(() => {
    const data = this._analysisData();
    if (!data) return new Set<string>();
    const pkgs = this._packageFilter();
    const minCbo = this._minCboFilter();
    return new Set(
      data.nodes
        .filter((n) => {
          if (pkgs.size > 0 && !pkgs.has(n.packageName)) return false;
          if (minCbo > 0 && n.metrics.cbo < minCbo) return false;
          return true;
        })
        .map((n) => n.id),
    );
  });

  readonly filteredNodes = computed(() => {
    const data = this._analysisData();
    if (!data) return [];
    const ids = this.visibleNodeIds();
    return data.nodes.filter((n) => ids.has(n.id));
  });

  readonly filteredEdges = computed(() => {
    const data = this._analysisData();
    if (!data) return [];
    const ids = this.visibleNodeIds();
    const cats = this._activeCategories();
    return data.edges.filter((e) => cats.has(e.category) && ids.has(e.source) && ids.has(e.target));
  });

  readonly coChangeMatrix = computed(() => {
    const data = this._analysisData();
    return data
      ? buildCoChangeMatrix(data.nodes, data.edges)
      : { packages: [], cells: [], maxWeight: 0 };
  });

  async selectProjectFolder(): Promise<void> {
    try {
      this._error.set(null);
      const path = await this.analysisService.openFolderPicker();
      if (path) this._selectedPath.set(path);
    } catch (err: any) {
      this._error.set(err.message || 'Falha ao selecionar pasta');
    }
  }

  async runAnalysis(): Promise<void> {
    const currentPath = this._selectedPath();
    if (!currentPath) {
      this._error.set('Nenhum projeto selecionado');
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);
    this._selectedNode.set(null);

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const result = await this.analysisService.analyzeProject(currentPath);
      this._analysisData.set(result);
    } catch (err: any) {
      this._error.set(err.message || 'Falha na análise');
    } finally {
      this._isLoading.set(false);
    }
  }

  selectNode(node: NodeInfo | null): void {
    this._selectedNode.set(node);
    // Seleção de classe e foco de co-mudança são ênfases mutuamente exclusivas.
    this._coChangeFocus.set(null);
  }

  toggleCategory(cat: RelationCategory): void {
    const current = new Set(this._activeCategories());
    if (current.has(cat)) {
      current.delete(cat);
    } else {
      current.add(cat);
    }
    this._activeCategories.set(current);
  }

  ensureCategory(cat: RelationCategory): void {
    if (this._activeCategories().has(cat)) return;
    const current = new Set(this._activeCategories());
    current.add(cat);
    this._activeCategories.set(current);
  }

  setPackageFilter(pkg: string | null): void {
    this._packageFilter.set(pkg ? new Set([pkg]) : new Set());
  }

  setPackageFilters(pkgs: readonly string[]): void {
    this._packageFilter.set(new Set(pkgs));
  }

  setCoChangeFocus(focus: CoChangeFocus | null): void {
    this._coChangeFocus.set(focus);
    if (focus) this._selectedNode.set(null);
  }

  setMinCboFilter(value: number): void {
    this._minCboFilter.set(value);
  }

  readonly hasActiveFilters = computed(() => {
    if (this._packageFilter().size > 0) return true;
    if (this._minCboFilter() > 0) return true;
    if (this._activeCategories().size < 3) return true;
    if (this._coChangeFocus() !== null) return true;
    return false;
  });

  clearFilters(): void {
    this._packageFilter.set(new Set());
    this._minCboFilter.set(0);
    this._activeCategories.set(new Set(['STRUCTURAL', 'BEHAVIORAL', 'LOGICAL']));
    this._coChangeFocus.set(null);
  }

  reset(): void {
    this._analysisData.set(null);
    this._selectedPath.set(null);
    this._selectedNode.set(null);
    this._error.set(null);
    this._packageFilter.set(new Set());
    this._minCboFilter.set(0);
    this._coChangeFocus.set(null);
  }
}
