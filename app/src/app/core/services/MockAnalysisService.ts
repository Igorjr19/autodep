import { Injectable } from '@angular/core';
import { AnalysisPort } from './AnalysisPort';
import { AnalysisResult } from '../models/AnalysisResult';

@Injectable({ providedIn: 'root' })
export class MockAnalysisService implements AnalysisPort {
  async openFolderPicker(): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 300));
    return '/home/user/workspace/mock-project';
  }

  async analyzeProject(projectPath: string): Promise<AnalysisResult> {
    await new Promise((r) => setTimeout(r, 1000));

    return {
      projectName: 'mock-project',
      analyzedAt: new Date().toISOString(),
      summary: {
        totalClasses: 5,
        totalRelationships: 8,
        structuralRelationships: 4,
        behavioralRelationships: 4,
        logicalRelationships: 0,
        cboDistribution: { min: 2, max: 5, mean: 3.4, median: 3, stddev: 1.36 },
        lcomDistribution: { min: 0, max: 0.4, mean: 0.16, median: 0.2, stddev: 0.15 },
        ditDistribution: { min: 0, max: 1, mean: 0.2, median: 0, stddev: 0.4 },
        rfcDistribution: { min: 3, max: 12, mean: 6.6, median: 6, stddev: 3.2 },
        locDistribution: { min: 15, max: 80, mean: 47, median: 50, stddev: 22.5 },
      },
      nodes: [
        {
          id: 'com.mock.app.UserService',
          simpleName: 'UserService',
          packageName: 'com.mock.app',
          filePath: 'src/main/java/com/mock/app/UserService.java',
          type: 'CLASS',
          metrics: {
            cbo: 5,
            lcom: 0.4,
            dit: 0,
            noc: 0,
            rfc: 12,
            numberOfMethods: 5,
            numberOfAttributes: 2,
            linesOfCode: 80,
          },
          isInterface: false,
          isAbstract: false,
        },
        {
          id: 'com.mock.app.UserRepository',
          simpleName: 'UserRepository',
          packageName: 'com.mock.app',
          filePath: 'src/main/java/com/mock/app/UserRepository.java',
          type: 'INTERFACE',
          metrics: {
            cbo: 2,
            lcom: 0.0,
            dit: 0,
            noc: 1,
            rfc: 3,
            numberOfMethods: 3,
            numberOfAttributes: 0,
            linesOfCode: 15,
          },
          isInterface: true,
          isAbstract: false,
        },
        {
          id: 'com.mock.app.UserController',
          simpleName: 'UserController',
          packageName: 'com.mock.app',
          filePath: 'src/main/java/com/mock/app/UserController.java',
          type: 'CLASS',
          metrics: {
            cbo: 3,
            lcom: 0.2,
            dit: 0,
            noc: 0,
            rfc: 8,
            numberOfMethods: 4,
            numberOfAttributes: 1,
            linesOfCode: 60,
          },
          isInterface: false,
          isAbstract: false,
        },
        {
          id: 'com.mock.app.BaseEntity',
          simpleName: 'BaseEntity',
          packageName: 'com.mock.app',
          filePath: 'src/main/java/com/mock/app/BaseEntity.java',
          type: 'CLASS',
          metrics: {
            cbo: 2,
            lcom: 0.0,
            dit: 0,
            noc: 1,
            rfc: 4,
            numberOfMethods: 2,
            numberOfAttributes: 3,
            linesOfCode: 30,
          },
          isInterface: false,
          isAbstract: true,
        },
        {
          id: 'com.mock.app.User',
          simpleName: 'User',
          packageName: 'com.mock.app',
          filePath: 'src/main/java/com/mock/app/User.java',
          type: 'CLASS',
          metrics: {
            cbo: 5,
            lcom: 0.2,
            dit: 1,
            noc: 0,
            rfc: 6,
            numberOfMethods: 4,
            numberOfAttributes: 4,
            linesOfCode: 50,
          },
          isInterface: false,
          isAbstract: false,
        },
      ],
      edges: [
        {
          source: 'com.mock.app.User',
          target: 'com.mock.app.BaseEntity',
          type: 'INHERITANCE',
          category: 'STRUCTURAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserService',
          target: 'com.mock.app.UserRepository',
          type: 'AGGREGATION',
          category: 'STRUCTURAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserService',
          target: 'com.mock.app.User',
          type: 'ASSOCIATION',
          category: 'STRUCTURAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserController',
          target: 'com.mock.app.UserService',
          type: 'COMPOSITION',
          category: 'STRUCTURAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserService',
          target: 'com.mock.app.UserRepository',
          type: 'METHOD_CALL',
          category: 'BEHAVIORAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserController',
          target: 'com.mock.app.UserService',
          type: 'METHOD_CALL',
          category: 'BEHAVIORAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserService',
          target: 'com.mock.app.User',
          type: 'TYPE_REFERENCE',
          category: 'BEHAVIORAL',
          weight: 1.0,
        },
        {
          source: 'com.mock.app.UserController',
          target: 'com.mock.app.User',
          type: 'TYPE_REFERENCE',
          category: 'BEHAVIORAL',
          weight: 1.0,
        },
      ],
    };
  }
}
