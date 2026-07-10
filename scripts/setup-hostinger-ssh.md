# Hostinger SSH setup (one-time)

Enables `./deploy-live.sh` from your Mac and GitHub Actions auto-deploy.

## 1. Add this public key in Hostinger

**hPanel → Advanced → SSH Access → SSH keys → Add**

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMa7Gj36YDSVlbRdFLdcAA2unaJ8UeFagvUGaoyh626T mubarakali@mac
```

## 2. GitHub Actions secrets (optional auto-deploy)

Repo **bmprofca/bmtaxtoolweb** → Settings → Secrets → Actions:

| Secret | Value |
|--------|--------|
| `DEPLOY_SSH_HOST` | `191.96.159.222` |
| `DEPLOY_SSH_USER` | `u278432002` |
| `DEPLOY_SSH_KEY` | Contents of `~/.ssh/id_ed25519` (private key) |
| `DEPLOY_SSH_PORT` | `65002` |

Connection from Mac (hPanel SSH details):

```bash
ssh -p 65002 u278432002@191.96.159.222
```

Or use the alias after `~/.ssh/config` is set: `ssh hostinger-bmtax`

## 3. Deploy

**From Mac:** `cd Balancesheet && ./deploy-live.sh`

**From Hostinger Browser SSH:**

```bash
bash ~/bmtaxtoolweb/scripts/hostinger-deploy.sh
```
