import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiPlatform } from '../src/ai-platforms/gemini.js';
import { ClaudePlatform } from '../src/ai-platforms/claude.js';

describe('GeminiPlatform.openWithContext', () => {
  let open, set;
  beforeEach(() => {
    open = vi.spyOn(window, 'open').mockImplementation(() => {});
    set = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue(undefined);
  });
  afterEach(() => { open.mockRestore(); set.mockRestore(); });

  it('stashes the full text in storage and opens a bare /app tab — nothing in the URL', async () => {
    const big = 'x'.repeat(50_000); // would 400 as a ?prompt= URL
    await new GeminiPlatform().openWithContext(big);
    expect(set).toHaveBeenCalledWith({ pendingGeminiPrompt: big });
    expect(open).toHaveBeenCalledWith('https://gemini.google.com/app', '_blank');
    expect(open.mock.calls[0][0]).not.toContain('prompt=');
  });
});

describe('GeminiPlatform.injectUI', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.execCommand; // jsdom has none; tests assign their own
    document.body.innerHTML = '';
  });

  it('does nothing when no handoff is pending', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({});
    const remove = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    await new GeminiPlatform().injectUI();
    expect(remove).not.toHaveBeenCalled();
  });

  it('consumes the pending key once, before touching the DOM', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({ pendingGeminiPrompt: 'hello' });
    const remove = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    vi.useFakeTimers();
    await new GeminiPlatform().injectUI();
    expect(remove).toHaveBeenCalledWith('pendingGeminiPrompt');
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('inserts the pending text into the Quill composer and clicks send', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({ pendingGeminiPrompt: 'BIG CONTEXT' });
    vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    document.body.innerHTML =
      '<div class="ql-editor" contenteditable="true"></div>' +
      '<div class="send-button-container"><button></button></div>';
    const editor = document.querySelector('.ql-editor');
    const sendBtn = document.querySelector('.send-button-container button');
    const clickSpy = vi.spyOn(sendBtn, 'click');
    // jsdom implements no execCommand — emulate the insert so the poll loop
    // sees a filled composer and proceeds to send.
    document.execCommand = vi.fn((cmd, _ui, val) => {
      if (cmd === 'insertText') editor.textContent += val;
      return true;
    });
    vi.useFakeTimers();

    await new GeminiPlatform().injectUI();
    await vi.advanceTimersByTimeAsync(250); // one poll tick

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'BIG CONTEXT');
    expect(editor.textContent).toBe('BIG CONTEXT');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('stops polling after the ~8s budget if the composer never appears', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({ pendingGeminiPrompt: 'x' });
    vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    document.execCommand = vi.fn(() => true);
    vi.useFakeTimers();

    await new GeminiPlatform().injectUI();
    await vi.advanceTimersByTimeAsync(9000); // past 40 * 200ms

    // Composer shows up late — the poller has already given up, so nothing fires.
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.execCommand).not.toHaveBeenCalled();

    vi.useRealTimers();
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
