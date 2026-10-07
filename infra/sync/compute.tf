# The service: one Fargate task running services/sync's image, with the
# API on 8787 and live documents on 8788.

resource "aws_ecr_repository" "sync" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "sync" {
  repository = aws_ecr_repository.sync.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "sync" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull the image, write logs, read the database password.
resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.this.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "execution_secret" {
  name   = "db-password"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secret.json
}

# Task role: the file bucket and nothing else (the service holds no keys).
resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task_files" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.files.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.files.arn}/*"]
  }
}

resource "aws_iam_role_policy" "task_files" {
  name   = "files-bucket"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_files.json
}

locals {
  image = "${aws_ecr_repository.sync.repository_url}:${var.image_tag}"
  environment = {
    NODE_ENV            = "production"
    SYNC_HOST           = "0.0.0.0"
    SYNC_HTTP_PORT      = "8787"
    SYNC_COLLAB_PORT    = "8788"
    SYNC_TRUST_PROXY    = "1"
    SYNC_JWKS_URL       = var.console_jwks_url
    SYNC_ISSUER         = var.console_issuer
    SYNC_AUDIENCE       = var.audience
    SYNC_DB_CA_FILE     = "/srv/rds-global-bundle.pem"
    SYNC_MAX_FILE_BYTES = tostring(var.max_file_bytes)
    # the password comes from PGPASSWORD (the RDS-managed secret), never the URL
    DATABASE_URL        = "postgres://${aws_db_instance.this.username}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}"
    S3_BUCKET           = aws_s3_bucket.files.bucket
    S3_REGION           = var.region
    S3_FORCE_PATH_STYLE = "0"
  }
}

resource "aws_ecs_task_definition" "sync" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "sync"
    image     = local.image
    essential = true
    portMappings = [
      { containerPort = 8787, protocol = "tcp", name = "api" },
      { containerPort = 8788, protocol = "tcp", name = "live" },
    ]
    environment = [for k, v in local.environment : { name = k, value = v }]
    secrets = [{
      name      = "PGPASSWORD"
      valueFrom = "${aws_db_instance.this.master_user_secret[0].secret_arn}:password::"
    }]
    readonlyRootFilesystem = true
    # SIGTERM drains (services/sync/src/main.ts); ECS waits this long before SIGKILL
    stopTimeout = 30
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.sync.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "sync"
      }
    }
  }])
}

resource "aws_ecs_service" "sync" {
  name            = var.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.sync.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Live rooms live in one process: a deploy stops the old task before the new
  # one starts, so two tasks never split a room. Clients reconnect on their own.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  health_check_grace_period_seconds = 60
  enable_execute_command            = false
  propagate_tags                    = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "sync"
    container_port   = 8787
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.live.arn
    container_name   = "sync"
    container_port   = 8788
  }

  depends_on = [aws_lb_listener_rule.api, aws_lb_listener_rule.live]
}

# Alarms: the API failing, the task unhealthy, the database short of room.
locals {
  alarm_actions = var.alarm_topic_arn == "" ? [] : [var.alarm_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.name}-api-5xx"
  alarm_description   = "The sync API answered 5xx more than 10 times in 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy" {
  alarm_name          = "${var.name}-api-unhealthy"
  alarm_description   = "No healthy sync task behind the API for 3 minutes (readiness failing)."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${var.name}-db-storage"
  alarm_description   = "Under 2 GiB free on the sync database."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 2147483648
  comparison_operator = "LessThanThreshold"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.identifier
  }
  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}
