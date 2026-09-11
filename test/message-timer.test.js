import { describe, it, expect, afterEach } from 'vitest';
import { MessageTimer } from '../src/time/message-timer.js';

const { pickAdapter, ADAPTERS, claudeConvId, chatgptConvId, geminiConvId } = MessageTimer._test;

describe('pickAdapter — host → adapter', () => {
  it('gemini.google.com selects the Gemini adapter', () => {
    expect(pickAdapter('gemini.google.com')?.host).toBe('gemini.google.com');
  });
  it('claude.ai and chatgpt.com select their own adapters', () => {
    expect(pickAdapter('claude.ai')?.host).toBe('claude.ai');
    expect(pickAdapter('chatgpt.com')?.host).toBe('chatgpt.com');
  });
  it('an unrelated host selects nothing', () => {
    expect(pickAdapter('example.com')).toBeNull();
  });
});

describe('adapter shape', () => {
  it('every adapter carries the three selectors and the store interface', () => {
    for (const a of ADAPTERS) {
      expect(a.sendButtonSelector).toBeTruthy();
      expect(a.chatInputSelector).toBeTruthy();
      expect(a.inputSelector).toBeTruthy();
      expect(typeof a.getLastMessageTime).toBe('function');
      expect(typeof a.recordSend).toBe('function');
      expect(typeof a.onNavigate).toBe('function');
      expect(typeof a.init).toBe('function');
    }
  });

  it('the Gemini adapter targets the Quill editor', () => {
    const g = pickAdapter('gemini.google.com');
    expect(g.inputSelector).toContain('.ql-editor');
    expect(g.chatInputSelector).toContain('.ql-editor');
  });
});

describe('geminiConvId — /app/<hex> in the URL', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('extracts the conversation id from /app/<hex>', () => {
    window.history.pushState({}, '', '/app/043a09a3320776f8');
    expect(geminiConvId()).toBe('043a09a3320776f8');
  });

  it('returns null on a fresh chat (/app with no id)', () => {
    window.history.pushState({}, '', '/app');
    expect(geminiConvId()).toBeNull();
  });

  it('returns null off the /app route', () => {
    window.history.pushState({}, '', '/settings');
    expect(geminiConvId()).toBeNull();
  });

  it('does not confuse Claude/ChatGPT conv-id routes with Gemini', () => {
    window.history.pushState({}, '', '/chat/abc-123');
    expect(claudeConvId()).toBe('abc-123');
    expect(geminiConvId()).toBeNull();
    window.history.pushState({}, '', '/c/xyz-789');
    expect(chatgptConvId()).toBe('xyz-789');
    expect(geminiConvId()).toBeNull();
  });
});

describe('seededTimeStore — new-chat send carry-over', () => {
  const gemini = pickAdapter('gemini.google.com');
  afterEach(() => window.history.pushState({}, '', '/'));

  it('a send with no conv id is filed under the id assigned on navigation', async () => {
    window.history.pushState({}, '', '/app'); // brand-new chat — no id yet
    gemini.recordSend();
    // pending send is usable immediately as the "last message" fallback
    expect(gemini.getLastMessageTime()).toBeInstanceOf(Date);

    const id = 'aa11bb22cc33dd44';
    window.history.pushState({}, '', `/app/${id}`); // Gemini assigns the id
    await gemini.onNavigate();

    // now filed under the real id, and survives navigating away and back
    expect(gemini.getLastMessageTime()).toBeInstanceOf(Date);
    window.history.pushState({}, '', '/app/other0000');
    window.history.pushState({}, '', `/app/${id}`);
    expect(gemini.getLastMessageTime()).toBeInstanceOf(Date);
  });
});
