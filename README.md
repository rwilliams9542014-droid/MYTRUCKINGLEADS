# MyTruckingLeads Local/GitHub Sync

Use these commands from the project folder:

```powershell
cd "C:\Users\RONNY W\Desktop\MYTRUCKINGLEADS.COM\mytruckingleads.com"
```

## Check Status First

Always run this before pulling or pushing:

```powershell
git status
```

If it says `working tree clean`, your local files have no uncommitted changes.

## GitHub To Local

Use this when you changed files on GitHub and want those changes on this computer:

```powershell
git pull origin main
```

If Git says there are local modified files, stop and review them before pulling.

## Local To GitHub

Use this when you changed files locally and want them on GitHub:

```powershell
git status
git add .
git commit -m "Describe what changed"
git push origin main
```

Railway deploys from GitHub, so pushing to `main` is what sends the code live.

## Safe Daily Workflow

Before editing:

```powershell
git status
git pull origin main
```

After editing:

```powershell
git status
git add .
git commit -m "Describe what changed"
git push origin main
```

## If You Are Unsure

If `git status` shows modified files and you do not know what they are, do not run `git add .` yet. Review first:

```powershell
git diff
```

Then decide whether to keep, commit, or discard those changes.
