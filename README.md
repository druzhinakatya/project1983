# Sitaratas

An Estonian exact-bidding trick-taking game for 3–6 players. Before every round you predict how many tricks you will take. Hit your bid exactly for tricks + 5 points. The lowest total at the end becomes the Sitaratas.

## Ways to play

- **Play offline**: everyone plays on one device, or you play against bots.
- **Host a game / Join a game**: one person hosts, friends join from their own devices with a room code or invite link. No accounts needed.

## How online play works

- The host's browser runs the game. Friends' browsers connect straight to it ([PeerJS](https://peerjs.com/)); the free public PeerJS server only introduces the browsers to each other.
- Each friend only receives their own cards.
- If a friend drops, the game pauses until they reopen the invite link, or until the host replaces them with a bot.
- If the host drops for more than 20 seconds, the next player in seat order takes over the game and everyone reconnects to them. When the original host comes back and clicks **Resume**, they rejoin as a player.
- Some mobile or workplace networks block direct browser connections. If a friend can't connect, try another network.

## Files

| File | What it is |
|---|---|
| `index.html` | The page that loads the game |
| `css/style.css` | All styling |
| `js/engine.js` | Game rules (dealing, bidding, legal cards, trick winner, scoring) |
| `js/bot.js` | Computer players |
| `js/text.js` | English and Estonian text |
| `js/ui.js` | Screens and drawing the table |
| `js/online.js` | Hosting, joining, reconnecting and host handover |
| `js/achievements.js`, `js/stats.js`, `js/sound.js` | Achievements, player stats, sound effects |
| `js/app.js` | Screen updates, animations and button handling |
| `test.html` | Automated checks: open it in a browser to run them |

## Publishing on GitHub Pages

1. Sign in at [github.com](https://github.com) and open your repository (or create one with **New repository**, set to **Public**).
2. Click **Add file → Upload files**.
3. Drag in **everything** from this folder: `index.html`, `test.html`, `README.md` and the **`css`** and **`js`** folders. Dragging the folders keeps them as folders.
4. Click **Commit changes**.
5. If Pages isn't on yet: **Settings → Pages**, Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, **Save**.

Your game is at `https://your-name.github.io/your-repository/` and the checks at `…/test.html`.
To update later, upload the changed files again; files with the same name are replaced.
