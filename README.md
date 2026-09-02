# iOS snapshot benchmark evidence

Orphan branch `evidence/ios-snapshot` of callstack/agent-device. It holds the raw
`pnpm bench:ios-snapshot` results measured at repository commit
`71fb2483f30d90e615e949601c836aeebbf450c5` on `bench-golden-v2` (iPhone 17 Pro, iOS 27.0).
The files are measurement output, not fixtures; the harness, the schema
(`scripts/ios-snapshot-benchmark/raw-result.schema.v1.json`), and the adjacent Markdown
summaries live on `main` under `scripts/ios-snapshot-benchmark/`.

| File | sha256 |
| --- | --- |
| `ios-snapshot-cold-local-71fb2483f.json` | `532a83247bfbf8ee47039f80ac429f067c84679e92c781768c1044da1ae6e9bf` |
| `ios-snapshot-warm-relaunch-local-71fb2483f.json` | `6d299e8baec69662dca2c1ad8f1348e4361d5afaa781080e9a6b9b3dac362cbf` |
| `ios-snapshot-proxy-71fb2483f.json` | `b11b7a07be9e4dcf003f3af66943682a6733c6f21f5f43d3d9e88b3fb37b51a7` |

## Fetch into a checkout

```sh
git fetch origin evidence/ios-snapshot
for f in ios-snapshot-cold-local-71fb2483f.json \
         ios-snapshot-warm-relaunch-local-71fb2483f.json \
         ios-snapshot-proxy-71fb2483f.json; do
  git show FETCH_HEAD:$f > scripts/ios-snapshot-benchmark/evidence/$f
done
shasum -a 256 scripts/ios-snapshot-benchmark/evidence/*.json
pnpm bench:ios-snapshot:evidence
```

## Add a new corpus

Commit new raw results on top of this branch with the message
`evidence(ios-snapshot): benchmark results measured at <commit>` and extend the table
above. Never rewrite history here: `main` cites these hashes.
