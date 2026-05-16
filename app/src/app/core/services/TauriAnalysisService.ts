import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AnalysisPort } from './AnalysisPort';
import { AnalysisResult } from '../models/AnalysisResult';

@Injectable({ providedIn: 'root' })
export class TauriAnalysisService implements AnalysisPort {
  private isTauri(): boolean {
    return !!(window as any).__TAURI_INTERNALS__;
  }

  async openFolderPicker(): Promise<string | null> {
    if (!this.isTauri()) {
      throw new Error('A seleção de pastas funciona apenas no Desktop (Tauri).');
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Selecione o diretório do projeto',
    });
    return selected ? (Array.isArray(selected) ? selected[0] : selected) : null;
  }

  async analyzeProject(projectPath: string): Promise<AnalysisResult> {
    if (!this.isTauri()) {
      throw new Error('A análise funciona apenas no Desktop (Tauri).');
    }
    const resultString = await invoke<string>('analyze_project', { projectPath });
    return JSON.parse(resultString) as AnalysisResult;
  }
}
