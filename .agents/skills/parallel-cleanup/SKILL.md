---
name: parallel-cleanup
description: Cleanup parallel development environment (worktrees and tmux)
argument-hint: "[session-name]"
allowed-tools: Bash(git:*), Bash(tmux:*)
---

# Parallel Development Cleanup

Clean up the parallel development environment by removing git worktrees and killing tmux sessions.

## Usage

```bash
/parallel-cleanup                  # Clean up default 'parallel-dev' session
/parallel-cleanup my-session       # Clean up specific session name
```

## What This Does

1. **List current worktrees** - Shows all active git worktrees
2. **Confirm cleanup** - Asks user which worktrees to remove
3. **Kill tmux session** - Terminates the specified tmux session
4. **Remove worktrees** - Deletes worktree directories and git metadata
5. **Return to develop** - Checks out develop branch in main repository

## Workflow

### 1. Check Current State

```bash
# List tmux sessions
echo "Active tmux sessions:"
tmux list-sessions

# List git worktrees
echo ""
echo "Active git worktrees:"
git worktree list
```

### 2. Confirm with User

Use AskUserQuestion to confirm:
- Which tmux session to kill (default: `parallel-dev`)
- Which worktrees to remove (show list from `git worktree list`)
- Whether to keep any worktrees for later use
- If any selected worktree has uncommitted changes, whether to discard them

Record the answers before moving on — step 4 acts on these, not on a pattern match:

```bash
# Absolute paths the user explicitly chose, one per line.
SELECTED_WORKTREES="/Users/you/worktree-worker1
/Users/you/worktree-worker2"

# Only set to "yes" if the user confirmed discarding uncommitted work.
FORCE_DISCARD="no"
```

### 3. Kill tmux Session

`$ARGUMENTS` is substituted by the skill runner before the block executes, so it
has to appear bare — inside `${ARGUMENTS:-parallel-dev}` no substitution happens
and the shell sees an undefined variable, silently falling back to
`parallel-dev` while the session the user actually named stays alive.

`session_name` is also read by the summary in step 6, which runs as a separate
block, so persist it to a file rather than relying on shell state carrying over.

```bash
session_name="$ARGUMENTS"
session_name="${session_name:-parallel-dev}"
echo "$session_name" > /tmp/parallel-cleanup-session

if tmux has-session -t "$session_name" 2>/dev/null; then
  tmux kill-session -t "$session_name"
  echo "✓ Killed tmux session: $session_name"
else
  echo "ℹ No tmux session named '$session_name' found"
fi
```

### 4. Remove Git Worktrees

Remove **only** the paths the user confirmed in step 2. Never enumerate worktrees
and delete everything that happens to match a pattern — that risks destroying an
unrelated worktree or uncommitted work.

```bash
: "${SELECTED_WORKTREES:?No worktrees confirmed — re-run step 2 before removing anything}"

repo_root="$(git rev-parse --show-toplevel)"

while IFS= read -r worktree; do
  [ -n "$worktree" ] || continue

  # Never touch the main checkout.
  if [ "$worktree" = "$repo_root" ]; then
    echo "⚠ Skipping $worktree (main repository)"
    continue
  fi

  # Strict allowlist: only the ~/worktree-worker<N> paths parallel-setup creates.
  if [[ ! "$worktree" =~ ^${HOME}/worktree-worker[0-9]+$ ]]; then
    echo "⚠ Skipping $worktree (not a parallel-dev worktree)"
    continue
  fi

  # Must still be a registered worktree of this repository.
  if ! git worktree list --porcelain | grep -qxF "worktree $worktree"; then
    echo "⚠ Skipping $worktree (not a worktree of this repository)"
    continue
  fi

  # Refuse to discard uncommitted work unless the user opted in at step 2.
  if [ -n "$(git -C "$worktree" status --porcelain)" ]; then
    if [ "${FORCE_DISCARD:-no}" != "yes" ]; then
      echo "✗ $worktree has uncommitted changes — skipped."
      echo "  Commit or stash them, then re-run."
      continue
    fi
    echo "⚠ Discarding uncommitted changes in $worktree (confirmed by user)"
    git worktree remove --force "$worktree"
  else
    git worktree remove "$worktree"
  fi
  echo "✓ Removed $worktree"
done <<< "$SELECTED_WORKTREES"

# Prune stale worktree metadata
git worktree prune
echo "✓ Pruned stale worktree metadata"
```

### 5. Return to Develop

`git checkout develop` fails when the main repository has uncommitted changes, or
when `develop` is still checked out in a worktree that was kept. Branch on the
result instead of announcing success unconditionally.

```bash
if git checkout develop; then
  echo "✓ Switched to develop branch"
else
  echo "✗ Could not switch to develop — staying on $(git branch --show-current)" >&2
  echo "  Commit or stash your changes, or check whether develop is still" >&2
  echo "  checked out in a worktree you chose to keep." >&2
fi

# Show clean state
echo ""
echo "Remaining worktrees:"
git worktree list
```

### 6. Summary

