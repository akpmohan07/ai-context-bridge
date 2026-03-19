// ContentDocument — the common schema all ContentSources produce
//
// title      {string}   main heading or thread title
// body       {string}   main content / original post text
// sourceUrl  {string}   URL of the source page
// platform   {string}   platform identifier e.g. "reddit", "hackernews"
// items      {Item[]}   ordered sub-content (comments, replies, etc.)
//                       empty array for plain articles with no discussion
//
// Item:
//   author   {string}
//   score    {number}   upvotes, likes, or 0 if not applicable
//   text     {string}
//   depth    {number}   nesting level — 0 = top-level
//   children {Item[]}   nested replies

function createContentDocument({ title = '', body = '', sourceUrl = '', platform = '', items = [] } = {}) {
    return { title, body, sourceUrl, platform, items };
}

function createItem({ author = '', score = 0, text = '', depth = 0, children = [] } = {}) {
    return { author, score, text, depth, children };
}
