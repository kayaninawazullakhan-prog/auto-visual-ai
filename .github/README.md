# GitHub config

## CI pipeline

The GitHub Actions CI pipeline lives in [`ci.workflow.yml`](./ci.workflow.yml)
(install → `prisma generate` → `typecheck` → `build`).

It is stored here rather than under `.github/workflows/` because the token used
for the initial push did not have the `workflow` OAuth scope (GitHub blocks
pushing workflow files without it). **To enable CI**, do either:

- **GitHub web UI:** create `.github/workflows/ci.yml` and paste the contents of
  `ci.workflow.yml`, or
- **Locally:**
  ```bash
  gh auth refresh -h github.com -s workflow
  git mv .github/ci.workflow.yml .github/workflows/ci.yml
  git commit -m "ci: enable GitHub Actions workflow"
  git push
  ```
