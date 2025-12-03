# GitHub Copilot Instructions for run-gemini-cli

## Project Overview

This is a **composite GitHub Action** that wraps the [Gemini CLI](https://github.com/google-gemini/gemini-cli/) to enable AI-powered workflows for PR reviews, issue triage, and general assistance directly in GitHub repositories. It's not an NPM package—the build system is intentionally minimal.

## Architecture & Key Components

### Core Action (`action.yml`)
- **Composite action pattern**: Executes shell steps sequentially, no JavaScript/Docker container
- **Authentication flow**: Validates auth method → installs Gemini CLI → authenticates to Google Cloud (if using WIF) → runs CLI
- **Settings injection**: Writes JSON to `.gemini/settings.json` to configure MCP servers, tool restrictions, and telemetry
- **Custom commands**: Copies `.github/commands/*.toml` files to `.gemini/commands/` during execution

### Command Files (`.github/commands/*.toml`)
- **TOML-based prompts**: Define AI agent behaviors (`gemini-review.toml`, `gemini-triage.toml`, etc.)
- **Security-critical constraints**: Commands explicitly forbid command substitution (`$(...)`, `<(...)`) and scope limitations (e.g., PR reviews can only comment on diff lines)
- **Tool restrictions**: Specify allowed shell commands (e.g., only `cat`, `echo`, `grep`, `head`, `tail`) and MCP server tools

### Workflow Examples (`examples/workflows/`)
- **Auto-generated**: Created by `scripts/generate-examples.sh` from `.github/workflows/` templates
- **Version replacement**: Script transforms `@main` references to `@v0` for public examples
- **Dispatch pattern**: `gemini-dispatch.yml` (required) routes comments like `@gemini-cli /review` to specific workflows

### Settings Pattern
Workflows configure Gemini CLI via the `settings` input (JSON string):
```yaml
settings: |-
  {
    "mcpServers": {
      "github": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server:v0.18.0"],
        "includeTools": ["pull_request_read", "create_pending_pull_request_review", ...],
        "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"}
      }
    },
    "tools": {"core": ["run_shell_command(cat)", "run_shell_command(echo)"]}
  }
```

## Critical Development Workflows

### Updating Action Inputs/Outputs
1. Edit `action.yml` inputs/outputs
2. Run `npm run docs` (uses `@google-github-actions/actions-utils` to regenerate `README.md` sections)
3. Commit both files together

### Updating Workflows
1. Modify `.github/workflows/*.yml` (working versions using `@main`)
2. Optionally edit `.github/commands/*.toml` prompts
3. Run `./scripts/generate-examples.sh` to sync to `examples/workflows/` (transforms `@main` → `@v0`)
4. Never manually edit files in `examples/workflows/`—they're auto-generated

### Authentication Patterns
Three mutually exclusive methods (validated in `action.yml` step):
1. **Gemini API Key**: Simple, no GCP project required
2. **Vertex AI API Key**: Quick GCP setup, requires `use_vertex_ai: true`
3. **Workload Identity Federation (WIF)**: Preferred for production, keyless authentication
   - Script: `scripts/setup_workload_identity.sh --repo OWNER/REPO --project PROJECT_ID`
   - Creates WIF pool/provider, service account, grants IAM roles automatically

## Project-Specific Conventions

### Shell Script Standards
- **Strict mode**: All scripts use `set -euo pipefail`
- **Portable**: Use `/bin/bash` shebang, avoid bashisms where possible
- **Security**: Never use command substitution in generated prompts (documented in TOML files)

### YAML Formatting
- **Consistent quoting**: Single quotes for GitHub expressions (`'${{ vars.DEBUG }}'`)
- **Multiline strings**: Use `|-` for literal block scalars (common in prompts)
- **Version pinning**: Dependencies use SHA-pinned versions with `# ratchet:` comments

### Documentation Patterns
- **Auto-generated sections**: `<!-- BEGIN_AUTOGEN_INPUTS -->` in `README.md` must be updated via `npm run docs`
- **Markdown tables**: Used for variable/secret documentation (see `README.md` and `docs/authentication.md`)
- **Cross-references**: Link to Gemini CLI docs using full URLs (e.g., `https://github.com/google-gemini/gemini-cli/blob/main/docs/...`)

### Telemetry & Observability
- **OpenTelemetry**: Workflows write logs to `.gemini/telemetry.log`, optionally uploaded to GCP Cloud Trace
- **Collector config**: `scripts/collector-gcp.yaml.template` uses sed replacements for project/repo metadata
- **Docker-based**: Runs `otel/opentelemetry-collector-contrib:0.108.0` in background, monitors queue size before shutdown

## Integration Points

### External Dependencies
- **google-github-actions/auth@v2**: Handles WIF authentication (used in `action.yml` step)
- **Gemini CLI**: Installed from npm (`@google/gemini-cli`) or GitHub source (supports `latest`, `preview`, `nightly`, version numbers, or git refs)
- **GitHub MCP Server**: Docker image (`ghcr.io/github/github-mcp-server:v0.18.0`) provides PR/issue read/write tools

### GitHub API Permissions
Workflows require these permissions (see `examples/workflows/*.yml`):
```yaml
permissions:
  contents: 'read'
  id-token: 'write'  # Required for WIF
  issues: 'write'
  pull-requests: 'write'
```

### Environment Variables Pattern
Commands use `!{echo $VAR}` syntax (Gemini CLI interpolation) to inject GitHub context:
```toml
prompt = """
**Pull Request Number**: !{echo $PULL_REQUEST_NUMBER}
**Repository**: !{echo $REPOSITORY}
"""
```

## Common Pitfalls & Edge Cases

1. **Authentication validation**: `action.yml` warns (doesn't fail) on misconfiguration—users must check step summary
2. **MCP server tools**: Must explicitly list allowed tools in `includeTools` array (security requirement)
3. **Line number accuracy**: PR review comments must use exact line numbers from diff (LEFT vs RIGHT side)
4. **Command substitution**: Explicitly forbidden in all TOML prompts to prevent code injection
5. **Settings file timing**: Created before Gemini CLI runs, so can't reference action outputs
6. **Concurrency groups**: Workflows use `${{ github.event.pull_request.number || github.event.issue.number }}` to handle both PR and issue triggers

## Testing Strategy
- No automated tests exist (`"test": "echo \"Error: no test specified\" && exit 1"`)
- Manual validation: Test workflows in real repositories with different auth methods
- Example validation: Verify `generate-examples.sh` output matches expected structure

## Reference Files
- **Action definition**: `action.yml`
- **Command templates**: `.github/commands/*.toml`
- **Auth setup**: `scripts/setup_workload_identity.sh`, `docs/authentication.md`
- **Project context**: `GEMINI.md` (guides contributors on composite action development)
