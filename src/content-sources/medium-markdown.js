// Pure DOM → markdown helpers for Medium article bodies. No network/storage —
// just element in, text out.

// Recursively extracts text from a <pre>, converting <br> to \n so each code
// line is preserved (Medium renders lines as <span>s with <br> separators).
export function extractPreText(node) {
    let text = '';
    for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent;
        } else if (child.nodeName === 'BR') {
            text += '\n';
        } else {
            text += extractPreText(child);
        }
    }
    return text;
}

// Converts a single top-level semantic element to a markdown line (null if empty).
export function toMarkdown(el) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent.trim();
    if (!text) return null;

    switch (tag) {
        case 'h2': return `## ${text}`;
        case 'h3': return `### ${text}`;
        case 'h4': return `#### ${text}`;
        case 'pre': return `\`\`\`\n${extractPreText(el)}\n\`\`\``;
        case 'blockquote':
            return text.split('\n').filter(l => l.trim()).map(l => `> ${l}`).join('\n');
        case 'ul':
            return Array.from(el.querySelectorAll('li'))
                .map(li => `- ${li.textContent.trim()}`)
                .filter(Boolean).join('\n');
        case 'ol':
            return Array.from(el.querySelectorAll('li'))
                .map((li, i) => `${i + 1}. ${li.textContent.trim()}`)
                .filter(Boolean).join('\n');
        default: return text; // p
    }
}

// Converts an <article> to markdown text, top-level semantic blocks only
// (filters out nested matches to avoid duplication).
export function extractBody(article) {
    const selector = 'h2, h3, h4, p, pre, blockquote, ul, ol';
    const topLevel = Array.from(article.querySelectorAll(selector))
        .filter(el => !el.parentElement.closest(selector));
    return topLevel
        .map(el => toMarkdown(el))
        .filter(Boolean)
        .join('\n\n');
}
