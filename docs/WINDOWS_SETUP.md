# Windows Development Baseline

## 1. Supported development environment

Target:
- Windows 11
- PowerShell 7 preferred
- Node.js current LTS
- npm or pnpm
- Git for Windows
- recent Chrome and Edge

Do not make WSL mandatory.

## 2. Path discipline

Code/scripts must tolerate:
- Windows path separators;
- spaces in user paths;
- PowerShell shell semantics.

Prefer Node APIs and cross-platform npm scripts over Bash-only scripts.

## 3. Local HTTPS

Camera/microphone APIs generally require a secure context except localhost behavior.

For local development:
- use `localhost`;
- avoid inventing a custom TLS requirement unless necessary.

## 4. Browser permissions

Test:
- allow once
- denied
- revoked
- device absent
- multiple cameras/mics if available

## 5. PowerShell bootstrap

Use `scripts/bootstrap.ps1` as a starting automation concept.

## 6. Git policy

Allowed:
- `git init`
- `git status`
- local branches
- local commits
- tags if useful
- local reset/revert where safe

Forbidden:
- `git remote add`
- `git push`
- GitHub CLI auth
- GitHub repository creation
- PR creation
- any network publication of source

At phase boundaries, Supervisor makes a local commit.

Suggested commit style:
- `chore: bootstrap gesture guitar web app`
- `feat: add hand landmark vision pipeline`
- `feat: add chord and strum event engines`
- `feat: add procedural guitar synthesis`
- `feat: add recording and export`
- `feat: add guided song mode`
- `test: complete mvp acceptance suite`
