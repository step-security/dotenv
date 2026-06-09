[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# StepSecurity Dotenv Loader

GitHub Action that reads a `.env` file from the workspace and exports every `KEY=VALUE` pair into `$GITHUB_ENV` so subsequent steps can consume the variables. Variable expansion (`${OTHER_KEY}` references) is supported via `dotenv-expand`.

Useful for workflows that share configuration across multiple steps, environment-specific deploys (`.env.production`, `.env.staging`), or for pulling non-secret defaults out of repeated `env:` blocks.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `path` | no | `./` | Directory containing the `.env` file. |
| `mode` | no | — | If set, load `.env.<mode>` instead of plain `.env` (e.g. `development`, `production`). |
| `load-mode` | no | `strict` | `strict` = fail if the file is missing. `skip` = log a warning and continue with no exports. |

## Example usage

```yaml
name: Deploy

on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Load .env
        uses: step-security/dotenv@v2
        with:
          path: ./config
          mode: production
          load-mode: strict

      - name: Use the variables
        run: |
          echo "API endpoint is $API_URL"
          echo "Region is $AWS_REGION"
```

If you have an `.env` like:

```
API_URL=https://api.example.com
AWS_REGION=us-east-1
GREETING=Hello from ${AWS_REGION}
```

then after the action runs, `$GREETING` expands to `Hello from us-east-1`.

## License

MIT. See [LICENSE](LICENSE).
