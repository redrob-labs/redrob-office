# Redrob Office sync on AWS. Plan only: nothing here has been applied, and
# .github/workflows/infra.yml never applies. See README.md before changing that.
terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.82.2"
    }
  }

  # State lives in S3 with a DynamoDB lock; the bucket and table are given at
  # init time (-backend-config=backend.hcl), so no account id is committed.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "redrob-office"
      Component = "sync"
      ManagedBy = "terraform"
    }
  }
}
