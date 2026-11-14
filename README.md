# Rocket.Chat Markdown Tables

A userscript that renders [GitHub Flavored Markdown tables](https://github.github.com/gfm/#tables-extension-) in Rocket.Chat messages. Rocket.Chat's own message parser does not support them, so a table you send shows up as rows of pipes and dashes.

```
| Service | Status | Owner |
|:--------|:------:|------:|
| api     | ✅     | @alice |
| worker  | ⚠️     | @bob   |
```

becomes a real table, with column alignment, header row and the usual Rocket.Chat formatting (bold, code, links, mentions, emoji) kept inside the cells.

## Install

1. Install a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Install the script from [Greasy Fork](https://greasyfork.org/en/users/1177905-pke) or directly from [`rocketchat-gfm-tables.user.js`](https://raw.githubusercontent.com/pke/rocketchat-markdown-tables/main/rocketchat-gfm-tables.user.js).

## Which servers it runs on

Out of the box the script runs on Rocket.Chat Cloud (`*.rocket.chat`) and on self-hosted servers whose host name starts with `rocketchat.`, `rocket.`, `chat.` or `rc.`. On every matching page it first checks that the page really is a Rocket.Chat workspace (by its `rc-*` meta tags) and does nothing otherwise.

Server on another domain? Open the script's settings in your userscript manager and add your server under **User matches**, for example `https://team.example.com/*`.

You can switch the script off for a single server from the userscript manager's menu.

## Copying tables

When you select and copy a rendered table, the clipboard gets

- the **Markdown source** as plain text, so pasting into Rocket.Chat, GitHub or an editor gives you the table again, and
- the **rendered table** as HTML, so pasting into Confluence, Google Docs or Word gives you a real table.

Text selected within a single cell is copied as usual.

To put the exact Markdown (including `**bold**` or `[links](…)`) on the clipboard, the script loads the raw text of each message that contains a table from your own Rocket.Chat server's REST API (`/api/v1/chat.getMessage`), using the session you are already signed in with. It sends nothing anywhere else.

## Limitations

- Only works in the browser, not in the Rocket.Chat desktop or mobile apps.
- Only people who have the script installed see the tables; everyone else still sees the pipes.
- Mentions and emoji inside cells are copies of Rocket.Chat's rendering: they look right, but clicking a mention does not open the user card.
- As in GFM, a line with a `|` directly after the table still belongs to it. Leave an empty line to end the table.

## License

[MIT](LICENSE)