```bash
# Step 3 runs in a separate block, so recover the name it recorded.
session_name="$(cat /tmp/parallel-cleanup-session 2>/dev/null || echo parallel-dev)"

echo ""
echo "Cleanup complete!"
echo "  - Killed tmux session: $session_name"
echo "  - Removed the confirmed worktrees (see step 4 output for skips)"
echo "  - Current branch: $(git branch --show-current)"
echo ""
echo "You can now:"
echo "  - Run /parallel-setup to start new parallel development"
echo "  - Continue working on develop branch normally"
```

## Safety Features

### Selective Removal

Removal is driven by `SELECTED_WORKTREES` — the explicit list the user confirmed
in step 2 — not by scanning `git worktree list`. Each entry then has to clear
three further gates before it is touched:

1. It is not the main repository checkout.
2. It matches `~/worktree-worker<N>` exactly (the paths `parallel-setup` creates).
3. It is still a registered worktree of this repository.

Anything else is skipped with a message. A path the user never selected is never
removed, even if it looks like a parallel-dev worktree.

### Uncommitted Changes

`git worktree remove` is called **without** `--force` by default, so Git itself
refuses to delete a dirty worktree. Before removing, the worktree is checked with
`git status --porcelain`:

- **Clean** → removed normally.
- **Dirty** → skipped, with instructions to commit or stash.
- **Dirty and `FORCE_DISCARD=yes`** → removed with `--force`, but only when the
  user explicitly agreed to discard the changes at step 2.

`--force` also drops branches that are not merged, so treat that confirmation as
irreversible.

### Confirmation

Always asks for confirmation (step 2) before proceeding:
- Which tmux session to kill
- Which worktrees to remove (shows status including uncommitted changes)
- User acknowledges that `--force` will be used for removal

## Common Scenarios

### Scenario 1: Clean Finish (All PRs Created)

```bash
# All workers completed their tasks and created PRs
/parallel-cleanup
# Removes everything, back to develop
```

### Scenario 2: Partial Cleanup (Keep Some Workers)

```bash
# Worker 1 and 2 finished, but Worker 3 still working
# Manually handle:
git worktree remove ~/worktree-worker1
git worktree remove ~/worktree-worker2
# Keep worker3 for later
```

### Scenario 3: Emergency Stop

```bash
# Something went wrong, need to stop everything
/parallel-cleanup
# Force removes all, even with uncommitted changes
# (After confirming with user)
```

## What Gets Removed

### Worktree Directories
- `~/worktree-worker1/`
- `~/worktree-worker2/`
- `~/worktree-worker3/`
- etc.

### Git Metadata
- `.git/worktrees/` entries
- Branch references for removed worktrees

### tmux Resources
- tmux session `parallel-dev`
- All windows within the session
- All panes and processes

## What Gets Preserved

### Main Repository
- Your main working directory
- All committed code
- Feature branches (even if worktree is removed)

### Remote Branches
- Pushed feature branches remain on GitHub
- PRs remain intact

### Other Sessions
- Other tmux sessions are not affected
- Other Codex sessions continue running

## Troubleshooting

### "worktree contains modified or untracked files"

```bash
# Option 1: Commit changes first
cd ~/worktree-worker1
git add .
git commit -m "WIP: Save progress"
git push

# Option 2: Force remove (loses changes)
git worktree remove ~/worktree-worker1 --force
```

### "cannot remove a locked working tree"

```bash
# Unlock and remove
git worktree unlock ~/worktree-worker1
git worktree remove ~/worktree-worker1
```

### "no such session: parallel-dev"

```bash
# List actual sessions
tmux list-sessions

# Use correct name
/parallel-cleanup actual-session-name
```

### Stale worktree metadata

```bash
# If worktree directory deleted manually
git worktree prune
```

## Manual Cleanup (If Skill Fails)

### Remove tmux session

```bash
tmux kill-session -t parallel-dev
```

### Remove worktrees

```bash
# List worktrees
git worktree list

# Remove one by one
git worktree remove ~/worktree-worker1 --force
git worktree remove ~/worktree-worker2 --force
git worktree remove ~/worktree-worker3 --force

# Clean up stale metadata
git worktree prune
```

### Return to develop

```bash
cd ~/work/english_learn_app
git checkout develop
```

## Best Practices

### Before Cleanup

1. **Ensure all work is committed**
   ```bash
   cd ~/worktree-worker1 && git status
   cd ~/worktree-worker2 && git status
   cd ~/worktree-worker3 && git status
   ```

2. **Push all branches**
   ```bash
   # In each worktree
   git push -u origin <branch-name>
   ```

3. **Create PRs if ready**
   ```bash
   # Use /review-fix or gh pr create
   ```

### After Cleanup

1. **Verify worktrees removed**
   ```bash
   git worktree list  # Should only show main repo
   ```

2. **Verify tmux session gone**
   ```bash
   tmux list-sessions  # Should not show parallel-dev
   ```

3. **Update develop branch**
   ```bash
   git pull origin develop
   ```

## See Also

- `/parallel-setup` - Setup parallel development environment
- `/start` - Start development from GitHub Issue
- `/review-fix` - Review and fix PR feedback
