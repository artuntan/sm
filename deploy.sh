#!/bin/bash
set -e

# ── SM Deployment Script ──────────────────────────────────
# Builds Docker image, pushes to ECR, deploys to EC2
#
# Usage:
#   ./deploy.sh [stage]     # default: dev
#   ./deploy.sh production
# ──────────────────────────────────────────────────────────

STAGE="${1:-dev}"
REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_NAME="Sm-${STAGE}"

echo "🚀 Deploying SM (stage: ${STAGE}, region: ${REGION})"
echo ""

# ── Step 1: CDK Deploy (infra) ───────────────────────────
echo "📦 Step 1: Deploying infrastructure..."
cd infra
npm run deploy -- -c stage="${STAGE}"
cd ..

# ── Step 2: Get outputs ──────────────────────────────────
echo ""
echo "📋 Step 2: Reading stack outputs..."
ECR_REPO=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepoUri'].OutputValue" --output text)
EC2_IP=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='AppServerIp'].OutputValue" --output text)
DB_ENDPOINT=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" --output text)
DB_SECRET_ARN=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='DbCredentialsArn'].OutputValue" --output text)
APP_SECRET_ARN=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='AppSecretsArn'].OutputValue" --output text)

echo "  ECR: ${ECR_REPO}"
echo "  EC2: ${EC2_IP}"
echo "  RDS: ${DB_ENDPOINT}"

# ── Step 3: Build & push Docker image ────────────────────
echo ""
echo "🐳 Step 3: Building and pushing Docker image..."
aws ecr get-login-password --region "${REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

docker build --platform linux/arm64 -t sm-app ./app
docker tag sm-app:latest "${ECR_REPO}:latest"
docker push "${ECR_REPO}:latest"

# ── Step 4: Deploy to EC2 via SSM ────────────────────────
echo ""
echo "🖥️  Step 4: Deploying to EC2..."
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=${STACK_NAME}" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" --output text)

# Build the run command with secrets from Secrets Manager
aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    \"aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com\",
    \"docker pull ${ECR_REPO}:latest\",
    \"docker stop sm-app 2>/dev/null || true\",
    \"docker rm sm-app 2>/dev/null || true\",
    \"DB_CREDS=\\$(aws secretsmanager get-secret-value --secret-id ${DB_SECRET_ARN} --query SecretString --output text)\",
    \"APP_SECRETS=\\$(aws secretsmanager get-secret-value --secret-id ${APP_SECRET_ARN} --query SecretString --output text)\",
    \"DB_USER=\\$(echo \\$DB_CREDS | jq -r .username)\",
    \"DB_PASS=\\$(echo \\$DB_CREDS | jq -r .password)\",
    \"docker run -d --name sm-app --restart unless-stopped -p 80:3000 -e DATABASE_URL=postgresql://\\$DB_USER:\\$DB_PASS@${DB_ENDPOINT}:5432/smdb -e BETTER_AUTH_SECRET=\\$(echo \\$APP_SECRETS | jq -r .BETTER_AUTH_SECRET) -e BETTER_AUTH_URL=http://${EC2_IP} -e BOOTSTRAP_ADMIN_EMAIL=\\$(echo \\$APP_SECRETS | jq -r .BOOTSTRAP_ADMIN_EMAIL) -e META_ACCESS_TOKEN=\\$(echo \\$APP_SECRETS | jq -r .META_ACCESS_TOKEN) -e META_IG_USER_ID=\\$(echo \\$APP_SECRETS | jq -r .META_IG_USER_ID) -e META_GRAPH_API_VERSION=v23.0 -e APIFY_API_TOKEN=\\$(echo \\$APP_SECRETS | jq -r .APIFY_API_TOKEN) -e YOUTUBE_API_KEY=\\$(echo \\$APP_SECRETS | jq -r .YOUTUBE_API_KEY) ${ECR_REPO}:latest\"
  ]" \
  --output text --query "Command.CommandId"

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "  App:      http://${EC2_IP}"
echo "  Database: ${DB_ENDPOINT} (private, EC2 only)"
echo ""
echo "  To check status:  ssh ec2-user@${EC2_IP} 'docker logs sm-app'"
echo "  To push schema:   Run from EC2: docker exec sm-app npx drizzle-kit push"
echo ""
