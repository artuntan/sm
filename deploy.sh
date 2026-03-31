#!/bin/bash
set -e

# ── SM Deployment Script ──────────────────────────────────
# Deploys CDK infra, builds Docker image, pushes to ECR, runs on EC2
#
# Usage:
#   ./deploy.sh              # default: dev
#   ./deploy.sh production   # production deployment
# ──────────────────────────────────────────────────────────

STAGE="${1:-dev}"
REGION="${AWS_DEFAULT_REGION:-eu-central-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_NAME="Sm-${STAGE}"
PARAM_PREFIX="/sm/${STAGE}"

echo "🚀 Deploying SM (stage: ${STAGE}, region: ${REGION})"
echo ""

# ── Step 1: CDK Deploy ───────────────────────────────────
echo "📦 Step 1: Deploying infrastructure..."
cd infra
npx cdk deploy "${STACK_NAME}" -c stage="${STAGE}" --require-approval broadening
cd ..

# ── Step 2: Get outputs ──────────────────────────────────
echo ""
echo "📋 Step 2: Reading stack outputs..."
ECR_REPO=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepoUri'].OutputValue" --output text --region "${REGION}")
EC2_IP=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='AppServerIp'].OutputValue" --output text --region "${REGION}")

echo "  ECR: ${ECR_REPO}"
echo "  EC2: ${EC2_IP}"

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
  --query "Reservations[0].Instances[0].InstanceId" --output text --region "${REGION}")

if [ "${INSTANCE_ID}" = "None" ] || [ -z "${INSTANCE_ID}" ]; then
  echo "❌ No running EC2 instance found for stack ${STACK_NAME}"
  echo "   Wait a few minutes after CDK deploy for the instance to start."
  exit 1
fi

# Fetch params from SSM and run Docker container
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "AWS-RunShellScript" \
  --region "${REGION}" \
  --parameters commands="[
    \"set -e\",
    \"aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com\",
    \"docker pull ${ECR_REPO}:latest\",
    \"docker stop sm-app 2>/dev/null || true\",
    \"docker rm sm-app 2>/dev/null || true\",
    \"DB_URL=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/DATABASE_URL --query Parameter.Value --output text --region ${REGION})\",
    \"AUTH_SECRET=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/BETTER_AUTH_SECRET --query Parameter.Value --output text --region ${REGION})\",
    \"AUTH_URL=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/BETTER_AUTH_URL --query Parameter.Value --output text --region ${REGION})\",
    \"ADMIN_EMAIL=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/BOOTSTRAP_ADMIN_EMAIL --query Parameter.Value --output text --region ${REGION})\",
    \"META_TOKEN=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/META_ACCESS_TOKEN --query Parameter.Value --output text --region ${REGION})\",
    \"META_IG=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/META_IG_USER_ID --query Parameter.Value --output text --region ${REGION})\",
    \"APIFY=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/APIFY_API_TOKEN --query Parameter.Value --output text --region ${REGION})\",
    \"YT=\\$(aws ssm get-parameter --name ${PARAM_PREFIX}/YOUTUBE_API_KEY --query Parameter.Value --output text --region ${REGION})\",
    \"docker run -d --name sm-app --restart unless-stopped -p 3000:3000 -e DATABASE_URL=\\$DB_URL -e BETTER_AUTH_SECRET=\\$AUTH_SECRET -e BETTER_AUTH_URL=\\$AUTH_URL -e BOOTSTRAP_ADMIN_EMAIL=\\$ADMIN_EMAIL -e META_ACCESS_TOKEN=\\$META_TOKEN -e META_IG_USER_ID=\\$META_IG -e META_GRAPH_API_VERSION=v23.0 -e APIFY_API_TOKEN=\\$APIFY -e YOUTUBE_API_KEY=\\$YT ${ECR_REPO}:latest\",
    \"systemctl start caddy\"
  ]" \
  --output text --query "Command.CommandId")

echo "  SSM Command: ${COMMAND_ID}"
echo "  Waiting for deployment..."
aws ssm wait command-executed --command-id "${COMMAND_ID}" --instance-id "${INSTANCE_ID}" --region "${REGION}" 2>/dev/null || true
sleep 5

echo ""
echo "✅ Deployment complete!"
echo ""
echo "  App:    https://marketing.type-of.com (after DNS)"
echo "  Direct: http://${EC2_IP}:3000"
echo ""
echo "  📌 DNS Setup (Namecheap):"
echo "     Type: A | Host: marketing | Value: ${EC2_IP}"
echo ""
echo "  📌 Update secrets:"
echo "     aws ssm put-parameter --name ${PARAM_PREFIX}/DATABASE_URL --value 'postgresql://...' --overwrite --region ${REGION}"
echo "     aws ssm put-parameter --name ${PARAM_PREFIX}/BETTER_AUTH_SECRET --value '\$(openssl rand -base64 32)' --overwrite --region ${REGION}"
echo ""
