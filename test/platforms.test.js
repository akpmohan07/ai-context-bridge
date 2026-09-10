import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClaudePlatform } from '../src/ai-platforms/claude.js';
import { GeminiPlatform } from '../src/ai-platforms/gemini.js';
import { ChatGPTPlatform } from '../src/ai-platforms/chatgpt.js';

// Gemini stands in for the shared AIPlatform base (no URL override of its own).
const p = () => new GeminiPlatform();

afterEach(() => {
  vi.restoreAllMocks();
  delete document.execCommand;
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('AIPlatform.openWithContext (via Gemini)', () => {
  it('opens the tab (bare URL + #acb=<id>) BEFORE writing storage', async () => {
    const order = [];
    const open = vi.spyOn(window, 'open').mockImplementation(() => order.push('open'));
    const set = vi.spyOn(chrome.storage.local, 'set').mockImplementation((o) => {
      order.push(['set', o]);
      return Promise.resolve();
    });

    const big = 'x'.repeat(50_000); // would 414 as a ?q= URL
    await p().openWithContext(big);

    expect(order[0]).toBe('open');
    const url = open.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/gemini\.google\.com\/app#acb=[\w-]+$/);
    expect(url).not.toMatch(/[?&](q|prompt)=/);

    const id = url.split('#acb=')[1];
    expect(order[1][1]).toEqual({ [`handoff:${id}`]: { text: big, ts: expect.any(Number) } });
  });
});

describe('AIPlatform.receiveHandoff', () => {
  it('does nothing when the URL has no #acb= id', async () => {
    const get = vi.spyOn(chrome.storage.local, 'get');
    await p().receiveHandoff();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads only its own id and consumes it', async () => {
    window.location.hash = '#acb=abc-123';
    vi.spyOn(chrome.storage.local, 'get').mockImplementation((k) =>
      Promise.resolve(k === 'handoff:abc-123' ? { 'handoff:abc-123': { text: 'mine', ts: Date.now() } } : {})
    );
    const remove = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    document.execCommand = vi.fn(() => true);

    vi.useFakeTimers();
    await p().receiveHandoff();
    expect(remove).toHaveBeenCalledWith('handoff:abc-123');
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});

describe('AIPlatform._takeHandoff', () => {
  it('returns the text and removes the key', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
      'handoff:x': { text: 'hello', ts: Date.now() },
    });
    const remove = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    expect(await p()._takeHandoff('handoff:x')).toBe('hello');
    expect(remove).toHaveBeenCalledWith('handoff:x');
  });

  it('drops a payload older than the TTL (tab closed mid-handoff)', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
      'handoff:x': { text: 'stale', ts: Date.now() - 5 * 60_000 },
    });
    vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    expect(await p()._takeHandoff('handoff:x')).toBeNull();
  });

  it('polls, then gives up when nothing is written', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({});
    const remove = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    vi.useFakeTimers();
    const done = p()._takeHandoff('handoff:x');
    await vi.advanceTimersByTimeAsync(15 * 200 + 100);
    expect(await done).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('picks up a key written just after the tab opens', async () => {
    let stored = {};
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(() => Promise.resolve(stored));
    vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue(undefined);
    vi.useFakeTimers();
    const done = p()._takeHandoff('handoff:x');
    await vi.advanceTimersByTimeAsync(500);
    stored = { 'handoff:x': { text: 'late', ts: Date.now() } };
    await vi.advanceTimersByTimeAsync(400);
    expect(await done).toBe('late');
    vi.useRealTimers();
  });
});

describe('AIPlatform._fillComposerAndSend', () => {
  it('types into a contenteditable composer and clicks send', async () => {
    document.body.innerHTML =
      '<div class="ql-editor" contenteditable="true"></div>' +
      '<div class="send-button-container"><button></button></div>';
    const composer = document.querySelector('.ql-editor');
    const send = document.querySelector('.send-button-container button');
    const clickSpy = vi.spyOn(send, 'click');
    document.execCommand = vi.fn((cmd, _ui, val) => {
      if (cmd === 'insertText') composer.textContent += val;
      return true;
    });
    vi.useFakeTimers();

    p()._fillComposerAndSend('BIG CONTEXT');
    await vi.advanceTimersByTimeAsync(250);

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'BIG CONTEXT');
    expect(composer.textContent).toBe('BIG CONTEXT');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('sets .value + fires input for a <textarea> composer (ChatGPT logged-out)', async () => {
    document.body.innerHTML =
      '<textarea id="prompt-textarea"></textarea>' + '<button aria-label="Send message"></button>';
    const composer = document.querySelector('#prompt-textarea');
    const send = document.querySelector('button');
    const clickSpy = vi.spyOn(send, 'click');
    const inputEvents = [];
    composer.addEventListener('input', () => inputEvents.push(composer.value));
    vi.useFakeTimers();

    new ChatGPTPlatform()._fillComposerAndSend('pasted context');
    await vi.advanceTimersByTimeAsync(250);

    expect(composer.value).toBe('pasted context');
    expect(inputEvents).toContain('pasted context');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('gives up if the composer never appears', async () => {
    document.execCommand = vi.fn(() => true);
    vi.useFakeTimers();
    p()._fillComposerAndSend('x');
    await vi.advanceTimersByTimeAsync(16_000);
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';
    await vi.advanceTimersByTimeAsync(2_000);
    expect(document.execCommand).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('ClaudePlatform.newChatUrl — ?model= only', () => {
  it('bare /new when the preference is "none"', async () => {
    vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({ preferredClaudeModel: 'none' });
    expect(await new ClaudePlatform().newChatUrl()).toBe('https://claude.ai/new');
  });

  it('appends ?model= for a specific model', async () => {
    vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({ preferredClaudeModel: 'claude-opus-4-8' });
    expect(await new ClaudePlatform().newChatUrl()).toBe('https://claude.ai/new?model=claude-opus-4-8');
  });

  it('openWithContext opens .../new?model=…#acb=<id>, text only in storage', async () => {
    vi.spyOn(chrome.storage.sync, 'get').mockResolvedValue({ preferredClaudeModel: 'none' });
    vi.spyOn(chrome.storage.local, 'set').mockResolvedValue(undefined);
    const open = vi.spyOn(window, 'open').mockImplementation(() => {});
    await new ClaudePlatform().openWithContext('a Reddit thread, 4000 words…');
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/claude\.ai\/new#acb=[\w-]+$/);
  });
});

describe('platform config', () => {
  it('every platform declares its composer + send selectors', () => {
    for (const x of [new ClaudePlatform(), new GeminiPlatform(), new ChatGPTPlatform()]) {
      expect(x.composerSelector).toBeTruthy();
      expect(x.sendButtonSelector).toBeTruthy();
    }
  });
});
