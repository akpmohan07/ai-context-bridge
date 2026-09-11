# 5. One composer-injection path across three incompatible editors

**Source:** [`src/ai-platforms/base.js`](../../src/ai-platforms/base.js)
(`_typeInto`, `_fillComposerAndSend`)

---

## Context

After a handoff lands, the destination tab has to put text into the composer and
press send. The three composers aren't the same kind of element:

| Platform | Composer |
|---|---|
| Claude | `contenteditable` `<div>` |
| Gemini | Quill editor (`.ql-editor[contenteditable]`) — its own input model |
| ChatGPT (logged out) | React-controlled `<textarea>` |

Setting `textarea.value = text` directly does nothing useful on the ChatGPT one:
React keeps its own internal copy of the value via a property setter it
installed on the element, and the next render silently overwrites the DOM back
to what React thinks it should be.

## The fix

Branch on element type, and for the React case go around React's own setter
rather than through it:

```js
static _typeInto(el, text) {
  el.focus();
  if (el.tagName === 'TEXTAREA') {
    // Call the *native* setter (from HTMLTextAreaElement.prototype), bypassing
    // whatever setter React installed on the instance — then fire the event
    // React's change-tracking actually listens for.
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el), 'value'
    )?.set;
    setter ? setter.call(el, text) : (el.value = text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // contenteditable — place a collapsed range at the start, then insertText.
  const range = document.createRange();
  range.setStart(el, 0);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand('insertText', false, text);

  if (!el.textContent.trim()) {
    // execCommand no-ops without document focus — clipboard paste fallback.
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }
}
```

This runs inside a poll, not a one-shot call, because SPA composers mount
asynchronously and a backgrounded tab throttles timers:

```js
_fillComposerAndSend(text) {
  let attempts = 0, inserted = false;
  const interval = setInterval(() => {
    attempts++;
    const composer = document.querySelector(this.composerSelector);
    if (composer && !inserted && !AIPlatform._composerValue(composer)) {
      AIPlatform._typeInto(composer, text);
      inserted = !!AIPlatform._composerValue(composer);
    }
    const sendButton = document.querySelector(this.sendButtonSelector);
    if (inserted && sendButton && !sendButton.disabled) {
      sendButton.click();
      clearInterval(interval);
    } else if (attempts > 75) {  // ~15s
      clearInterval(interval);  // give up quietly, log why
    }
  }, 200);
}
```

## Result

One function drives all three editors — no per-platform send logic anywhere
else in the codebase. The trade-off is coupling: the native-setter trick relies
on React's specific controlled-input implementation continuing to check the same
event, and the `ClipboardEvent('paste')` fallback needs the document actually
focused — which is why the E2E helper (`handoffTo()`) calls `page.bringToFront()`
before navigating.

## Note

A real "message stuck in the composer" report turned out to have two independent
causes stacked together: the shared-storage race from decision 1 (the wrong
payload was being read), *and* this poll originally giving up after ~6s — too
short for Claude's "use caution" interstitial plus a slow SPA hydrate. Fixing
either alone would have looked like it worked in casual testing and still failed
under load. Both were needed: the nonce for correctness, the extended ~15s poll
with a focus requirement for reliability.
