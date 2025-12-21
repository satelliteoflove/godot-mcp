import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

class TestRegistry {
  private tools: Map<string, { name: string; description: string; schema: z.ZodType }> =
    new Map();
  private resources: Map<string, { uri: string; name: string; description: string }> =
    new Map();

  registerTool(tool: { name: string; description: string; schema: z.ZodType }): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  registerResource(resource: { uri: string; name: string; description: string }): void {
    if (this.resources.has(resource.uri)) {
      throw new Error(`Resource '${resource.uri}' already registered`);
    }
    this.resources.set(resource.uri, resource);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  hasResource(uri: string): boolean {
    return this.resources.has(uri);
  }

  getToolList(): Array<{ name: string; description: string }> {
    return Array.from(this.tools.values()).map(({ name, description }) => ({
      name,
      description,
    }));
  }

  getResourceList(): Array<{ uri: string; name: string; description: string }> {
    return Array.from(this.resources.values());
  }
}

describe('ToolRegistry', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  describe('registerTool', () => {
    it('registers a tool successfully', () => {
      const tool = {
        name: 'test_tool',
        description: 'A test tool',
        schema: z.object({ input: z.string() }),
      };

      registry.registerTool(tool);

      expect(registry.hasTool('test_tool')).toBe(true);
    });

    it('throws error for duplicate tool registration', () => {
      const tool = {
        name: 'duplicate_tool',
        description: 'First registration',
        schema: z.object({}),
      };

      registry.registerTool(tool);

      expect(() => registry.registerTool(tool)).toThrow(
        "Tool 'duplicate_tool' already registered"
      );
    });
  });

  describe('registerResource', () => {
    it('registers a resource successfully', () => {
      const resource = {
        uri: 'godot://test',
        name: 'Test Resource',
        description: 'A test resource',
      };

      registry.registerResource(resource);

      expect(registry.hasResource('godot://test')).toBe(true);
    });

    it('throws error for duplicate resource registration', () => {
      const resource = {
        uri: 'godot://duplicate',
        name: 'Duplicate',
        description: 'First registration',
      };

      registry.registerResource(resource);

      expect(() => registry.registerResource(resource)).toThrow(
        "Resource 'godot://duplicate' already registered"
      );
    });
  });

  describe('getToolList', () => {
    it('returns empty array when no tools registered', () => {
      expect(registry.getToolList()).toEqual([]);
    });

    it('returns all registered tools', () => {
      registry.registerTool({
        name: 'tool_a',
        description: 'Tool A',
        schema: z.object({}),
      });
      registry.registerTool({
        name: 'tool_b',
        description: 'Tool B',
        schema: z.object({}),
      });

      const list = registry.getToolList();

      expect(list).toHaveLength(2);
      expect(list).toContainEqual({ name: 'tool_a', description: 'Tool A' });
      expect(list).toContainEqual({ name: 'tool_b', description: 'Tool B' });
    });
  });

  describe('getResourceList', () => {
    it('returns empty array when no resources registered', () => {
      expect(registry.getResourceList()).toEqual([]);
    });

    it('returns all registered resources', () => {
      registry.registerResource({
        uri: 'godot://scene',
        name: 'Scene',
        description: 'Current scene',
      });

      const list = registry.getResourceList();

      expect(list).toHaveLength(1);
      expect(list[0].uri).toBe('godot://scene');
    });
  });
});
