output "sync_url" {
  description = "REDROB_SYNC_URL for packaged builds."
  value       = "https://${var.sync_host}"
}

output "sync_live_url" {
  description = "REDROB_SYNC_LIVE_URL for packaged builds."
  value       = "wss://${var.live_host}"
}

output "ecr_repository_url" {
  description = "Push services/sync's image here, tagged with image_tag."
  value       = aws_ecr_repository.sync.repository_url
}

output "files_bucket" {
  description = "The bucket holding file versions."
  value       = aws_s3_bucket.files.bucket
}

output "log_group" {
  description = "CloudWatch log group of the service (JSON lines)."
  value       = aws_cloudwatch_log_group.sync.name
}
