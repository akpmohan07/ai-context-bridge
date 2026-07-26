import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiPlatform } from '../src/ai-platforms/gemini.js';
import { ClaudePlatform } from '../src/ai-platforms/claude.js';

describe('GeminiPlatform.openWithContext', () => {
  let open;
  beforeEach(() => { open = vi.spyOn(window, 'open').mockImplementation(() => {}); });
  afterEach(() => open.mockRestore());

  it('opens the ?prompt= URL with encoded text', () => {
    new GeminiPlatform().openWithContext('a b&c');
    expect(open).toHaveBeenCalledWith('https://gemini.google.com/app?prompt=a%20b%26c', '_blank');
  });
});

describe('ClaudePlatform.openWithContext', () => {
  let open;
  beforeEach(() => { open = vi.spyOn(window, 'open').mockImplementation(() => {}); });
  afterEach(() => { open.mockRestore(); vi.restoreAllMocks(); });

  it('omits &model= for the "none" default', async () => {
    await new ClaudePlatform().openWithContext('hi');
    expect(open).toHaveBeenCalledWith('https://claude.ai/new?q=hi', '_blank');
  });

  it('appends &model= when a specific model is set', async () => {
    vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({ preferredClaudeModel: 'claude-opus-4-8' });
    await new ClaudePlatform().openWithContext('hi');
    expect(open).toHaveBeenCalledWith('https://claude.ai/new?q=hi&model=claude-opus-4-8', '_blank');
  });
});
