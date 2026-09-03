# iOS snapshot benchmark evidence

The raw `pnpm bench:ios-snapshot` results measured at commit
`71fb2483f30d90e615e949601c836aeebbf450c5` on `bench-golden-v2` (iPhone 17 Pro, iOS 27.0) live on
the orphan branch `evidence/ios-snapshot`, not in this tree. The branch tip is mutable; the durable
ref is the annotated tag `evidence/ios-snapshot/71fb2483f`, pinned to commit
`2d4baf461aa8897d49c6d4683cd16d8f43588ae8` — fetch and read from the tag and that full SHA, never
from the branch tip. Only Markdown summaries are kept here. The published hashes are declared in
[`../evidence.ts`](../evidence.ts) as `PUBLISHED_EVIDENCE`:

| File | sha256 |
| --- | --- |
| `ios-snapshot-cold-local-71fb2483f.json` | `532a83247bfbf8ee47039f80ac429f067c84679e92c781768c1044da1ae6e9bf` |
| `ios-snapshot-warm-relaunch-local-71fb2483f.json` | `6d299e8baec69662dca2c1ad8f1348e4361d5afaa781080e9a6b9b3dac362cbf` |
| `ios-snapshot-proxy-71fb2483f.json` | `b11b7a07be9e4dcf003f3af66943682a6733c6f21f5f43d3d9e88b3fb37b51a7` |

## Fetch

One file, from the repository root:

```sh
git fetch origin refs/tags/evidence/ios-snapshot/71fb2483f && git show 2d4baf461aa8897d49c6d4683cd16d8f43588ae8:<file> > scripts/ios-snapshot-benchmark/evidence/<file>
```

The whole corpus, then a schema and hash check:

```sh
git fetch origin refs/tags/evidence/ios-snapshot/71fb2483f
for f in ios-snapshot-cold-local-71fb2483f.json \
         ios-snapshot-warm-relaunch-local-71fb2483f.json \
         ios-snapshot-proxy-71fb2483f.json; do
  git show 2d4baf461aa8897d49c6d4683cd16d8f43588ae8:$f > scripts/ios-snapshot-benchmark/evidence/$f
done
pnpm bench:ios-snapshot:evidence
```

`pnpm bench:ios-snapshot:evidence -- --evidence-dir <dir>` checks another directory, for example
a fresh `--out` location. The fetched JSON files are ignored by git under this directory.
