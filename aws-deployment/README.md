# AWS Deployment Guide for Multilingual Mandi

This guide provides step-by-step instructions for deploying the Multilingual Mandi application on AWS using free tier resources.

## Prerequisites

1. **AWS Account**: Create a free AWS account at [aws.amazon.com](https://aws.amazon.com)
2. **AWS CLI**: Install and configure AWS CLI
   ```bash
   # Install AWS CLI
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   
   # Configure credentials
   aws configure
   ```
3. **GitHub Repository**: Fork or create a repository with the project code
4. **Node.js**: Version 18.x or later

## Free Tier Resources Used

This deployment is optimized for AWS Free Tier and includes:

- **AWS Lambda**: 1M free requests per month, 400,000 GB-seconds compute time
- **API Gateway**: 1M API calls per month
- **S3**: 5GB storage, 20,000 GET requests, 2,000 PUT requests
- **CloudWatch**: 10 custom metrics, 10 alarms, 5GB log ingestion
- **AWS Amplify**: 1,000 build minutes per month, 15GB served per month

## Deployment Steps

### 1. Prepare the Repository

Ensure your GitHub repository contains:
- Frontend code in `/frontend` directory
- Backend code in `/backend` directory
- `amplify.yml` build configuration
- AWS deployment files in `/aws-deployment`

### 2. Deploy Infrastructure

```bash
# Clone the repository
git clone <your-repo-url>
cd multilingual-mandi

# Navigate to deployment directory
cd aws-deployment

# Make deploy script executable (Linux/Mac)
chmod +x deploy.sh

# Run deployment
./deploy.sh dev us-east-1 https://github.com/your-username/multilingual-mandi main
```

### 3. Configure Environment Variables

After deployment, update the following environment variables in AWS Amplify:

```
REACT_APP_API_URL=<your-api-gateway-url>
REACT_APP_WS_URL=<your-websocket-url>
REACT_APP_ENVIRONMENT=dev
```

### 4. Upload Sample Data

Upload the CSV data file to the S3 bucket:

```bash
# Get bucket name from CloudFormation outputs
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name multilingual-mandi-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
    --output text)

# Upload sample data
aws s3 cp ../backend/data/mandi_prices.csv s3://$BUCKET_NAME/data/
aws s3 cp ../backend/data/demo_scenarios.json s3://$BUCKET_NAME/data/
```

### 5. Configure AWS Bedrock Access

Enable AWS Bedrock in your region and request access to Claude models:

1. Go to AWS Bedrock Console
2. Navigate to "Model access" in the left sidebar
3. Request access to:
   - Anthropic Claude 3 Sonnet
   - Anthropic Claude 3 Haiku
4. Wait for approval (usually instant for free tier)

### 6. Test the Deployment

1. **Frontend**: Visit the Amplify app URL
2. **API**: Test the health endpoint:
   ```bash
   curl https://<your-api-gateway-url>/health
   ```
3. **Demo Data**: Test the demo endpoints:
   ```bash
   curl https://<your-api-gateway-url>/api/v1/demo/stats
   ```

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AWS Amplify   │    │   API Gateway    │    │  AWS Lambda     │
│   (Frontend)    │───▶│   (REST API)     │───▶│   (Backend)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  CloudWatch      │    │   AWS Bedrock   │
                       │  (Monitoring)    │    │   (AI Models)   │
                       └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │      S3         │
                                               │  (Data Storage) │
                                               └─────────────────┘
```

## Cost Optimization

### Free Tier Limits
- **Lambda**: Stay under 1M requests/month and 400,000 GB-seconds
- **API Gateway**: Limit to 1M API calls/month
- **S3**: Keep storage under 5GB
- **Amplify**: Stay under 1,000 build minutes/month

### Monitoring Costs
Use the CloudWatch dashboard to monitor:
- Lambda invocations and duration
- API Gateway request count
- S3 storage usage
- Amplify build minutes

### Cost Alerts
Set up billing alerts:
```bash
aws budgets create-budget \
    --account-id <your-account-id> \
    --budget file://budget-config.json
```

## Troubleshooting

### Common Issues

1. **Lambda Timeout**: Increase timeout in CloudFormation template
2. **Memory Issues**: Increase Lambda memory allocation
3. **API Gateway 502**: Check Lambda function logs in CloudWatch
4. **Amplify Build Fails**: Check build logs in Amplify Console
5. **Bedrock Access Denied**: Ensure model access is approved

### Debugging

1. **Check CloudWatch Logs**:
   ```bash
   aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/multilingual-mandi"
   ```

2. **View Lambda Metrics**:
   ```bash
   aws cloudwatch get-metric-statistics \
       --namespace AWS/Lambda \
       --metric-name Invocations \
       --dimensions Name=FunctionName,Value=multilingual-mandi-dev-backend \
       --start-time 2024-01-01T00:00:00Z \
       --end-time 2024-01-02T00:00:00Z \
       --period 3600 \
       --statistics Sum
   ```

3. **Test API Locally**:
   ```bash
   cd backend
   npm start
   # Test endpoints on http://localhost:5000
   ```

## Security Considerations

1. **IAM Roles**: Use least privilege principle
2. **API Keys**: Implement rate limiting
3. **CORS**: Configure appropriate origins
4. **Environment Variables**: Store secrets in AWS Systems Manager Parameter Store
5. **VPC**: Consider VPC deployment for production

## Scaling Beyond Free Tier

When you outgrow free tier limits:

1. **Lambda**: Consider provisioned concurrency
2. **API Gateway**: Implement caching
3. **Database**: Migrate from S3 to DynamoDB or RDS
4. **CDN**: Add CloudFront distribution
5. **Load Balancing**: Use Application Load Balancer

## Support

For deployment issues:
1. Check AWS CloudFormation events
2. Review CloudWatch logs
3. Consult AWS documentation
4. Use AWS Support (Basic tier included)

## Cleanup

To avoid charges, delete resources when not needed:

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name multilingual-mandi-dev

# Delete S3 buckets (after emptying them)
aws s3 rm s3://<bucket-name> --recursive
aws s3 rb s3://<bucket-name>
```