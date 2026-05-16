export interface MetricDefinition {
  readonly code: string;
  readonly name: string;
  readonly originalName: string;
  readonly description: string;
}

export const METRIC_DEFINITIONS = {
  cbo: {
    code: 'CBO',
    name: 'Acoplamento entre Classes',
    originalName: 'Coupling Between Objects',
    description:
      'Número de outras classes referenciadas pela classe analisada (em ambas as direções). Valores maiores indicam maior dependência e dificultam a manutenção.',
  },
  lcom: {
    code: 'LCOM-HS',
    name: 'Falta de Coesão entre Métodos',
    originalName: 'Lack of Cohesion in Methods (Henderson-Sellers)',
    description:
      'Mede, em escala de 0 a 1, o quanto os métodos da classe deixam de compartilhar atributos. 0 indica alta coesão; 1 indica que os métodos são quase independentes entre si.',
  },
  dit: {
    code: 'DIT',
    name: 'Profundidade na Árvore de Herança',
    originalName: 'Depth of Inheritance Tree',
    description:
      'Distância (em níveis) desta classe até a raiz da hierarquia de herança. Profundidade maior favorece reuso, mas aumenta complexidade.',
  },
  noc: {
    code: 'NOC',
    name: 'Subclasses Diretas',
    originalName: 'Number of Children',
    description:
      'Quantidade de classes que herdam diretamente desta. Valores altos sugerem alta influência da classe sobre o sistema.',
  },
  rfc: {
    code: 'RFC',
    name: 'Resposta da Classe',
    originalName: 'Response for a Class',
    description:
      'Métodos próprios somados aos métodos externos que podem ser invocados em resposta a uma mensagem. Indica o esforço de teste e a complexidade de chamadas.',
  },
  loc: {
    code: 'LOC',
    name: 'Linhas de Código',
    originalName: 'Lines of Code',
    description:
      'Linhas físicas dentro da declaração da classe, incluindo comentários e linhas em branco.',
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;
