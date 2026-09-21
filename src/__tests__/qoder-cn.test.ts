import os from 'node:os';
import path from 'node:path';
import fse from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectHomeInstalledAgents, KNOWN_AGENTS } from '../known-agents.js';
import { resolveMcpTargets } from '../mcp-reconcile.js';
import {
  agentFileExtensionForTool,
  ALL_SUPPORTED_TOOLS,
  renderForTool,
} from '../resources/agent-format.js';
import { detectMcpFormat } from '../resources/mcp-format.js';
import { ruleFileExtensionForTool, usesCursorMdcRules } from '../resources/rule-format.js';
import { TeamaiConfigSchema } from '../types.js';
import type { LocalConfig } from '../types.js';

describe('Qoder CN support', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ships Qoder CN resource paths for user and project scopes', () => {
    const config = TeamaiConfigSchema.parse({ team: 'test', repo: 'test/repo' });

    expect(config.toolPaths['qoder-cn']).toEqual({
      skills: '.qoder-cn/skills',
      rules: '.qoder-cn/rules',
      settings: '.qoder-cn/settings.json',
      agents: '.qoder-cn/agents',
      mcp: '.qoder-cn/settings.json',
      mcpProject: '.qoder-cn/settings.json',
    });
  });

  it('keeps the Qoder CN paths distinct from the international Qoder paths', () => {
    const config = TeamaiConfigSchema.parse({ team: 'test', repo: 'test/repo' });
    const cn = config.toolPaths['qoder-cn'] as Record<string, string>;
    const international = config.toolPaths.qoder as Record<string, string>;

    // Qoder CN reads ~/.qoder-cn, so no path may be shared with ~/.qoder.
    for (const [key, value] of Object.entries(cn)) {
      expect(value).not.toEqual(international[key]);
      expect(value.startsWith('.qoder-cn/')).toBe(true);
    }
  });

  it('registers Qoder CN for discovery and native Markdown resources', () => {
    expect(KNOWN_AGENTS.find((agent) => agent.id === 'qoder-cn')).toMatchObject({
      displayName: 'Qoder CN',
      skillsPath: '.qoder-cn/skills',
    });
    expect(ALL_SUPPORTED_TOOLS).toContain('qoder-cn');
    expect(agentFileExtensionForTool('qoder-cn')).toBe('.md');
    expect(ruleFileExtensionForTool('qoder-cn')).toBe('.md');
    expect(usesCursorMdcRules('qoder-cn')).toBe(false);
  });

  it('renders Qoder CN subagents exactly like Qoder', () => {
    const spec = {
      name: 'reviewer',
      description: 'Reviews changes',
      instructions: 'Review the diff.',
    };

    expect(renderForTool(spec, 'qoder-cn')).toEqual(renderForTool(spec, 'qoder'));
  });

  it('uses the mcpServers JSON format in Qoder CN settings', () => {
    expect(detectMcpFormat('qoder-cn')).toBe('claude');
  });

  it('resolves the installed Qoder CN settings file as an MCP target', async () => {
    const home = await fse.mkdtemp(path.join(os.tmpdir(), 'teamai-qoder-cn-test-'));
    try {
      await fse.ensureDir(path.join(home, '.qoder-cn', 'skills'));
      vi.stubEnv('HOME', home);
      const config = TeamaiConfigSchema.parse({ team: 'test', repo: 'test/repo' });
      const localConfig = {
        repo: { localPath: path.join(home, 'team-repo'), remote: 'test/repo' },
        username: 'test',
        scope: 'user',
        additionalRoles: [],
      } as unknown as LocalConfig;

      expect(await resolveMcpTargets(config, localConfig)).toContainEqual({
        tool: 'qoder-cn',
        format: 'claude',
        file: path.join(home, '.qoder-cn', 'settings.json'),
        projectScope: false,
      });
    } finally {
      await fse.remove(home);
    }
  });

  it('detects .qoder-cn and .qoder independently when probing HOME', async () => {
    const home = await fse.mkdtemp(path.join(os.tmpdir(), 'teamai-qoder-cn-probe-'));
    try {
      vi.stubEnv('HOME', home);

      await fse.ensureDir(path.join(home, '.qoder-cn', 'skills'));
      expect(await detectHomeInstalledAgents(['qoder', 'qoder-cn'])).toEqual(['qoder-cn']);

      // The international install must not be reported for the CN directory,
      // and vice versa — the two roots are separate opt-ins.
      await fse.ensureDir(path.join(home, '.qoder', 'skills'));
      expect(await detectHomeInstalledAgents(['qoder', 'qoder-cn'])).toEqual(['qoder', 'qoder-cn']);
    } finally {
      await fse.remove(home);
    }
  });
});
