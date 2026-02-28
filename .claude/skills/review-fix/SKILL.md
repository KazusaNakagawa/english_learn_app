---
name: review-fix
description: Review PR feedback, fix issues, and push changes
argument-hint: "<pr-number>"
allowed-tools: Bash(git:*), Bash(gh:*)
---

# Review and Fix PR

Review PR feedback from reviewers or bots, apply fixes, and push updates.

## Usage

```bash
/review-fix 72   # Review and fix PR #72
```

## Workflow

1. **Get PR details and comments**
   ```bash
   gh pr view $ARGUMENTS --comments
   ```

2. **Check for review comments on specific files**
   ```bash
   gh pr view $ARGUMENTS --json reviews,comments
   gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments
   ```

3. **Analyze feedback**
   - Read all review comments
   - Identify actionable items
   - Prioritize by severity (blocking vs suggestions)

4. **Apply fixes**
   - Make the necessary code changes
   - Address each comment systematically

5. **Commit and push**
   ```bash
   git add <changed-files>
   git commit -m "fix: Address PR review feedback"
   git push
   ```

6. **Verify PR status**
   ```bash
   gh pr view $ARGUMENTS
   gh pr checks $ARGUMENTS
   ```

## Common Review Feedback Types

| Type | Action |
|------|--------|
| Code style | Fix formatting, add language specifiers to code blocks |
| Logic issues | Review and fix the implementation |
| Missing tests | Add or update test cases |
| Documentation | Update comments or README |
| Security | Address vulnerabilities immediately |

## Prerequisites

- GitHub CLI (`gh`) is installed and authenticated
- You are on the PR branch
- Have write access to the repository

## Notes

- Always read the full context of review comments
- If unsure about a comment, ask the user for clarification
- Run tests after making changes if applicable
- Respond to reviewers if needed using `gh pr comment`
