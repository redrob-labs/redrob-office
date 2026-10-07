variable "region" {
  description = "AWS region for every resource."
  type        = string
  default     = "ap-northeast-2"
}

variable "name" {
  description = "Prefix for resource names."
  type        = string
  default     = "redrob-office-sync"
}

variable "zone_name" {
  description = "Route 53 hosted zone that holds the two hosts, e.g. redrob.ai."
  type        = string
}

variable "sync_host" {
  description = "HTTPS host for the API (REDROB_SYNC_URL), e.g. sync.office.redrob.ai."
  type        = string
}

variable "live_host" {
  description = "HTTPS host for live documents over WebSocket (REDROB_SYNC_LIVE_URL), e.g. live.office.redrob.ai."
  type        = string
}

variable "image_tag" {
  description = "Tag of the sync image in this module's ECR repository."
  type        = string
}

variable "console_issuer" {
  description = "Token issuer the service trusts (SYNC_ISSUER), an https URL."
  type        = string
  default     = "https://console.redrob.ai"

  validation {
    condition     = startswith(var.console_issuer, "https://")
    error_message = "The issuer must be an https URL."
  }
}

variable "console_jwks_url" {
  description = "Console's JWKS (SYNC_JWKS_URL), an https URL."
  type        = string
  default     = "https://console.redrob.ai/.well-known/jwks.json"

  validation {
    condition     = startswith(var.console_jwks_url, "https://")
    error_message = "The JWKS URL must be an https URL."
  }
}

variable "audience" {
  description = "Audience the tokens must carry (SYNC_AUDIENCE)."
  type        = string
  default     = "redrob-office-sync"
}

variable "vpc_cidr" {
  description = "CIDR of the VPC; two public and two private /20s are cut from it."
  type        = string
  default     = "10.40.0.0/16"
}

variable "task_cpu" {
  description = "Fargate CPU units for the task."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate memory (MiB) for the task."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Running tasks. Live documents are rooms in one process (no Redis extension yet), so this is 1."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count == 1
    error_message = "Live documents need every editor of a file in the same process; run one task until the Hocuspocus Redis extension is added."
  }
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "RDS storage, GiB (grows automatically up to db_max_allocated_storage)."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Upper bound for RDS storage autoscaling, GiB."
  type        = number
  default     = 200
}

variable "db_multi_az" {
  description = "Standby in a second availability zone."
  type        = bool
  default     = true
}

variable "max_file_bytes" {
  description = "Largest upload the service accepts (SYNC_MAX_FILE_BYTES)."
  type        = number
  default     = 104857600
}

variable "log_retention_days" {
  description = "CloudWatch retention for the service's logs."
  type        = number
  default     = 30
}

variable "alarm_topic_arn" {
  description = "SNS topic for alarms; empty means alarms record state but notify no one."
  type        = string
  default     = ""
}
