const Budget = (() => {
    const DEFAULT_WORD_BUDGET = 4000;

    function countWords(text) {
        return text ? text.trim().split(/\s+/).length : 0;
    }

    function trimItems(items, remainingBudget) {
        const result = [];
        const sorted = [...items].sort((a, b) => b.score - a.score);

        for (const item of sorted) {
            if (remainingBudget <= 0) break;
            if (!item.text || item.text === '[deleted]' || item.text === '[removed]') continue;

            const wordCount = countWords(item.text);
            if (wordCount > remainingBudget) continue;

            remainingBudget -= wordCount;

            const trimmedItem = { ...item, children: [] };

            if (item.children && item.children.length > 0 && remainingBudget > 0) {
                trimmedItem.children = trimItems(item.children, remainingBudget);
                remainingBudget -= trimmedItem.children.reduce((sum, c) => sum + countWords(c.text), 0);
            }

            result.push(trimmedItem);
        }

        return result;
    }

    function trim(doc, wordBudget = DEFAULT_WORD_BUDGET) {
        let remaining = wordBudget;
        remaining -= countWords(doc.title);
        remaining -= countWords(doc.body);

        return {
            ...doc,
            items: trimItems(doc.items, remaining)
        };
    }

    return { trim, DEFAULT_WORD_BUDGET };
})();
