const Clipboard = (() => {
    async function copy(text) {
        await navigator.clipboard.writeText(text);
    }

    return { copy };
})();
