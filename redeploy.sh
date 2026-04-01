#!/bin/bash
set -e

# ── SM Quick Redeploy ────────────────────────────────────
# Rebuilds Docker image, pushes to ECR, restarts on EC2.
# Use this after code changes. No infra changes.
#
# Usage: ./redeploy.sh
# ──────────────────────────────────────────────────────────

REGION="eu-central-1"
ACCOUNT_ID="334856751876"
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/sm-app-production"
INSTANCE_ID="i-0251cbd10f6d13cbc"
PARAM_PREFIX="/sm/production"

echo "🚀 Redeploying SM to production..."

# Step 1: Build
echo "🐳 Building Docker image..."
docker build --platform linux/arm64 -t sm-app ./app

# Step 2: Push
echo "📤 Pushing to ECR..."
aws ecr get-login-password --region "${REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker tag sm-app:latest "${ECR_REPO}:latest"
docker push "${ECR_REPO}:latest"

# Step 3: Restart on EC2
echo "🖥️  Restarting on EC2..."
aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "AWS-RunShellScript" \
  --region "${REGION}" \
  --parameters commands="[
    \"aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com\",
    \"docker pull ${ECR_REPO}:latest\",
    \"docker stop sm-app 2>/dev/null || true\",
    \"docker rm sm-app 2>/dev/null || true\",
    \"DB_URL=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/DATABASE_URL --query Parameter.Value --output text --region ${REGION})\",
    \"AUTH_SECRET=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/BETTER_AUTH_SECRET --query Parameter.Value --output text --region ${REGION})\",
    \"AUTH_URL=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/BETTER_AUTH_URL --query Parameter.Value --output text --region ${REGION})\",
    \"DB_CA_CERT=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/DATABASE_CA_CERT --query Parameter.Value --output text --region ${REGION})\",
    \"ADMIN_EMAIL=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/BOOTSTRAP_ADMIN_EMAIL --query Parameter.Value --output text --region ${REGION})\",
    \"META_TOKEN=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/META_ACCESS_TOKEN --query Parameter.Value --output text --region ${REGION})\",
    \"META_IG=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/META_IG_USER_ID --query Parameter.Value --output text --region ${REGION})\",
    \"APIFY=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/APIFY_API_TOKEN --query Parameter.Value --output text --region ${REGION})\",
    \"YT=\$(aws ssm get-parameter --name ${PARAM_PREFIX}/YOUTUBE_API_KEY --query Parameter.Value --output text --region ${REGION})\",
    \"docker run -d --name sm-app --restart unless-stopped -p 80:3000 -e DATABASE_URL=\\\"\$DB_URL\\\" -e DATABASE_CA_CERT=\\\"\$DB_CA_CERT\\\" -e BETTER_AUTH_SECRET=\\\"\$AUTH_SECRET\\\" -e BETTER_AUTH_URL=\\\"\$AUTH_URL\\\" -e BOOTSTRAP_ADMIN_EMAIL=\\\"\$ADMIN_EMAIL\\\" -e META_ACCESS_TOKEN=\\\"\$META_TOKEN\\\" -e META_IG_USER_ID=\\\"\$META_IG\\\" -e META_GRAPH_API_VERSION=v23.0 -e APIFY_API_TOKEN=\\\"\$APIFY\\\" -e YOUTUBE_API_KEY=\\\"\$YT\\\" ${ECR_REPO}:latest\"
  ]" \
  --output text --query "Command.CommandId"

echo ""
echo "✅ Deployed! Changes live in ~30 seconds."
echo "   https://marketing.type-of.com"
