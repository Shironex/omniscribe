import { SwarmTemplate } from '@omniscribe/shared';

export const BUILT_IN_TEMPLATES: SwarmTemplate[] = [
  {
    id: 'feature-dev',
    name: 'Feature Development',
    description: '1 Lead + 2 Builders + 1 Reviewer',
    roles: [
      { role: 'lead', count: 1 },
      { role: 'builder', count: 2 },
      { role: 'reviewer', count: 1 },
    ],
    isBuiltIn: true,
  },
  {
    id: 'code-review',
    name: 'Code Review Team',
    description: '1 Lead + 2 Reviewers + 1 Security Auditor',
    roles: [
      { role: 'lead', count: 1 },
      { role: 'reviewer', count: 2 },
      { role: 'security', count: 1 },
    ],
    isBuiltIn: true,
  },
  {
    id: 'refactoring',
    name: 'Refactoring Squad',
    description: '1 Lead + 1 Architect + 2 Builders + 1 Tester',
    roles: [
      { role: 'lead', count: 1 },
      { role: 'architect', count: 1 },
      { role: 'builder', count: 2 },
      { role: 'tester', count: 1 },
    ],
    isBuiltIn: true,
  },
];
