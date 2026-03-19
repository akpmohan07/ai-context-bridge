const Formatter = (() => {
    function formatItem(item, scoreLabel = '') {
        const indent = '  '.repeat(item.depth);
        const prefix = item.depth > 0 ? '> ' : '';
        const score = scoreLabel ? `${scoreLabel}${item.score} ` : '';
        let text = `${indent}${prefix}${score}${item.author}: ${item.text}`;

        if (item.children && item.children.length > 0) {
            text += '\n' + item.children.map(c => formatItem(c, scoreLabel)).join('\n');
        }

        return text;
    }

    // options:
    //   communityLabel {string}  e.g. "Subreddit" — omitted if not provided
    //   scoreLabel     {string}  prefix before score e.g. "↑" — omitted if not provided
    //   itemsLabel     {string}  e.g. "Comments" — defaults to "Comments"
    function format(doc, options = {}) {
        const { communityLabel, scoreLabel = '', itemsLabel = 'Comments' } = options;
        let output = '';

        if (communityLabel && doc.community) output += `${communityLabel}: ${doc.community}\n`;
        if (doc.title)                        output += `Thread: ${doc.title}\n`;
        if (doc.body)                         output += `Post: ${doc.body}\n`;

        if (doc.items && doc.items.length > 0) {
            output += `\n${itemsLabel}:\n---\n`;
            output += doc.items.map(item => formatItem(item, scoreLabel) + '\n---').join('\n');
        }

        return output.trim();
    }

    return { format };
})();
