# Sync on AWS (plan only)

Terraform for running `services/sync` on AWS. **Nothing here has been
applied.** `AGENTS.md` says there is no production deployment, and that stays
true until a person decides otherwise. `.github/workflows/infra.yml` checks
formatting and validity, and writes a plan only when run by hand with a
read-only role. It never applies.

## What it makes

- Network:
  - A VPC with two public and two private subnets across two zones.
  - One NAT gateway, and an S3 gateway endpoint so file bytes do not cross the NAT.
- Load balancer:
  - An Application Load Balancer with one ACM certificate (DNS-validated in Route 53) for two hosts.
  - `sync_host` serves the API on port 8787, health-checked on `/ready`.
  - `live_host` serves live documents over WebSocket on port 8788. The idle timeout is one hour.
  - HTTP redirects to HTTPS. TLS 1.2 or later.
- The service:
  - ECS Fargate, one task, from an immutable, scanned ECR repository.
  - JSON logs go to CloudWatch, with Container Insights on.
- RDS Postgres 16:
  - Multi-AZ, encrypted, TLS forced, 14 days of backups, deletion protection.
  - The password is made and held by RDS in Secrets Manager. It reaches the task as `PGPASSWORD` and never appears in Terraform state or the URL.
  - The service verifies the server against RDS's CA bundle, which is baked into the image (`SYNC_DB_CA_FILE`).
- S3 for file versions:
  - Private, owner-enforced, encrypted and TLS-only, with versioning and old versions expired after 30 days.
  - The task reaches it through its role; the service holds no keys.
- Alarms for API 5xx, no healthy task, and low database storage. They notify `alarm_topic_arn` when it is set.

## Why one task

Live documents are Hocuspocus rooms in one process. Two tasks would put two
editors of the same file in different rooms. `desired_count` is held to 1, and
a deploy stops the old task before starting the new one; clients reconnect on
their own. Running more needs the Hocuspocus Redis extension, which would also
make the per-instance rate limits shared.

## Using it

```sh
cp backend.hcl.example backend.hcl            # your state bucket and lock table
cp terraform.tfvars.example terraform.tfvars  # hosts, zone, image tag
terraform init -backend-config=backend.hcl
terraform plan
```

The image is `services/sync/Dockerfile`, pushed to the `ecr_repository_url`
output with the `image_tag` you set. The outputs `sync_url` and
`sync_live_url` are what packaged builds bake in as `REDROB_SYNC_URL` and
`REDROB_SYNC_LIVE_URL`.

Before any apply, Console must issue tokens for the audience
`redrob-office-sync` (see `docs/console-requests/office-sync-identity.md`).
Without that, the service starts but no one can sign in to it.
