# Stargazer

GitHub star count badges. Single file Cloudflare Worker.

## Deploy

```bash
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

## Badge

```
https://your-worker.workers.dev/badge/USERNAME
https://your-worker.workers.dev/badge/USERNAME?color=blue
```

**Colors:** gold, blue, green, red, purple, orange, cyan, pink

## API

```
GET /badge/:username         - SVG badge
GET /api/:username/stars     - JSON { username, total_stars, public_repos }
GET /                        - Web UI
```

## License

WTFPL
