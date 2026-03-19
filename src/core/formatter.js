const Formatter = (() => {
    function formatItem(item) {
        const indent = '  '.repeat(item.depth);
        const prefix = item.depth > 0 ? '> ' : '';
        let text = `${indent}${prefix}${item.score} ${item.author}: ${item.text}`;

        if (item.children && item.children.length > 0) {
            text += '\n' + item.children.map(formatItem).join('\n');
        }

        return text;
    }

    function format(doc) {
        let output = '';

        if (doc.title) output += `Thread: ${doc.title}\n`;
        if (doc.body)  output += `Post: ${doc.body}\n`;

        if (doc.items && doc.items.length > 0) {
            output += '---\n';
            output += doc.items.map(item => formatItem(item) + '\n---').join('\n');
        }

        return output.trim();
    }

    return { format };
})();
