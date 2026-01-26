#!/bin/bash

# Multilingual Mandi AWS Deployment Script
# This script deploys the application using AWS CloudFormation and Amplify

set -e

# Configuration
PROJECT_NAME="multilingual-mandi"
ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-1}
GITHUB_REPO=${3:-"https://github.com/your-username/multilingual-mandi"}
GITHUB_BRANCH=${4:-main}

echo "🚀 Starting deployment of Multilingual Mandi"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Repository: $GITHUB_REPO"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if user is authenticated
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Create S3 bucket for CloudFormation templates (if it doesn't exist)
TEMPLATE_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-templates-$(aws sts get-caller-identity --query Account --output text)"
if ! aws s3 ls "s3://$TEMPLATE_BUCKET" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "📦 Creating S3 bucket for templates: $TEMPLATE_BUCKET"
    aws s3 mb "s3://$TEMPLATE_BUCKET" --region $REGION
fi

# Upload CloudFormation template
echo "📤 Uploading CloudFormation template..."
aws s3 cp cloudformation-template.yaml "s3://$TEMPLATE_BUCKET/cloudformation-template.yaml"

# Deploy CloudFormation stack
STACK_NAME="${PROJECT_NAME}-${ENVIRONMENT}"
echo "🏗️  Deploying CloudFormation stack: $STACK_NAME"

aws cloudformation deploy \
    --template-file cloudformation-template.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides \
        ProjectName=$PROJECT_NAME \
        Environment=$ENVIRONMENT \
        GitHubRepo=$GITHUB_REPO \
        GitHubBranch=$GITHUB_BRANCH \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION

# Get stack outputs
echo "📋 Getting stack outputs..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text \
    --region $REGION)

APP_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppUrl`].OutputValue' \
    --output text \
    --region $REGION)

echo "✅ Deployment completed successfully!"
echo ""
echo "🌐 Application URLs:"
echo "Frontend: $APP_URL"
echo "API: $API_URL"
echo ""
echo "📊 Monitoring:"
echo "CloudWatch Dashboard: https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=$PROJECT_NAME-$ENVIRONMENT-dashboard"
echo ""
echo "🔧 Next steps:"
echo "1. Configure GitHub repository access in Amplify Console"
echo "2. Trigger a build in Amplify to deploy the frontend"
echo "3. Upload sample data to the S3 bucket"
echo "4. Test the API endpoints"