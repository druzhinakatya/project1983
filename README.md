# Sitaratas

An Estonian exact-bidding trick-taking game for 3–6 players. Before every round you predict how many tricks you will take. Hit your bid exactly for tricks + 5 points. The lowest total at the end becomes the Sitaratas.

## Ways to play

- **New game**: everyone plays on one device, or you play against bots.
- **Play online**: one person hosts, friends join from their own devices with an invite link. No accounts needed.

## How online play works

- The host's browser runs the game. Friends' browsers connect straight to it ([PeerJS](https://peerjs.com/)); the free public PeerJS server only introduces the browsers to each other.
- Each friend only receives their own cards.
- If a friend drops, the game pauses until they reopen the invite link, or until the host replaces them with a bot.
- If the host drops, everyone waits. The host reopens the site, goes to **Play online** and clicks **Resume your room**.
- Some mobile or workplace networks block direct browser connections. If a friend can't connect, try another network.

## Publishing on GitHub Pages

1. Sign in at [github.com](https://github.com) and click **New repository** (the **+** menu, top right).
2. Name it, for example `sitaratas`, choose **Public**, and click **Create repository**.
3. On the new repository's page, click **uploading an existing file**.
4. Drag in `index.html` and `README.md`, then click **Commit changes**.
5. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, pick the **main** branch and the **/ (root)** folder, and click **Save**.
6. Wait a minute and reload the Pages settings page. Your link appears at the top, for example `https://your-name.github.io/sitaratas/`.

To update the game later, open `index.html` in the repository, click the pencil or **Add file → Upload files**, upload the new version and commit. Pages refreshes within a minute or two.
